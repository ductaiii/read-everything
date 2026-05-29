import type { ExtensionMessage } from "./messages.js";

let audio: HTMLAudioElement | undefined;

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.type === "PLAY_AUDIO") {
    playAudio(message.audioContent, message.contentType, message.volume).catch((error: unknown) => {
      chrome.runtime.sendMessage({
        type: "AUDIO_ERROR",
        error: error instanceof Error ? error.message : String(error)
      } satisfies ExtensionMessage);
    });
  }

  if (message.type === "STOP_AUDIO") {
    stopAudio();
  }
});

async function playAudio(audioContent: string, contentType: string, volume: number): Promise<void> {
  stopAudio();
  const source = `data:${contentType};base64,${audioContent}`;
  audio = new Audio(source);
  audio.volume = Math.max(0, Math.min(1, volume));
  audio.onended = () => {
    chrome.runtime.sendMessage({ type: "AUDIO_ENDED" } satisfies ExtensionMessage);
  };
  audio.onerror = () => {
    chrome.runtime.sendMessage({ type: "AUDIO_ERROR", error: "Audio playback failed." } satisfies ExtensionMessage);
  };
  await audio.play();
}

function stopAudio(): void {
  if (!audio) {
    return;
  }
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  audio = undefined;
}
