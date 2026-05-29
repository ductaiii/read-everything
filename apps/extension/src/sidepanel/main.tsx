import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowLeft, PanelRightOpen, Pause, Play, RotateCcw, Settings, Square } from "lucide-react";
import type { ReaderSettings, VoiceInfo } from "@readwebsite/shared";
import type { ExtensionMessage, PlaybackSnapshot, PlaybackStatus } from "../messages.js";
import { sendMessage } from "../messages.js";
import { DEFAULT_SETTINGS, getSettings, saveSettings } from "../storage.js";
import "./styles.css";

const STATUS_COPY: Record<PlaybackStatus, string> = {
  idle: "Sẵn sàng",
  loading: "Đang lấy nội dung",
  playing: "Đang đọc",
  paused: "Tạm dừng",
  error: "Có lỗi"
};

const WEB_HOST_ORIGINS = ["http://*/*", "https://*/*"];
const IS_POPUP = window.location.pathname.endsWith("/popup.html");
const EMPTY_PLAYBACK: PlaybackSnapshot = {
  status: "idle",
  progress: 0,
  activeIndex: 0,
  totalChunks: 0
};

function App() {
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const [draftSettings, setDraftSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [playback, setPlayback] = useState<PlaybackSnapshot>(EMPTY_PLAYBACK);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  useEffect(() => {
    void getSettings().then((loaded) => {
      const next = { ...DEFAULT_SETTINGS, ...loaded, useCloudVoice: loaded.useCloudVoice ?? false };
      setSettings(next);
      setDraftSettings(next);
      if (next.useCloudVoice) {
        void loadVoices(next);
      }
    });
  }, []);

  useEffect(() => {
    void sendMessage<{ ok: boolean; state?: PlaybackSnapshot }>({ type: "GET_PLAYBACK_STATE" }).then((response) => {
      if (response?.state) {
        setPlayback(response.state);
      }
    });
  }, []);

  useEffect(() => {
    const listener = (message: ExtensionMessage) => {
      if (message.type === "PLAYBACK_STATE_CHANGED") {
        setPlayback(message.state);
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
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

  const ensureWebsiteAccess = useCallback(async () => {
    return chrome.permissions.request({ origins: WEB_HOST_ORIGINS });
  }, []);

  const startReading = useCallback(async (preferSelection = false) => {
    const granted = await ensureWebsiteAccess();
    if (!granted) {
      setPlayback({
        ...playback,
        status: "error",
        error: "Extension chưa được cấp quyền đọc website. Hãy bấm Đọc lại và chấp nhận quyền truy cập khi Chrome hỏi."
      });
      return;
    }

    await sendMessage({ type: "START_READING", preferSelection });
  }, [ensureWebsiteAccess, playback]);

  const startReadingFromClick = useCallback(() => {
    void (async () => {
      if (playback.status === "paused") {
        setPlayback((current) => ({ ...current, status: "playing" }));
        await sendMessage({ type: "RESUME_CHROME_TTS" });
        return;
      }

      await startReading(false);
    })();
  }, [playback.status, startReading]);

  const refreshExtractionFromClick = useCallback(() => {
    void startReading(false);
  }, [startReading]);

  const pauseReading = useCallback(() => {
    setPlayback((current) => ({ ...current, status: "paused" }));
    void sendMessage({ type: "PAUSE_CHROME_TTS" });
  }, []);

  const stopReading = useCallback(() => {
    void sendMessage({ type: "STOP_AUDIO" });
    void sendMessage({ type: "STOP_CHROME_TTS" });
    void sendMessage({ type: "CLEAR_HIGHLIGHT" });
  }, []);

  const openSidePanelFromPopup = useCallback(() => {
    void sendMessage({ type: "OPEN_SIDE_PANEL" }).then(() => window.close());
  }, []);

  const saveDraftSettings = useCallback(async () => {
    const next = { ...draftSettings };
    setSettings(next);
    await saveSettings(next);
    await sendMessage({
      type: "UPDATE_CHROME_TTS_SETTINGS",
      rate: next.rate,
      volume: next.volume,
      pitch: next.pitch,
      voice: next.voice,
      highlight: next.highlight
    });
    if (!next.highlight) {
      await sendMessage({ type: "CLEAR_HIGHLIGHT" });
    }
    setSettingsSaved(true);
    window.setTimeout(() => setSettingsSaved(false), 1400);
    if (next.useCloudVoice) {
      await loadVoices(next);
    }
  }, [draftSettings, loadVoices]);

  const toggleCloudVoice = async (enabled: boolean) => {
    const next = { ...draftSettings, useCloudVoice: enabled };
    setDraftSettings(next);
    if (enabled) {
      await loadVoices(next);
    }
  };

  if (showSettings) {
    return (
      <main className="shell">
        <header className="header">
          <div>
            <h1>Cài đặt</h1>
          </div>
          <button className="iconButton" title="Quay lại" onClick={() => setShowSettings(false)}>
            <ArrowLeft size={18} />
          </button>
        </header>

        <section className="settings">
          <label>
            Tốc độ {draftSettings.rate.toFixed(2)}x
            <input
              type="range"
              min="0.65"
              max="2"
              step="0.05"
              value={draftSettings.rate}
              onChange={(event) => setDraftSettings({ ...draftSettings, rate: Number(event.target.value) })}
            />
          </label>
          <label>
            Âm lượng {Math.round(draftSettings.volume * 100)}%
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={draftSettings.volume}
              onChange={(event) => setDraftSettings({ ...draftSettings, volume: Number(event.target.value) })}
            />
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={draftSettings.highlight}
              onChange={(event) => setDraftSettings({ ...draftSettings, highlight: event.target.checked })}
            />
            Tô sáng từ đang đọc
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={draftSettings.useCloudVoice}
              onChange={(event) => void toggleCloudVoice(event.target.checked)}
            />
            Dùng Google Cloud TTS thử nghiệm
          </label>

          {draftSettings.useCloudVoice ? (
            <div className="advanced">
              <label>
                Backend
                <input
                  value={draftSettings.apiBaseUrl}
                  onChange={(event) => setDraftSettings({ ...draftSettings, apiBaseUrl: event.target.value })}
                />
              </label>
              <label>
                Token dev
                <input
                  type="password"
                  value={draftSettings.devToken}
                  onChange={(event) => setDraftSettings({ ...draftSettings, devToken: event.target.value })}
                />
              </label>
              <label>
                Giọng cloud
                <select value={draftSettings.voice} onChange={(event) => setDraftSettings({ ...draftSettings, voice: event.target.value })}>
                  {voices.map((voice) => (
                    <option key={voice.id} value={voice.id}>{voice.name || voice.id}</option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          <button className="saveButton" onClick={saveDraftSettings}>
            {settingsSaved ? "Đã lưu" : "Lưu thay đổi"}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="header">
        <div>
          <h1>ReadWebsite</h1>
          {playback.title ? <p>{playback.title}</p> : null}
        </div>
        <div className="headerActions">
          {IS_POPUP ? (
            <button className="iconButton" title="Mở dạng bảng bên" onClick={openSidePanelFromPopup}>
              <PanelRightOpen size={18} />
            </button>
          ) : null}
          <button className="iconButton" title="Cài đặt" onClick={() => setShowSettings(true)}>
            <Settings size={18} />
          </button>
        </div>
      </header>

      <section className="player">
        <div className="statusLine">
          <span>{STATUS_COPY[playback.status]}</span>
          <span>{playback.totalChunks ? `${playback.progress}%` : "0%"}</span>
        </div>
        <div className="meter" aria-label="Tiến độ đọc">
          <div style={{ width: `${playback.progress}%` }} />
        </div>
        <div className="controls">
          <button className="primaryButton" title={playback.status === "paused" ? "Tiếp tục" : "Đọc trang hiện tại"} onClick={startReadingFromClick} disabled={playback.status === "loading" || playback.status === "playing"}>
            <Play size={18} />
          </button>
          <button title="Tạm dừng" onClick={pauseReading} disabled={playback.status !== "playing"}>
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

      {playback.error ? <p className="errorText">{playback.error}</p> : null}
    </main>
  );
}

document.body.classList.toggle("popupMode", IS_POPUP);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
