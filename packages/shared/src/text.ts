import type { PronunciationEntry, ReaderChunk } from "./types.js";

const CHAPTER_RE = /(^|\n)\s*(ch[uư][oơ]ng|chapter)\s+([0-9ivxlcdm]+)([:.\-\s]*)/giu;
const SENTENCE_END_RE = /([.!?。！？…]+)(\s+|$)/g;
const MULTI_DOT_RE = /\.{3,}|…{2,}/g;
const SPACED_PUNCTUATION_RE = /\s+([,.;:!?])/g;

export function normalizeVietnameseText(input: string): string {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(MULTI_DOT_RE, "…")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, " - ")
    .replace(SPACED_PUNCTUATION_RE, "$1")
    .replace(CHAPTER_RE, (_match, prefix, label, number) => {
      const normalizedLabel = String(label).toLowerCase().startsWith("chapter") ? "Chapter" : "Chuong";
      return `${prefix}${normalizedLabel} ${number}. `;
    })
    .replace(SENTENCE_END_RE, "$1\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function applyPronunciationDictionary(
  text: string,
  dictionary: PronunciationEntry[] = []
): string {
  return dictionary.reduce((current, entry) => {
    if (!entry.enabled || !entry.from.trim()) {
      return current;
    }

    const escaped = entry.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return current.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "giu"), entry.to);
  }, text);
}

export function prepareReaderText(input: string, dictionary: PronunciationEntry[] = []): string {
  return normalizeVietnameseText(applyPronunciationDictionary(input, dictionary));
}

export interface ChunkOptions {
  maxChars?: number;
  minChars?: number;
}

export function chunkReaderText(input: string, options: ChunkOptions = {}): ReaderChunk[] {
  const maxChars = options.maxChars ?? 850;
  const minChars = options.minChars ?? 160;
  const normalized = normalizeVietnameseText(input);
  const paragraphs = normalized
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks: ReaderChunk[] = [];
  let cursor = 0;
  let buffer = "";
  let bufferStart = 0;

  const pushBuffer = () => {
    const text = buffer.trim();
    if (!text) {
      return;
    }
    const startOffset = bufferStart;
    const endOffset = startOffset + text.length;
    chunks.push({
      id: `chunk-${chunks.length}`,
      text,
      index: chunks.length,
      startOffset,
      endOffset
    });
    buffer = "";
  };

  for (const paragraph of paragraphs) {
    const pieces = splitLongParagraph(paragraph, maxChars);
    for (const piece of pieces) {
      const next = buffer ? `${buffer} ${piece}` : piece;
      if (next.length > maxChars && buffer.length >= minChars) {
        pushBuffer();
        bufferStart = cursor;
        buffer = piece;
      } else {
        if (!buffer) {
          bufferStart = cursor;
        }
        buffer = next;
      }
      cursor += piece.length + 1;
    }
  }

  pushBuffer();
  return chunks;
}

function splitLongParagraph(paragraph: string, maxChars: number): string[] {
  if (paragraph.length <= maxChars) {
    return [paragraph];
  }

  const sentences = paragraph
    .split(/(?<=[.!?。！？…])\s+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const result: string[] = [];
  let current = "";

  for (const sentence of sentences.length ? sentences : [paragraph]) {
    if (sentence.length > maxChars) {
      if (current) {
        result.push(current);
        current = "";
      }
      for (let i = 0; i < sentence.length; i += maxChars) {
        result.push(sentence.slice(i, i + maxChars));
      }
      continue;
    }

    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length > maxChars && current) {
      result.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }

  if (current) {
    result.push(current);
  }
  return result;
}
