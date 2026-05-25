import type { TtsSynthesizeRequest } from "./types.js";

export function createTtsCacheKey(input: Pick<TtsSynthesizeRequest, "text" | "voice" | "rate" | "pitch" | "format">): string {
  const stable = JSON.stringify({
    text: input.text,
    voice: input.voice,
    rate: Number(input.rate.toFixed(2)),
    pitch: Number(input.pitch.toFixed(2)),
    format: input.format
  });
  return `tts_${hashString(stable)}`;
}

function hashString(value: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;

  for (let i = 0; i < value.length; i += 1) {
    const ch = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
