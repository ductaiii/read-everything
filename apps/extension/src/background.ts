import { chunkReaderText, prepareReaderText, type ExtractionResult, type ReaderChunk, type ReaderSettings } from "@readwebsite/shared";
import type { ExtensionMessage, PlaybackSnapshot, PlaybackStatus } from "./messages.js";
import { getReadingPosition, getSettings, saveReadingPosition } from "./storage.js";

const CONTEXT_MENU_READ_SELECTION = "readwebsite-read-selection";
const CONTEXT_MENU_READ_PAGE = "readwebsite-read-page";

interface ActiveTtsState {
  chunk: ReaderChunk;
  text: string;
  rate: number;
  volume: number;
  pitch: number;
  voiceName?: string;
  highlight: boolean;
  lastCharIndex: number;
  baseOffset: number;
  pendingRestart: boolean;
  manuallyStopped: boolean;
  paused: boolean;
  documentTextLength: number;
  chunks: ReaderChunk[];
  resolve: (value: { ok: true }) => void;
}

let activeTts: ActiveTtsState | undefined;
let playbackRunId = 0;
let playbackState: PlaybackSnapshot = {
  status: "idle",
  progress: 0,
  activeIndex: 0,
  totalChunks: 0
};
let playbackCancelRequested = false;

chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_READ_SELECTION,
    title: "Đọc vùng đã chọn",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: CONTEXT_MENU_READ_PAGE,
    title: "Đọc trang này",
    contexts: ["page"]
  });
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
});

chrome.contextMenus.onClicked.addListener(async (_info, tab) => {
  if (!tab?.id) {
    return;
  }
  await openSidePanel(tab);
  void startBackgroundReading({
    preferSelection: _info.menuItemId === CONTEXT_MENU_READ_SELECTION
  });
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "read-active-page") {
    void startBackgroundReading({});
  }
  if (command === "stop-reading") {
    void stopBackgroundReading();
  }
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  void handleMessage(message)
    .then(sendResponse)
    .catch((error: unknown) => {
      const messageText = error instanceof Error ? error.message : String(error);
      sendResponse({ ok: false, error: messageText });
    });
  return true;
});

async function handleMessage(message: ExtensionMessage): Promise<unknown> {
  switch (message.type) {
    case "START_READING":
      void startBackgroundReading({ preferSelection: message.preferSelection });
      return { ok: true };
    case "GET_PLAYBACK_STATE":
      return { ok: true, state: playbackState };
    case "EXTRACT_ACTIVE_TAB":
      return extractActiveTab(message.preferSelection);
    case "PLAY_AUDIO":
      await ensureOffscreenDocument();
      await chrome.runtime.sendMessage(message);
      return { ok: true };
    case "STOP_AUDIO":
      await chrome.runtime.sendMessage(message);
      return { ok: true };
    case "SPEAK_CHROME_TTS":
      return speakChromeTts(message.text, message.rate, message.volume, message.pitch, message.voice, message.chunk, message.highlight);
    case "UPDATE_CHROME_TTS_SETTINGS":
      return updateActiveChromeTts(message.rate, message.volume, message.pitch, message.voice, message.highlight);
    case "PAUSE_CHROME_TTS":
      if (activeTts) {
        activeTts.paused = true;
      }
      chrome.tts.pause();
      updatePlaybackState({ status: "paused" });
      return { ok: true };
    case "RESUME_CHROME_TTS":
      if (activeTts) {
        activeTts.paused = false;
      }
      chrome.tts.resume();
      updatePlaybackState({ status: "playing" });
      return { ok: true };
    case "STOP_CHROME_TTS":
      if (activeTts) {
        activeTts.manuallyStopped = true;
      }
      chrome.tts.stop();
      stopBackgroundReading();
      return { ok: true };
    case "HIGHLIGHT_CHUNK":
    case "HIGHLIGHT_WORD":
    case "CLEAR_HIGHLIGHT":
      return forwardToActiveTab(message);
    case "OPEN_SIDE_PANEL":
      return openCurrentSidePanel();
    default:
      return { ok: true };
  }
}

async function startBackgroundReading({ preferSelection = false }: { preferSelection?: boolean }): Promise<void> {
  const runId = ++playbackRunId;
  playbackCancelRequested = true;
  if (activeTts) {
    activeTts.manuallyStopped = true;
    chrome.tts.stop();
  }

  playbackCancelRequested = false;
  updatePlaybackState({ status: "loading", error: undefined });

  try {
    const settings = await getSettings();
    const extraction = await extractActiveTab(preferSelection);
    const prepared = prepareReaderText(extraction.result.text, settings.pronunciationDictionary);
    const chunks = chunkReaderText(prepared);
    if (!chunks.length) {
      throw new Error("Trang này không có nội dung để đọc.");
    }

    const storedPosition = await getReadingPosition(extraction.result.url);
    const startIndex = typeof storedPosition?.chunkIndex === "number" && storedPosition.chunkIndex < chunks.length
      ? storedPosition.chunkIndex
      : 0;

    updatePlaybackState({
      status: "playing",
      title: extraction.result.title,
      progress: calculateProgress({ textLength: prepared.length, chunks, activeIndex: startIndex, charIndex: 0 }),
      activeIndex: startIndex,
      totalChunks: chunks.length,
      error: undefined
    });

    for (let i = startIndex; i < chunks.length; i += 1) {
      if (playbackCancelRequested || runId !== playbackRunId) {
        return;
      }

      const chunk = chunks[i];
      if (!chunk) {
        continue;
      }

      const activeSettings = await getSettings();
      await saveReadingPosition({ url: extraction.result.url, title: extraction.result.title, chunkIndex: i, updatedAt: Date.now() });
      updatePlaybackState({
        status: "playing",
        activeIndex: i,
        progress: calculateProgress({ textLength: prepared.length, chunks, activeIndex: i, charIndex: 0 })
      });

      if (activeSettings.highlight) {
        await forwardToActiveTab({ type: "HIGHLIGHT_CHUNK", chunk });
      }

      await speakChromeTts(chunk.text, activeSettings.rate, activeSettings.volume, activeSettings.pitch, activeSettings.voice, chunk, activeSettings.highlight, prepared.length, chunks);
    }

    if (!playbackCancelRequested && runId === playbackRunId) {
      updatePlaybackState({ status: "idle", progress: 100 });
      await forwardToActiveTab({ type: "CLEAR_HIGHLIGHT" });
    }
  } catch (error) {
    if (runId !== playbackRunId) {
      return;
    }
    updatePlaybackState({
      status: "error",
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function stopBackgroundReading(): void {
  playbackRunId += 1;
  playbackCancelRequested = true;
  chrome.tts.stop();
  chrome.runtime.sendMessage({ type: "STOP_AUDIO" } satisfies ExtensionMessage).catch(() => undefined);
  void forwardToActiveTab({ type: "CLEAR_HIGHLIGHT" });
  updatePlaybackState({ status: "idle", progress: 0, activeIndex: 0 });
}

function updatePlaybackState(next: Partial<PlaybackSnapshot>): void {
  playbackState = {
    ...playbackState,
    ...next
  };
  chrome.runtime.sendMessage({ type: "PLAYBACK_STATE_CHANGED", state: playbackState } satisfies ExtensionMessage).catch(() => undefined);
}

function calculateProgress({ textLength, chunks, activeIndex, charIndex }: { textLength: number; chunks: ReaderChunk[]; activeIndex: number; charIndex: number }): number {
  if (!textLength) {
    return 0;
  }
  const chunk = chunks[activeIndex];
  const readChars = chunk ? chunk.startOffset + charIndex : 0;
  return Math.max(0, Math.min(100, Math.round((readChars / textLength) * 100)));
}

async function openSidePanel(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.windowId) {
    return;
  }
  await chrome.sidePanel.open({ windowId: tab.windowId });
}

async function openCurrentSidePanel(): Promise<{ ok: true }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    await openSidePanel(tab);
  }
  return { ok: true };
}

async function extractActiveTab(preferSelection = false): Promise<{ ok: true; result: ExtractionResult }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("Không tìm thấy tab hiện tại.");
  }
  if (isRestrictedPage(tab.url)) {
    throw new Error("Chrome chặn extension đọc trang này. Hãy thử trên website thường hoặc bôi đen đoạn văn bản ở trang khác.");
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["contentScript.js"]
    });
  } catch (error) {
    throw new Error(toFriendlyInjectionError(error));
  }

  const result = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_PAGE", preferSelection });
  return { ok: true, result: result as ExtractionResult };
}

function isRestrictedPage(url?: string): boolean {
  // A missing URL often means host access has not been granted yet.
  if (!url) {
    return false;
  }

  return /^(chrome|edge|about|devtools):\/\//i.test(url) || /^https:\/\/chromewebstore\.google\.com\//i.test(url);
}

function toFriendlyInjectionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/Cannot access|chromewebstore|extensions gallery|chrome:\/\//i.test(message)) {
    return "Chrome chặn extension đọc trang này. Hãy thử trên website thường hoặc bôi đen đoạn văn bản ở trang khác.";
  }
  return message;
}

async function forwardToActiveTab(message: ExtensionMessage): Promise<{ ok: true }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return { ok: true };
  }
  await chrome.tabs.sendMessage(tab.id, message).catch(() => undefined);
  return { ok: true };
}

async function ensureOffscreenDocument(): Promise<void> {
  const offscreenUrl = chrome.runtime.getURL("offscreen.html");
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [offscreenUrl]
  });

  if (contexts.length > 0) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
    justification: "Play synthesized chapter audio while the side panel remains focused."
  });
}

async function speakChromeTts(text: string, rate: number, volume: number, pitch: number, voice: string | undefined, chunk: ReaderChunk, highlight: boolean, documentTextLength = text.length, chunks: ReaderChunk[] = [chunk]): Promise<{ ok: true }> {
  const voiceName = await getPreferredChromeVoiceName(voice);
  chrome.tts.stop();
  return new Promise((resolve) => {
    activeTts = {
      chunk,
      text,
      rate,
      volume,
      pitch,
      voiceName,
      highlight,
      lastCharIndex: 0,
      baseOffset: 0,
      pendingRestart: false,
      manuallyStopped: false,
      paused: false,
      documentTextLength,
      chunks,
      resolve
    };
    speakActiveSegment(text, 0);
  });
}

async function updateActiveChromeTts(rate: number, volume: number, pitch: number, voice: string | undefined, highlight: boolean): Promise<{ ok: true }> {
  const state = activeTts;
  if (!state) {
    return { ok: true };
  }

  state.rate = rate;
  state.volume = volume;
  state.pitch = pitch;
  state.voiceName = await getPreferredChromeVoiceName(voice);
  state.highlight = highlight;

  const resumeAt = Math.max(0, Math.min(state.lastCharIndex, state.text.length - 1));
  if (resumeAt < state.text.length - 1) {
    state.pendingRestart = true;
    state.manuallyStopped = false;
    chrome.tts.stop();
  }
  return { ok: true };
}

function speakActiveSegment(text: string, baseOffset: number): void {
  const state = activeTts;
  if (!state) {
    return;
  }

  state.baseOffset = baseOffset;
  chrome.tts.speak(text, {
    lang: "vi-VN",
    voiceName: state.voiceName,
    rate: state.rate,
    volume: state.volume,
    pitch: state.pitch,
    onEvent: (event) => handleTtsEvent(event, text)
  });
}

function handleTtsEvent(event: chrome.tts.TtsEvent, currentText: string): void {
  const state = activeTts;
  if (!state) {
    return;
  }

  if (event.type === "word" && typeof event.charIndex === "number") {
    const absoluteCharIndex = state.baseOffset + event.charIndex;
    state.lastCharIndex = absoluteCharIndex;
    const progressMessage = {
      type: "CHROME_TTS_PROGRESS",
      chunk: state.chunk,
      charIndex: absoluteCharIndex
    } satisfies ExtensionMessage;
    chrome.runtime.sendMessage(progressMessage).catch(() => undefined);
    updatePlaybackState({
      status: state.paused ? "paused" : "playing",
      activeIndex: state.chunk.index,
      totalChunks: state.chunks.length,
      progress: calculateProgress({
        textLength: state.documentTextLength,
        chunks: state.chunks,
        activeIndex: state.chunk.index,
        charIndex: absoluteCharIndex
      })
    });

    if (state.highlight) {
      void forwardToActiveTab({
        type: "HIGHLIGHT_WORD",
        chunk: state.chunk,
        charIndex: absoluteCharIndex
      });
    }
  }

  if (event.type === "interrupted" || event.type === "cancelled") {
    if (state.pendingRestart && !state.manuallyStopped) {
      state.pendingRestart = false;
      const resumeAt = Math.max(0, Math.min(state.lastCharIndex, state.text.length - 1));
      const nextText = state.text.slice(resumeAt).trim();
      if (nextText) {
        speakActiveSegment(nextText, resumeAt);
        return;
      }
    }
    finishActiveTts();
  }

  if (event.type === "end") {
    state.lastCharIndex = Math.min(state.text.length, state.baseOffset + currentText.length);
    finishActiveTts();
  }

  if (event.type === "error") {
    chrome.runtime.sendMessage({ type: "CHROME_TTS_ERROR", error: event.errorMessage ?? "chrome.tts không phát được audio." } satisfies ExtensionMessage).catch(() => undefined);
    finishActiveTts();
  }
}

function finishActiveTts(): void {
  const state = activeTts;
  if (!state) {
    return;
  }
  activeTts = undefined;
  chrome.runtime.sendMessage({ type: "CHROME_TTS_ENDED" } satisfies ExtensionMessage).catch(() => undefined);
  state.resolve({ ok: true });
}

async function getPreferredChromeVoiceName(requestedVoice?: string): Promise<string | undefined> {
  const voices = await chrome.tts.getVoices();
  if (!voices.length) {
    return undefined;
  }

  const requestedMatch = requestedVoice
    ? voices.find((voice) => voice.voiceName === requestedVoice && isVietnameseVoice(voice))
    : undefined;
  if (requestedMatch?.voiceName) {
    return requestedMatch.voiceName;
  }

  const vietnameseVoices = voices.filter(isVietnameseVoice);
  const exactVietnamese = vietnameseVoices.find((voice) => /^vi(?:-|$)/i.test(voice.lang ?? ""));
  return exactVietnamese?.voiceName ?? vietnameseVoices[0]?.voiceName;
}

function isVietnameseVoice(voice: chrome.tts.TtsVoice): boolean {
  const lang = voice.lang ?? "";
  const name = voice.voiceName ?? "";
  return /^vi(?:-|$)/i.test(lang) || /vietnamese|viet|việt/i.test(name);
}
