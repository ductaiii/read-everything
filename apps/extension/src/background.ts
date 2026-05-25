import type { ExtractionResult } from "@readwebsite/shared";
import type { ExtensionMessage } from "./messages.js";

const CONTEXT_MENU_READ_SELECTION = "readwebsite-read-selection";
const CONTEXT_MENU_READ_PAGE = "readwebsite-read-page";

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
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    await openSidePanel(tab);
  }
});

chrome.contextMenus.onClicked.addListener(async (_info, tab) => {
  if (!tab?.id) {
    return;
  }
  await openSidePanel(tab);
  chrome.runtime.sendMessage({
    type: "READ_COMMAND",
    preferSelection: _info.menuItemId === CONTEXT_MENU_READ_SELECTION
  } satisfies ExtensionMessage).catch(() => undefined);
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "read-active-page") {
    chrome.runtime.sendMessage({ type: "READ_COMMAND" } satisfies ExtensionMessage).catch(() => undefined);
  }
  if (command === "stop-reading") {
    chrome.runtime.sendMessage({ type: "STOP_COMMAND" } satisfies ExtensionMessage).catch(() => undefined);
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
      return speakChromeTts(message.text, message.rate, message.pitch, message.voice);
    case "STOP_CHROME_TTS":
      chrome.tts.stop();
      return { ok: true };
    case "HIGHLIGHT_CHUNK":
    case "CLEAR_HIGHLIGHT":
      return forwardToActiveTab(message);
    default:
      return { ok: true };
  }
}

async function openSidePanel(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.windowId) {
    return;
  }
  await chrome.sidePanel.open({ windowId: tab.windowId });
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

async function speakChromeTts(text: string, rate: number, pitch: number, voice?: string): Promise<{ ok: true }> {
  const voiceName = await getPreferredChromeVoiceName(voice);
  chrome.tts.stop();
  return new Promise((resolve) => {
    chrome.tts.speak(text, {
      lang: "vi-VN",
      voiceName,
      rate,
      pitch,
      onEvent: (event) => {
        if (event.type === "end" || event.type === "interrupted" || event.type === "cancelled") {
          chrome.runtime.sendMessage({ type: "CHROME_TTS_ENDED" } satisfies ExtensionMessage).catch(() => undefined);
          resolve({ ok: true });
        }
        if (event.type === "error") {
          chrome.runtime.sendMessage({ type: "CHROME_TTS_ERROR", error: event.errorMessage ?? "chrome.tts không phát được audio." } satisfies ExtensionMessage).catch(() => undefined);
          resolve({ ok: true });
        }
      }
    });
  });
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
