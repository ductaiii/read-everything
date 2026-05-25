import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Pause, Play, RotateCcw, Settings, Square } from "lucide-react";
import {
  chunkReaderText,
  prepareReaderText,
  type ExtractionResult,
  type ReaderChunk,
  type ReaderSettings,
  type TtsSynthesizeResponse,
  type VoiceInfo
} from "@readwebsite/shared";
import type { ExtensionMessage } from "../messages.js";
import { sendMessage } from "../messages.js";
import { DEFAULT_SETTINGS, getReadingPosition, getSettings, saveReadingPosition, saveSettings } from "../storage.js";
import "./styles.css";

type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";

interface ExtractionResponse {
  ok: boolean;
  result?: ExtractionResult;
  error?: string;
}

const STATUS_COPY: Record<PlayerStatus, string> = {
  idle: "Sẵn sàng",
  loading: "Đang lấy nội dung",
  playing: "Đang đọc",
  paused: "Tạm dừng",
  error: "Có lỗi"
};

const WEB_HOST_ORIGINS = ["http://*/*", "https://*/*"];

function App() {
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [documentInfo, setDocumentInfo] = useState<ExtractionResult | null>(null);
  const [chunks, setChunks] = useState<ReaderChunk[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    void getSettings().then((loaded) => {
      const next = { ...DEFAULT_SETTINGS, ...loaded, useCloudVoice: loaded.useCloudVoice ?? false };
      setSettings(next);
      if (next.useCloudVoice) {
        void loadVoices(next);
      }
    });
  }, []);

  useEffect(() => {
    const listener = (message: ExtensionMessage) => {
      if (message.type === "READ_COMMAND") {
        void startReading(message.preferSelection);
      }
      if (message.type === "STOP_COMMAND") {
        stopReading();
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  });

  const progress = useMemo(() => {
    if (!chunks.length) {
      return 0;
    }
    return Math.round(((activeIndex + 1) / chunks.length) * 100);
  }, [activeIndex, chunks.length]);

  const currentChunk = chunks[activeIndex];

  const updateSettings = useCallback(async (next: ReaderSettings) => {
    setSettings(next);
    await saveSettings(next);
  }, []);

  const loadVoices = useCallback(async (baseSettings = settings) => {
    try {
      const response = await fetch(`${baseSettings.apiBaseUrl}/voices?lang=vi-VN`);
      const data = (await response.json()) as { voices: VoiceInfo[] };
      setVoices(data.voices ?? []);
    } catch {
      setVoices([
        { id: "vi-VN-Chirp3-HD-Aoede", name: "Chirp3 HD Aoede", languageCode: "vi-VN", gender: "FEMALE", provider: "google", naturalnessRank: 1 }
      ]);
    }
  }, [settings]);

  const extractCurrentTab = useCallback(async (preferSelection = false) => {
    setStatus("loading");
    setError("");
    const response = await sendMessage<ExtractionResponse>({ type: "EXTRACT_ACTIVE_TAB", preferSelection });
    if (!response?.ok || !response.result) {
      throw new Error(toFriendlyExtractionError(response?.error));
    }
    if (!response.result.text?.trim()) {
      throw new Error("Không tìm thấy văn bản để đọc. Hãy bôi đen đoạn cần nghe rồi bấm Đọc.");
    }

    const prepared = prepareReaderText(response.result.text, settings.pronunciationDictionary);
    const nextChunks = chunkReaderText(prepared);
    const storedPosition = await getReadingPosition(response.result.url);
    const startIndex = typeof storedPosition?.chunkIndex === "number" && storedPosition.chunkIndex < nextChunks.length
      ? storedPosition.chunkIndex
      : 0;

    setDocumentInfo({ ...response.result, text: prepared });
    setChunks(nextChunks);
    setActiveIndex(startIndex);
    setStatus("idle");
    return { result: response.result, chunks: nextChunks, startIndex };
  }, [settings.pronunciationDictionary]);

  const ensureWebsiteAccess = useCallback(async () => {
    return chrome.permissions.request({ origins: WEB_HOST_ORIGINS });
  }, []);

  const startReading = useCallback(async (preferSelection = false) => {
    cancelRef.current = false;
    setError("");

    try {
      const source = !preferSelection && chunks.length && documentInfo
        ? { result: documentInfo, chunks, startIndex: activeIndex }
        : await extractCurrentTab(preferSelection);

      await readFrom(source.chunks, Math.min(source.startIndex, source.chunks.length - 1), source.result);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [activeIndex, chunks, documentInfo, extractCurrentTab]);

  const startReadingFromClick = useCallback(() => {
    void (async () => {
      const granted = await ensureWebsiteAccess();
      if (!granted) {
        setStatus("error");
        setError("Extension chưa được cấp quyền đọc website. Hãy bấm Đọc lại và chấp nhận quyền truy cập khi Chrome hỏi.");
        return;
      }

      await startReading(false);
    })();
  }, [ensureWebsiteAccess, startReading]);

  const refreshExtractionFromClick = useCallback(() => {
    void (async () => {
      const granted = await ensureWebsiteAccess();
      if (!granted) {
        setStatus("error");
        setError("Extension chưa được cấp quyền đọc website. Hãy bấm Lấy lại nội dung và chấp nhận quyền truy cập khi Chrome hỏi.");
        return;
      }

      await extractCurrentTab(false);
    })();
  }, [ensureWebsiteAccess, extractCurrentTab]);

  const pauseReading = useCallback(() => {
    cancelRef.current = true;
    setStatus("paused");
    void sendMessage({ type: "STOP_AUDIO" });
    void sendMessage({ type: "STOP_CHROME_TTS" });
  }, []);

  const stopReading = useCallback(() => {
    cancelRef.current = true;
    setStatus("idle");
    setActiveIndex(0);
    void sendMessage({ type: "STOP_AUDIO" });
    void sendMessage({ type: "STOP_CHROME_TTS" });
    void sendMessage({ type: "CLEAR_HIGHLIGHT" });
  }, []);

  const readFrom = async (items: ReaderChunk[], index: number, info: ExtractionResult) => {
    if (!items.length) {
      throw new Error("Trang này không có nội dung để đọc.");
    }

    for (let i = Math.max(index, 0); i < items.length; i += 1) {
      if (cancelRef.current) {
        return;
      }

      const chunk = items[i];
      if (!chunk) {
        continue;
      }

      setActiveIndex(i);
      setStatus("playing");
      await saveReadingPosition({ url: info.url, title: info.title, chunkIndex: i, updatedAt: Date.now() });
      if (settings.highlight) {
        await sendMessage({ type: "HIGHLIGHT_CHUNK", chunk });
      }

      const playedCloud = settings.useCloudVoice ? await tryPlayCloud(chunk) : false;
      if (!playedCloud) {
        await playChromeTts(chunk);
      }
    }

    setStatus("idle");
    await sendMessage({ type: "CLEAR_HIGHLIGHT" });
  };

  const tryPlayCloud = async (chunk: ReaderChunk): Promise<boolean> => {
    try {
      const response = await fetch(`${settings.apiBaseUrl}/tts/synthesize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Dev-Token": settings.devToken
        },
        body: JSON.stringify({
          text: chunk.text,
          voice: settings.voice,
          rate: settings.rate,
          pitch: settings.pitch,
          format: "mp3"
        })
      });

      if (!response.ok) {
        return false;
      }

      const data = (await response.json()) as TtsSynthesizeResponse;
      await sendMessage({ type: "PLAY_AUDIO", audioContent: data.audioContent, contentType: data.contentType });
      await waitForPlayback(["AUDIO_ENDED"], ["AUDIO_ERROR"]);
      return true;
    } catch {
      return false;
    }
  };

  const playChromeTts = async (chunk: ReaderChunk): Promise<void> => {
    await sendMessage({
      type: "SPEAK_CHROME_TTS",
      text: chunk.text,
      rate: settings.rate,
      pitch: settings.pitch,
      voice: settings.voice
    });
    await waitForPlayback(["CHROME_TTS_ENDED"], ["CHROME_TTS_ERROR"]);
  };

  const toggleCloudVoice = async (enabled: boolean) => {
    const next = { ...settings, useCloudVoice: enabled };
    await updateSettings(next);
    if (enabled) {
      await loadVoices(next);
    }
  };

  return (
    <main className="shell">
      <header className="header">
        <div>
          <h1>ReadWebsite</h1>
          <p>{documentInfo?.title || "Đọc trang hiện tại hoặc vùng đã chọn"}</p>
        </div>
        <button className="iconButton" title="Cài đặt" onClick={() => setShowSettings((value) => !value)}>
          <Settings size={18} />
        </button>
      </header>

      <section className="player">
        <div className="statusLine">
          <span>{STATUS_COPY[status]}</span>
          <span>{chunks.length ? `${activeIndex + 1}/${chunks.length}` : "0/0"}</span>
        </div>
        <div className="meter" aria-label="Tiến độ đọc">
          <div style={{ width: `${progress}%` }} />
        </div>
        <div className="controls">
          <button className="primaryButton" title="Đọc trang hiện tại" onClick={startReadingFromClick} disabled={status === "loading" || status === "playing"}>
            <Play size={18} /> Đọc
          </button>
          <button title="Tạm dừng" onClick={pauseReading} disabled={status !== "playing"}>
            <Pause size={18} />
          </button>
          <button title="Dừng" onClick={stopReading}>
            <Square size={18} />
          </button>
          <button title="Lấy lại nội dung" onClick={refreshExtractionFromClick}>
            <RotateCcw size={18} />
          </button>
        </div>
      </section>

      {error ? <p className="errorText">{error}</p> : null}

      {currentChunk ? (
        <section className="preview">
          <p>{currentChunk.text}</p>
        </section>
      ) : null}

      {showSettings ? (
        <section className="settings">
          <label>
            Tốc độ {settings.rate.toFixed(2)}x
            <input
              type="range"
              min="0.65"
              max="1.6"
              step="0.05"
              value={settings.rate}
              onChange={(event) => void updateSettings({ ...settings, rate: Number(event.target.value) })}
            />
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.highlight}
              onChange={(event) => void updateSettings({ ...settings, highlight: event.target.checked })}
            />
            Tô sáng đoạn đang đọc
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.useCloudVoice}
              onChange={(event) => void toggleCloudVoice(event.target.checked)}
            />
            Dùng Google Cloud TTS thử nghiệm
          </label>

          {settings.useCloudVoice ? (
            <div className="advanced">
              <label>
                Backend
                <input
                  value={settings.apiBaseUrl}
                  onChange={(event) => void updateSettings({ ...settings, apiBaseUrl: event.target.value })}
                />
              </label>
              <label>
                Token dev
                <input
                  type="password"
                  value={settings.devToken}
                  onChange={(event) => void updateSettings({ ...settings, devToken: event.target.value })}
                />
              </label>
              <label>
                Giọng cloud
                <select value={settings.voice} onChange={(event) => void updateSettings({ ...settings, voice: event.target.value })}>
                  {voices.map((voice) => (
                    <option key={voice.id} value={voice.id}>{voice.name || voice.id}</option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

function waitForPlayback(successTypes: ExtensionMessage["type"][], errorTypes: ExtensionMessage["type"][]): Promise<void> {
  return new Promise((resolve, reject) => {
    const listener = (message: ExtensionMessage) => {
      if (successTypes.includes(message.type)) {
        chrome.runtime.onMessage.removeListener(listener);
        resolve();
      }
      if (errorTypes.includes(message.type)) {
        chrome.runtime.onMessage.removeListener(listener);
        reject(new Error("Không phát được audio."));
      }
    };
    chrome.runtime.onMessage.addListener(listener);
  });
}

function toFriendlyExtractionError(rawError?: string): string {
  const error = rawError ?? "";
  if (/chromewebstore|chrome:\/\/|edge:\/\/|Cannot access|Cannot read|extensions gallery/i.test(error)) {
    return "Chrome chặn extension đọc trang này. Hãy thử trên website thường hoặc bôi đen đoạn văn bản ở trang khác rồi bấm Đọc.";
  }
  return error || "Không lấy được nội dung trang. Hãy thử tải lại trang hoặc bôi đen đoạn cần nghe.";
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
