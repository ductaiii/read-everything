import type { ExtractionResult, ReaderChunk, VoiceInfo } from "@readwebsite/shared";

export type ExtensionMessage =
  | { type: "EXTRACT_ACTIVE_TAB"; preferSelection?: boolean }
  | { type: "EXTRACTION_READY"; result: ExtractionResult }
  | { type: "EXTRACTION_FAILED"; error: string }
  | { type: "PLAY_AUDIO"; audioContent: string; contentType: string }
  | { type: "AUDIO_ENDED" }
  | { type: "AUDIO_ERROR"; error: string }
  | { type: "STOP_AUDIO" }
  | { type: "SPEAK_CHROME_TTS"; text: string; rate: number; pitch: number; voice?: string }
  | { type: "CHROME_TTS_ENDED" }
  | { type: "CHROME_TTS_ERROR"; error: string }
  | { type: "STOP_CHROME_TTS" }
  | { type: "HIGHLIGHT_CHUNK"; chunk: ReaderChunk }
  | { type: "CLEAR_HIGHLIGHT" }
  | { type: "READ_COMMAND"; preferSelection?: boolean }
  | { type: "STOP_COMMAND" }
  | { type: "VOICES_READY"; voices: VoiceInfo[] };

export function sendMessage<T = unknown>(message: ExtensionMessage): Promise<T> {
  return chrome.runtime.sendMessage(message);
}
