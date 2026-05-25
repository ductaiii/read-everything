import { describe, expect, it } from "vitest";
import { applyPronunciationDictionary, chunkReaderText, normalizeVietnameseText } from "./text.js";
import { createTtsCacheKey } from "./cache.js";

describe("Vietnamese text helpers", () => {
  it("normalizes whitespace, chapter headings, and ellipses", () => {
    const result = normalizeVietnameseText("  Chương   12:   Hắn nhìn nàng...   rồi cười.  ");

    expect(result).toContain("Chuong 12.");
    expect(result).toContain("nàng…");
    expect(result).not.toContain("   ");
  });

  it("applies enabled dictionary entries only", () => {
    const result = applyPronunciationDictionary("Lý Mộ nhìn Kim Đan.", [
      { from: "Lý Mộ", to: "Lí Mộ", enabled: true },
      { from: "Kim Đan", to: "Kim Dan", enabled: false }
    ]);

    expect(result).toContain("Lí Mộ");
    expect(result).toContain("Kim Đan");
  });

  it("chunks long text below max characters", () => {
    const text = Array.from({ length: 20 }, (_, index) => `Cau thu ${index}.`).join(" ");
    const chunks = chunkReaderText(text, { maxChars: 60, minChars: 20 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.text.length <= 80)).toBe(true);
  });

  it("creates stable TTS cache keys", () => {
    const first = createTtsCacheKey({ text: "abc", voice: "vi-VN", rate: 1, pitch: 0, format: "mp3" });
    const second = createTtsCacheKey({ text: "abc", voice: "vi-VN", rate: 1, pitch: 0, format: "mp3" });

    expect(first).toBe(second);
  });
});
