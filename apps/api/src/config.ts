import "dotenv/config";

export interface ApiConfig {
  host: string;
  port: number;
  devTokens: Set<string>;
  maxTtsChars: number;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  ttsTimeoutMs: number;
}

export function loadConfig(): ApiConfig {
  return {
    host: process.env.HOST ?? "127.0.0.1",
    port: Number(process.env.PORT ?? 4317),
    devTokens: new Set((process.env.DEV_TOKENS ?? "dev-local-token").split(",").map((token) => token.trim()).filter(Boolean)),
    maxTtsChars: Number(process.env.MAX_TTS_CHARS ?? 4500),
    rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
    rateLimitMax: Number(process.env.RATE_LIMIT_MAX ?? 60),
    ttsTimeoutMs: Number(process.env.TTS_TIMEOUT_MS ?? 20_000)
  };
}
