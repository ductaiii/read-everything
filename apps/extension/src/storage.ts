import type { ReaderSettings } from "@readwebsite/shared";

export const DEFAULT_SETTINGS: ReaderSettings = {
  apiBaseUrl: "http://127.0.0.1:4317",
  devToken: "dev-local-token",
  voice: "vi-VN-Chirp3-HD-Aoede",
  rate: 1,
  volume: 1,
  pitch: 0,
  highlight: true,
  useCloudVoice: false,
  pronunciationDictionary: []
};

export interface ReadingPosition {
  url: string;
  title: string;
  chunkIndex: number;
  updatedAt: number;
}

const SETTINGS_KEY = "readwebsite.settings";
const POSITION_PREFIX = "readwebsite.position.";
const CLOUD_OPT_IN_MIGRATION_KEY = "readwebsite.cloudOptInMigration.v1";

export async function getSettings(): Promise<ReaderSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const settings = {
    ...DEFAULT_SETTINGS,
    ...(stored[SETTINGS_KEY] ?? {})
  };

  const migration = await chrome.storage.local.get(CLOUD_OPT_IN_MIGRATION_KEY);
  if (!migration[CLOUD_OPT_IN_MIGRATION_KEY] && settings.useCloudVoice) {
    const migrated = { ...settings, useCloudVoice: false };
    await chrome.storage.local.set({
      [SETTINGS_KEY]: migrated,
      [CLOUD_OPT_IN_MIGRATION_KEY]: true
    });
    return migrated;
  }

  return settings;
}

export async function saveSettings(settings: ReaderSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function saveReadingPosition(position: ReadingPosition): Promise<void> {
  await chrome.storage.local.set({ [positionKey(position.url)]: position });
}

export async function getReadingPosition(url: string): Promise<ReadingPosition | undefined> {
  const stored = await chrome.storage.local.get(positionKey(url));
  return stored[positionKey(url)] as ReadingPosition | undefined;
}

function positionKey(url: string): string {
  return `${POSITION_PREFIX}${url}`;
}
