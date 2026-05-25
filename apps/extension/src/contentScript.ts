import { Readability } from "@mozilla/readability";

type RequestMessage =
  | { type: "EXTRACT_PAGE"; preferSelection?: boolean }
  | { type: "HIGHLIGHT_CHUNK"; chunk: { text: string; id: string } }
  | { type: "CLEAR_HIGHLIGHT" };

const HIGHLIGHT_ID = "readwebsite-current-highlight";

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

function removeNoisyNodes(root: Document): void {
  root.querySelectorAll("script,style,noscript,svg,canvas,iframe,nav,header,footer,aside,form,button,input,select,textarea,.ads,.advertisement,[class*='comment'],[id*='comment'],[class*='menu'],[id*='menu']").forEach((node) => node.remove());
}

function getBodyText(): string {
  const main = document.querySelector("article, main, [role='main'], .chapter, .chapter-content, .entry-content, .post-content");
  return (main ?? document.body).textContent?.replace(/\n{3,}/g, "\n\n").trim() ?? "";
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
      mark.id = HIGHLIGHT_ID;
      mark.style.background = "#f6d365";
      mark.style.color = "inherit";
      mark.style.padding = "0.08em 0.12em";
      mark.style.borderRadius = "4px";
      range.surroundContents(mark);
      mark.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    node = walker.nextNode();
  }
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
