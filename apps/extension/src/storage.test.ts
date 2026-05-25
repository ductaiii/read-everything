import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./storage.js";

describe("default settings", () => {
  it("points to the local API and keeps cloud voice opt-in", () => {
    expect(DEFAULT_SETTINGS.apiBaseUrl).toBe("http://127.0.0.1:4317");
    expect(DEFAULT_SETTINGS.useCloudVoice).toBe(false);
    expect(DEFAULT_SETTINGS.highlight).toBe(true);
  });
});
