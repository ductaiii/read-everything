import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import Fastify from "fastify";
import { createTtsCacheKey, type TtsSynthesizeRequest, type TtsSynthesizeResponse } from "@readwebsite/shared";
import { z } from "zod";
import type { ApiConfig } from "./config.js";
import { ApiError, toApiError } from "./errors.js";
import { InMemoryRateLimiter } from "./rateLimit.js";
import { GoogleTtsProvider, type TtsProvider } from "./ttsProvider.js";

const synthesizeSchema = z.object({
  text: z.string().trim().min(1),
  voice: z.string().trim().min(1).default("vi-VN-Chirp3-HD-Aoede"),
  rate: z.number().min(0.5).max(2).default(1),
  pitch: z.number().min(-10).max(10).default(0),
  format: z.enum(["mp3", "linear16", "ogg"]).default("mp3")
});

export interface BuildAppOptions {
  config: ApiConfig;
  provider?: TtsProvider;
}

export async function buildApp({ config, provider = new GoogleTtsProvider() }: BuildAppOptions) {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info"
    }
  });
  const limiter = new InMemoryRateLimiter(config.rateLimitWindowMs, config.rateLimitMax);
  const audioCache = new Map<string, Omit<TtsSynthesizeResponse, "cached">>();

  await app.register(helmet);
  await app.register(cors, {
    origin: true,
    allowedHeaders: ["Content-Type", "X-Dev-Token"]
  });

  app.setErrorHandler((error, _request, reply) => {
    const apiError = toApiError(error);
    reply.status(apiError.statusCode).send({
      error: {
        code: apiError.code,
        message: apiError.message
      }
    });
  });

  app.get("/health", async () => ({
    ok: true,
    service: "readwebsite-api"
  }));

  app.get<{ Querystring: { lang?: string } }>("/voices", async (request) => {
    const languageCode = request.query.lang ?? "vi-VN";
    const voices = await provider.listVoices(languageCode);
    return { voices };
  });

  app.post("/tts/synthesize", async (request, reply) => {
    assertDevToken(request.headers["x-dev-token"], config);
    limiter.assertAllowed(rateLimitKey(request.headers["x-dev-token"], request.ip));

    const body = synthesizeSchema.parse(request.body) as TtsSynthesizeRequest;
    if (body.text.length > config.maxTtsChars) {
      throw new ApiError("text_too_long", `Text exceeds ${config.maxTtsChars} characters.`, 413);
    }

    const cacheKey = createTtsCacheKey(body);
    const cached = audioCache.get(cacheKey);
    if (cached) {
      return reply.send({ ...cached, cached: true });
    }

    const result = await withTimeout(provider.synthesize(body), config.ttsTimeoutMs);
    const response: Omit<TtsSynthesizeResponse, "cached"> = {
      ...result,
      cacheKey
    };

    audioCache.set(cacheKey, response);
    return reply.send({ ...response, cached: false });
  });

  return app;
}

function assertDevToken(value: string | string[] | undefined, config: ApiConfig): void {
  const token = Array.isArray(value) ? value[0] : value;
  if (!token || !config.devTokens.has(token)) {
    throw new ApiError("invalid_token", "Missing or invalid X-Dev-Token.", 401);
  }
}

function rateLimitKey(token: string | string[] | undefined, ip: string): string {
  const normalizedToken = Array.isArray(token) ? token[0] : token;
  return normalizedToken ? `token:${normalizedToken}` : `ip:${ip}`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new ApiError("provider_timeout", "TTS provider timed out.", 504)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
