import { Readability } from "@mozilla/readability";

type RequestMessage =
  | { type: "EXTRACT_PAGE"; preferSelection?: boolean }
  | { type: "HIGHLIGHT_CHUNK"; chunk: { text: string; id: string } }
  | { type: "HIGHLIGHT_WORD"; chunk: { text: string; id: string }; charIndex: number }
  | { type: "CLEAR_HIGHLIGHT" };

const HIGHLIGHT_ID = "readwebsite-current-highlight";
const NOISY_SELECTOR = "script,style,noscript,svg,canvas,iframe,nav,header,footer,aside,form,button,input,select,textarea,.ads,.advertisement,[class*='comment'],[id*='comment'],[class*='menu'],[id*='menu'],[aria-hidden='true']";

interface ContentHandler {
  match: (url: URL) => boolean;
  selectors: string[];
}

const CONTENT_HANDLERS: ContentHandler[] = [
  {
    match: (url) => /(^|\.)truyenfull\./i.test(url.hostname),
    selectors: [
      "#chapter-c",
      ".chapter-c",
      "#chapter-content",
      ".chapter-content",
      ".reading",
      ".entry-content"
    ]
  },
  {
    match: () => true,
    selectors: [
      "article",
      "main",
      "[role='main']",
      ".chapter",
      ".chapter-content",
      ".entry-content",
      ".post-content"
    ]
  }
];

chrome.runtime.onMessage.addListener((message: RequestMessage, _sender, sendResponse) => {
  if (message.type === "EXTRACT_PAGE") {
    sendResponse(extractPage(message.preferSelection));
    return true;
  }

  if (message.type === "HIGHLIGHT_CHUNK") {
    highlightText(message.chunk.text);
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "HIGHLIGHT_WORD") {
    highlightWord(message.chunk.text, message.charIndex);
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "CLEAR_HIGHLIGHT") {
    clearHighlight();
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

function extractPage(preferSelection = false) {
  const selection = window.getSelection()?.toString().trim();
  if (preferSelection && selection) {
    return {
      title: document.title,
      url: location.href,
      text: selection,
      source: "selection"
    };
  }

  const handledText = extractWithContentHandlers();
  if (handledText) {
    return {
      title: getReadableTitle(),
      url: location.href,
      text: handledText,
      source: "body"
    };
  }

  const clone = document.cloneNode(true) as Document;
  removeNoisyNodes(clone);
  const article = new Readability(clone, { charThreshold: 300 }).parse();
  if (article?.textContent?.trim()) {
    return {
      title: article.title || document.title,
      url: location.href,
      text: article.textContent,
      source: "readability"
    };
  }

  return {
    title: document.title,
    url: location.href,
    text: getBodyText(),
    source: "body"
  };
}

function extractWithContentHandlers(): string {
  const url = new URL(location.href);
  for (const handler of CONTENT_HANDLERS) {
    if (!handler.match(url)) {
      continue;
    }

    for (const selector of handler.selectors) {
      const element = document.querySelector(selector);
      const text = element ? getElementText(element) : "";
      if (text.length >= 300) {
        return text;
      }
    }
  }

  return "";
}

function removeNoisyNodes(root: Document): void {
  root.querySelectorAll("script,style,noscript,svg,canvas,iframe,nav,header,footer,aside,form,button,input,select,textarea,.ads,.advertisement,[class*='comment'],[id*='comment'],[class*='menu'],[id*='menu']").forEach((node) => node.remove());
}

function getBodyText(): string {
  const blocks = findTextBlocks(document.body, 80);
  const text = blocks.map(getElementText).filter(Boolean).join("\n\n");
  if (text.length >= 300) {
    return text;
  }

  const looseBlocks = findTextBlocks(document.body, 25);
  const looseText = looseBlocks.map(getElementText).filter(Boolean).join("\n\n");
  return looseText || getElementText(document.body);
}

function findTextBlocks(root: Element, threshold: number): Element[] {
  const blocks: Element[] = [];

  const walk = (element: Element) => {
    if (!isReadableElement(element)) {
      return;
    }

    const text = getElementText(element);
    if (isBlockCandidate(element) && text.length >= threshold) {
      blocks.push(element);
      return;
    }

    const children = Array.from(element.children).filter(isReadableElement);
    const hasLongChild = children.some((child) => getElementText(child).length >= threshold);
    if (!hasLongChild && text.length >= threshold * 2) {
      blocks.push(element);
      return;
    }

    for (const child of children) {
      walk(child);
    }
  };

  walk(root);
  return blocks;
}

function isBlockCandidate(element: Element): boolean {
  return element.matches("p,li,blockquote,dd,dt,td,th,h1,h2,h3,h4,h5,h6,pre");
}

function isReadableElement(element: Element): boolean {
  if (element.matches(NOISY_SELECTOR)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

function getElementText(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll(NOISY_SELECTOR).forEach((node) => node.remove());
  return normalizeText((clone as HTMLElement).innerText || clone.textContent || "");
}

function getReadableTitle(): string {
  return document.querySelector("h1")?.textContent?.trim() || document.title;
}

function normalizeText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function highlightText(text: string): void {
  clearHighlight();
  const needle = text.slice(0, 120).trim();
  if (!needle) {
    return;
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const content = node.textContent ?? "";
    const index = content.indexOf(needle.slice(0, Math.min(needle.length, 48)));
    if (index >= 0 && node.parentElement) {
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, Math.min(content.length, index + Math.min(content.length - index, needle.length)));
      const mark = document.createElement("mark");
      styleHighlight(mark);
      range.surroundContents(mark);
      mark.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    node = walker.nextNode();
  }
}

function highlightWord(chunkText: string, charIndex: number): void {
  clearHighlight();
  const word = getWordAt(chunkText, charIndex);
  if (!word) {
    return;
  }

  const range = findBestWordRange(chunkText, word);
  if (!range) {
    return;
  }

  const mark = document.createElement("mark");
  styleHighlight(mark);
  range.surroundContents(mark);
  mark.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
}

function getWordAt(text: string, charIndex: number): { text: string; start: number; end: number } | null {
  const safeIndex = Math.max(0, Math.min(charIndex, text.length - 1));
  const isWordChar = (value: string) => /[\p{L}\p{N}_]/u.test(value);

  let start = safeIndex;
  while (start > 0 && isWordChar(text[start - 1] ?? "")) {
    start -= 1;
  }

  let end = safeIndex;
  while (end < text.length && isWordChar(text[end] ?? "")) {
    end += 1;
  }

  const value = text.slice(start, end).trim();
  return value ? { text: value, start, end } : null;
}

function findBestWordRange(chunkText: string, word: { text: string; start: number; end: number }): Range | null {
  const searchRoot = findBestChunkRoot(chunkText) ?? document.body;
  const ranges = findWordRanges(searchRoot, word.text);
  if (!ranges.length) {
    return null;
  }

  const contextBefore = chunkText.slice(Math.max(0, word.start - 80), word.start).trim();
  const contextAfter = chunkText.slice(word.end, Math.min(chunkText.length, word.end + 80)).trim();
  const chunkPrefix = chunkText.slice(0, 100).trim();

  return ranges
    .map((range) => ({ range, score: scoreRange(range, contextBefore, contextAfter, chunkPrefix) }))
    .sort((left, right) => right.score - left.score)[0]?.range ?? null;
}

function findBestChunkRoot(chunkText: string): Element | null {
  const prefix = normalizeForSearch(chunkText.slice(0, 120));
  if (prefix.length < 20) {
    return null;
  }

  const candidates = Array.from(document.querySelectorAll("p,li,blockquote,article,main,[role='main'],.chapter,.chapter-content,.entry-content,.post-content,#chapter-c,.chapter-c"));
  return candidates.find((element) => normalizeForSearch(element.textContent ?? "").includes(prefix.slice(0, 60))) ?? null;
}

function findWordRanges(root: Element, word: string): Range[] {
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent || parent.id === HIGHLIGHT_ID || !isReadableElement(parent)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "giu");
  let node = walker.nextNode();
  while (node) {
    const content = node.textContent ?? "";
    for (const match of content.matchAll(pattern)) {
      if (typeof match.index !== "number") {
        continue;
      }
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      ranges.push(range);
    }
    node = walker.nextNode();
  }

  return ranges;
}

function scoreRange(range: Range, contextBefore: string, contextAfter: string, chunkPrefix: string): number {
  const nodeText = range.startContainer.textContent ?? "";
  const before = nodeText.slice(Math.max(0, range.startOffset - 160), range.startOffset);
  const after = nodeText.slice(range.endOffset, Math.min(nodeText.length, range.endOffset + 160));
  const parentText = range.startContainer.parentElement?.textContent ?? "";

  let score = 0;
  if (normalizeForSearch(parentText).includes(normalizeForSearch(chunkPrefix).slice(0, 60))) {
    score += 100;
  }
  if (contextBefore && normalizeForSearch(before).endsWith(normalizeForSearch(contextBefore).slice(-30))) {
    score += 40;
  }
  if (contextAfter && normalizeForSearch(after).startsWith(normalizeForSearch(contextAfter).slice(0, 30))) {
    score += 40;
  }
  return score;
}

function normalizeForSearch(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function styleHighlight(mark: HTMLElement): void {
  mark.id = HIGHLIGHT_ID;
  mark.style.background = "#fff200";
  mark.style.color = "inherit";
  mark.style.padding = "0.02em 0.08em";
  mark.style.borderRadius = "2px";
}

function clearHighlight(): void {
  const mark = document.getElementById(HIGHLIGHT_ID);
  if (!mark?.parentNode) {
    return;
  }
  const parent = mark.parentNode;
  while (mark.firstChild) {
    parent.insertBefore(mark.firstChild, mark);
  }
  parent.removeChild(mark);
  parent.normalize();
}
