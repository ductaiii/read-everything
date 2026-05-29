import type { ExtractionResult, ReaderChunk, VoiceInfo } from "@readwebsite/shared";

export type PlaybackStatus = "idle" | "loading" | "playing" | "paused" | "error";

export interface PlaybackSnapshot {
  status: PlaybackStatus;
  title?: string;
  progress: number;
  activeIndex: number;
  totalChunks: number;
  error?: string;
}

export type ExtensionMessage =
  | { type: "START_READING"; preferSelection?: boolean }
  | { type: "GET_PLAYBACK_STATE" }
  | { type: "PLAYBACK_STATE_CHANGED"; state: PlaybackSnapshot }
  | { type: "EXTRACT_ACTIVE_TAB"; preferSelection?: boolean }
  | { type: "EXTRACTION_READY"; result: ExtractionResult }
  | { type: "EXTRACTION_FAILED"; error: string }
  | { type: "PLAY_AUDIO"; audioContent: string; contentType: string; volume: number }
  | { type: "AUDIO_ENDED" }
  | { type: "AUDIO_ERROR"; error: string }
  | { type: "STOP_AUDIO" }
  | { type: "SPEAK_CHROME_TTS"; text: string; rate: number; volume: number; pitch: number; voice?: string; chunk: ReaderChunk; highlight: boolean }
  | { type: "UPDATE_CHROME_TTS_SETTINGS"; rate: number; volume: number; pitch: number; voice?: string; highlight: boolean }
  | { type: "PAUSE_CHROME_TTS" }
  | { type: "RESUME_CHROME_TTS" }
  | { type: "CHROME_TTS_PROGRESS"; chunk: ReaderChunk; charIndex: number }
  | { type: "CHROME_TTS_ENDED" }
  | { type: "CHROME_TTS_ERROR"; error: string }
  | { type: "STOP_CHROME_TTS" }
  | { type: "HIGHLIGHT_CHUNK"; chunk: ReaderChunk }
  | { type: "HIGHLIGHT_WORD"; chunk: ReaderChunk; charIndex: number }
  | { type: "CLEAR_HIGHLIGHT" }
  | { type: "OPEN_SIDE_PANEL" }
  | { type: "READ_COMMAND"; preferSelection?: boolean }
  | { type: "STOP_COMMAND" }
  | { type: "VOICES_READY"; voices: VoiceInfo[] };

export function sendMessage<T = unknown>(message: ExtensionMessage): Promise<T> {
  return chrome.runtime.sendMessage(message);
}
