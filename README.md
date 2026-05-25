# ReadWebsite

ReadWebsite is a Chrome extension that reads web pages aloud with natural-sounding voices across languages. It combines a Manifest V3 side-panel experience with a Fastify backend for Google Cloud Text-to-Speech, while keeping `chrome.tts` available as a local fallback.

## Key Capabilities

- Read either selected text or the main content of the active page.
- Present playback controls, progress, and settings in a dedicated Chrome side panel.
- Synthesize speech through a local Fastify backend backed by Google Cloud TTS.
- Fall back to `chrome.tts` when the backend is unavailable or not configured.
- Store settings, reading position, and pronunciation dictionary entries locally.

## Repository Layout

```text
apps/extension   Chrome extension runtime: side panel, background worker, content script, offscreen audio
apps/api         Fastify backend: health check, voice listing, TTS synthesis, token gate, rate limiting, caching
packages/shared  Shared TypeScript types and text-processing helpers used by the extension and API
```

The repository intentionally keeps `apps/extension` and `apps/api` separate instead of using a generic `frontend/backend` split, because the extension includes multiple Chrome-specific runtimes beyond a conventional web UI.

## Requirements

- Node.js 20+
- Chrome 116+

## Quick Start

```bash
npm install
npm run build
npm test
npm run typecheck
```

## Local Development

```bash
cp apps/api/.env.example apps/api/.env
npm run dev:api
npm run dev:extension
```

After building, load the unpacked extension from `apps/extension/dist` in `chrome://extensions`.

The current MVP defaults to `chrome.tts` for broad compatibility on regular websites. Google Cloud TTS is available as an opt-in experimental setting in the extension UI.

## Debugging

- API health: open `http://127.0.0.1:4317/health` or run `Invoke-RestMethod http://127.0.0.1:4317/health`.
- Extension background worker: open `chrome://extensions`, find ReadWebsite, and inspect the service worker.
- Side panel UI: open the side panel, right-click inside it, and choose `Inspect`.
- Restricted pages: Chrome blocks extensions on pages such as `chrome://...` and `chromewebstore.google.com`; test on standard websites instead.
