import { describe, expect, it } from "vitest";
import type { VoiceInfo } from "@readwebsite/shared";
import { buildApp } from "./app.js";
import type { ApiConfig } from "./config.js";
import type { SynthesizeInput, TtsProvider } from "./ttsProvider.js";

const config: ApiConfig = {
  host: "127.0.0.1",
  port: 0,
  devTokens: new Set(["test-token"]),
  maxTtsChars: 100,
  rateLimitWindowMs: 60_000,
  rateLimitMax: 2,
  ttsTimeoutMs: 500
};

const voices: VoiceInfo[] = [
  { id: "vi-VN-Chirp3-HD-Aoede", name: "Aoede", languageCode: "vi-VN", gender: "FEMALE", provider: "google", naturalnessRank: 1 }
];

function mockProvider(overrides: Partial<TtsProvider> = {}): TtsProvider {
  return {
    listVoices: async () => voices,
    synthesize: async (input: SynthesizeInput) => ({
      audioContent: Buffer.from(`audio:${input.text}`).toString("base64"),
      contentType: "audio/mpeg",
      voice: input.voice,
      fallbackUsed: false
    }),
    ...overrides
  };
}

describe("API", () => {
  it("returns health", async () => {
    const app = await buildApp({ config, provider: mockProvider() });
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true });
  });

  it("rejects invalid dev token", async () => {
    const app = await buildApp({ config, provider: mockProvider() });
    const response = await app.inject({
      method: "POST",
      url: "/tts/synthesize",
      payload: { text: "Xin chao", voice: voices[0].id, rate: 1, pitch: 0, format: "mp3" }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("invalid_token");
  });

  it("synthesizes and then serves cached audio", async () => {
    const app = await buildApp({ config, provider: mockProvider() });
    const payload = { text: "Xin chao", voice: voices[0].id, rate: 1, pitch: 0, format: "mp3" };

    const first = await app.inject({
      method: "POST",
      url: "/tts/synthesize",
      headers: { "x-dev-token": "test-token" },
      payload
    });
    const second = await app.inject({
      method: "POST",
      url: "/tts/synthesize",
      headers: { "x-dev-token": "test-token" },
      payload
    });

    expect(first.statusCode).toBe(200);
    expect(first.json().cached).toBe(false);
    expect(second.statusCode).toBe(200);
    expect(second.json().cached).toBe(true);
  });

  it("limits text size", async () => {
    const app = await buildApp({ config, provider: mockProvider() });
    const response = await app.inject({
      method: "POST",
      url: "/tts/synthesize",
      headers: { "x-dev-token": "test-token" },
      payload: { text: "x".repeat(101), voice: voices[0].id, rate: 1, pitch: 0, format: "mp3" }
    });

    expect(response.statusCode).toBe(413);
    expect(response.json().error.code).toBe("text_too_long");
  });

  it("reports provider timeout", async () => {
    const app = await buildApp({
      config,
      provider: mockProvider({
        synthesize: async () => new Promise((resolve) => setTimeout(resolve, 1000)) as never
      })
    });
    const response = await app.inject({
      method: "POST",
      url: "/tts/synthesize",
      headers: { "x-dev-token": "test-token" },
      payload: { text: "Cham qua", voice: voices[0].id, rate: 1, pitch: 0, format: "mp3" }
    });

    expect(response.statusCode).toBe(504);
    expect(response.json().error.code).toBe("provider_timeout");
  });
});
