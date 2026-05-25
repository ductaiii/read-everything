export type TtsFormat = "mp3" | "linear16" | "ogg";

export interface VoiceInfo {
  id: string;
  name: string;
  languageCode: string;
  gender?: string;
  provider: "google" | "chrome";
  naturalnessRank: number;
}

export interface ReaderSettings {
  apiBaseUrl: string;
  devToken: string;
  voice: string;
  rate: number;
  pitch: number;
  highlight: boolean;
  useCloudVoice: boolean;
  pronunciationDictionary: PronunciationEntry[];
}

export interface PronunciationEntry {
  from: string;
  to: string;
  enabled: boolean;
}

export interface ExtractionResult {
  title: string;
  url: string;
  text: string;
  source: "selection" | "readability" | "body";
}

export interface ReaderChunk {
  id: string;
  text: string;
  index: number;
  startOffset: number;
  endOffset: number;
}

export interface TtsSynthesizeRequest {
  text: string;
  voice: string;
  rate: number;
  pitch: number;
  format: TtsFormat;
}

export interface TtsSynthesizeResponse {
  audioContent: string;
  contentType: string;
  cacheKey: string;
  cached: boolean;
  voice: string;
  fallbackUsed: boolean;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}
