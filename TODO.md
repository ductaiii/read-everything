# ReadWebsite MVP TODO

## Session Resume Rule
- At the start of a new session, or after context compaction, read this file first.
- Treat this file as the source of truth for goals, locked decisions, progress, and next actions.
- Update this checklist whenever a major milestone is completed so the next session can continue without re-discovery.

## Product Goal
- Build a Manifest V3 Chrome extension that can read content aloud on any website.
- Deliver a smoother and more natural listening experience than generic web-reading extensions.
- Primary flow: use the side panel to read either selected text or the main page content, split it into safe chunks, synthesize speech through the dedicated backend, and fall back to `chrome.tts` when needed.
- Longer-term direction: support multilingual website reading, while the current MVP tuning and validation still focus heavily on Vietnamese long-form content.

## Locked Decisions
- Internal product name: `ReadWebsite`.
- Stack: React + TypeScript + Vite for the extension.
- Backend: Node.js + TypeScript + Fastify.
- Repository layout: npm workspaces with `apps/extension`, `apps/api`, and `packages/shared`.
- Primary UI surface: Chrome Side Panel.
- Default cloud TTS provider: Google Cloud Text-to-Speech.
- MVP cost controls: `X-Dev-Token`, character limits per request, token/IP-based rate limiting, and audio caching by hash.
- Out of scope for the MVP: PDF/EPUB support, real authentication, payments, cloud sync, chapter playlists, mobile clients, and Chrome Web Store publishing.

## Implementation Checklist

### 1. Monorepo Scaffold
- [x] Create the root `package.json` with npm workspaces.
- [x] Create a shared TypeScript base configuration.
- [x] Create `apps/extension`.
- [x] Create `apps/api`.
- [x] Create `packages/shared`.
- [x] Add root scripts: `dev`, `build`, `test`, and `typecheck`.

### 2. Shared Package
- [x] Define shared types for voices, settings, TTS requests/responses, and extraction results.
- [x] Add text preprocessing helpers:
  - [x] Normalize whitespace and punctuation.
  - [x] Handle ellipses, dialogue markers, and headings such as `Chuong 123`.
  - [x] Split text into TTS-safe chunks.
  - [x] Apply a personal pronunciation dictionary.
- [x] Add a cache key helper based on `{ text, voice, rate, pitch }`.
- [x] Add unit tests for normalization, chunking, dictionary handling, and cache keys.

### 3. Backend API
- [x] Create the Fastify TypeScript server.
- [x] Add `GET /health`.
- [x] Add `GET /voices?lang=vi-VN`.
- [x] Add `POST /tts/synthesize` accepting `{ text, voice, rate, pitch, format }`.
- [x] Integrate Google Cloud TTS with voice fallback ordering:
  - [x] `vi-VN-Chirp3-HD-*` when available.
  - [x] `vi-VN-Neural2-*`.
  - [x] `vi-VN-Wavenet-*`.
- [x] Add `X-Dev-Token` middleware.
- [x] Enforce character limits per request.
- [x] Add token/IP-based rate limiting.
- [x] Cache audio by hash.
- [x] Return explicit error codes for invalid token, text too long, quota/rate limit, provider timeout, and provider failure.
- [x] Add integration tests with a mocked Google TTS provider.

### 4. Chrome Extension
- [x] Create a Manifest V3 extension with `sidePanel`, `storage`, `scripting`, `activeTab`, `contextMenus`, `tts`, and `offscreen`; keep commands at the manifest top level.
- [x] Do not request `<all_urls>` in the MVP.
- [x] Build the service worker flow:
  - [x] Open the side panel.
  - [x] Add context menu actions for selected text and the current page.
  - [x] Add basic keyboard shortcuts.
  - [x] Wire messaging between the side panel and content script.
- [x] Content extraction:
  - [x] Support explicit selected-text reading.
  - [x] Read the full page by default from the side panel.
  - [x] Use `@mozilla/readability` when explicit selection is not requested.
  - [x] Remove basic menu, advertising, and page noise.
- [x] Highlight the currently spoken chunk in the page.
- [x] Add offscreen audio playback for cloud audio.
- [x] Fall back to `chrome.tts` when the backend fails or is not configured.
- [x] Store local settings, reading position by URL, cache metadata, and pronunciation dictionary entries in `chrome.storage`.

### 5. Side Panel UI
- [x] Build a reading-focused React side panel rather than a marketing or landing page UI.
- [x] Add controls for Play, Pause, and Stop.
- [x] Show progress: current chunk index, total chunks, and reading status.
- [x] Add a voice selector.
- [x] Add speed control.
- [x] Add a highlight toggle.
- [x] Show cache status.
- [x] Show fallback status.
- [x] Add a minimal pronunciation dictionary editor.
- [x] Clearly disclose when content may be sent to the backend and Google Cloud TTS.
- [x] Improve side panel typography and text rendering for narrow layouts.
- [x] Show a friendly error when Chrome blocks access to pages such as `chromewebstore.google.com`.
- [x] Simplify the UI toward a Read Aloud model: one primary read button, compact pause/stop/refresh controls, and settings behind a gear icon.
- [x] Make `chrome.tts` the default path; keep Google Cloud TTS as an opt-in experimental mode to maximize early compatibility.
- [x] Add dedicated extension icons instead of the fallback letter `R`: `apps/extension/public/icons/icon-*.png`.

### 6. Verification
- [x] `npm install`.
- [x] `npm run build`.
- [x] `npm test`.
- [x] `npm run typecheck`.
- [ ] Manual Chrome validation:
  - [ ] Read selected text.
  - [ ] Read the full page.
  - [ ] Verify pause, resume, and stop.
  - [ ] Switch tabs.
  - [ ] Reload the page and confirm reading position is preserved.
  - [ ] Close and reopen the side panel and confirm state continuity.
- [ ] Reading quality review: test at least five Vietnamese translated chapters.

## Next Step
- Configure `apps/api/.env` with real Google service account credentials.
- Run the local backend at `http://127.0.0.1:4317`.
- Load the unpacked extension from `apps/extension/dist` in Chrome and complete manual validation.
- Tune reading quality against at least five Vietnamese translated chapters.
- After each extension build, reload the extension in `chrome://extensions` so Chrome picks up the latest `dist` output.
