import textToSpeech from "@google-cloud/text-to-speech";
import type { TtsFormat, VoiceInfo } from "@readwebsite/shared";
import { ApiError } from "./errors.js";

export interface SynthesizeInput {
  text: string;
  voice: string;
  rate: number;
  pitch: number;
  format: TtsFormat;
}

export interface SynthesizeOutput {
  audioContent: string;
  contentType: string;
  voice: string;
  fallbackUsed: boolean;
}

export interface TtsProvider {
  listVoices(languageCode: string): Promise<VoiceInfo[]>;
  synthesize(input: SynthesizeInput): Promise<SynthesizeOutput>;
}

const FALLBACK_PREFIXES = ["vi-VN-Chirp3-HD-", "vi-VN-Neural2-", "vi-VN-Wavenet-"];

const STATIC_VI_VOICES: VoiceInfo[] = [
  { id: "vi-VN-Chirp3-HD-Aoede", name: "Vietnamese Chirp3 HD Aoede", languageCode: "vi-VN", gender: "FEMALE", provider: "google", naturalnessRank: 1 },
  { id: "vi-VN-Chirp3-HD-Charon", name: "Vietnamese Chirp3 HD Charon", languageCode: "vi-VN", gender: "MALE", provider: "google", naturalnessRank: 1 },
  { id: "vi-VN-Neural2-A", name: "Vietnamese Neural2 A", languageCode: "vi-VN", gender: "FEMALE", provider: "google", naturalnessRank: 2 },
  { id: "vi-VN-Neural2-D", name: "Vietnamese Neural2 D", languageCode: "vi-VN", gender: "MALE", provider: "google", naturalnessRank: 2 },
  { id: "vi-VN-Wavenet-A", name: "Vietnamese Wavenet A", languageCode: "vi-VN", gender: "FEMALE", provider: "google", naturalnessRank: 3 },
  { id: "vi-VN-Wavenet-D", name: "Vietnamese Wavenet D", languageCode: "vi-VN", gender: "MALE", provider: "google", naturalnessRank: 3 }
];

export class GoogleTtsProvider implements TtsProvider {
  private readonly client = new textToSpeech.TextToSpeechClient();
  private readonly voiceCache = new Map<string, VoiceInfo[]>();

  async listVoices(languageCode: string): Promise<VoiceInfo[]> {
    if (this.voiceCache.has(languageCode)) {
      return this.voiceCache.get(languageCode) ?? [];
    }

    try {
      const [response] = await this.client.listVoices({ languageCode });
      const voices = (response.voices ?? [])
        .map((voice) => ({
          id: voice.name ?? "",
          name: voice.name ?? "",
          languageCode: voice.languageCodes?.[0] ?? languageCode,
          gender: voice.ssmlGender ? String(voice.ssmlGender) : undefined,
          provider: "google" as const,
          naturalnessRank: rankVoice(voice.name ?? "")
        }))
        .filter((voice) => voice.id)
        .sort((a, b) => a.naturalnessRank - b.naturalnessRank || a.name.localeCompare(b.name));

      const resolved = voices.length ? voices : STATIC_VI_VOICES.filter((voice) => voice.languageCode === languageCode);
      this.voiceCache.set(languageCode, resolved);
      return resolved;
    } catch {
      const fallback = STATIC_VI_VOICES.filter((voice) => voice.languageCode === languageCode);
      this.voiceCache.set(languageCode, fallback);
      return fallback;
    }
  }

  async synthesize(input: SynthesizeInput): Promise<SynthesizeOutput> {
    const voices = await this.listVoices("vi-VN");
    const requested = voices.find((voice) => voice.id === input.voice);
    const fallback = voices.find((voice) => FALLBACK_PREFIXES.some((prefix) => voice.id.startsWith(prefix)));
    const voiceName = requested?.id ?? fallback?.id ?? input.voice;

    if (!voiceName) {
      throw new ApiError("voice_unavailable", "No Vietnamese Google TTS voice is available.", 503);
    }

    const [response] = await this.client.synthesizeSpeech({
      input: { text: input.text },
      voice: {
        languageCode: "vi-VN",
        name: voiceName
      },
      audioConfig: {
        audioEncoding: toGoogleEncoding(input.format),
        speakingRate: input.rate,
        pitch: input.pitch
      }
    });

    if (!response.audioContent) {
      throw new ApiError("provider_empty_audio", "Google TTS returned empty audio.", 502);
    }

    const audioContent = Buffer.isBuffer(response.audioContent)
      ? response.audioContent.toString("base64")
      : Buffer.from(response.audioContent as Uint8Array).toString("base64");

    return {
      audioContent,
      contentType: toContentType(input.format),
      voice: voiceName,
      fallbackUsed: voiceName !== input.voice
    };
  }
}

function rankVoice(name: string): number {
  if (name.includes("Chirp3-HD")) {
    return 1;
  }
  if (name.includes("Neural2")) {
    return 2;
  }
  if (name.includes("Wavenet")) {
    return 3;
  }
  return 9;
}

function toGoogleEncoding(format: TtsFormat): "MP3" | "LINEAR16" | "OGG_OPUS" {
  if (format === "linear16") {
    return "LINEAR16";
  }
  if (format === "ogg") {
    return "OGG_OPUS";
  }
  return "MP3";
}

function toContentType(format: TtsFormat): string {
  if (format === "linear16") {
    return "audio/wav";
  }
  if (format === "ogg") {
    return "audio/ogg";
  }
  return "audio/mpeg";
}
