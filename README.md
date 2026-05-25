<p align="center">
  <img src="apps/extension/public/icons/icon.svg" alt="ReadWebsite logo" width="96" height="96" />
</p>

<h1 align="center">ReadWebsite</h1>

<p align="center">
  A Chrome extension that reads web pages and selected text aloud, built for long-form reading and Vietnamese story websites.
</p>

<p align="center">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Chrome-Manifest%20V3-1a73e8" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178c6" />
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-20%2B-3c873a" />
</p>

## Overview

ReadWebsite is an MVP Chrome extension for turning web pages into speech. It focuses first on reliable reading with the browser's built-in `chrome.tts`, then keeps Google Cloud Text-to-Speech available as an optional upgrade path for more natural voices.

The extension uses a clean side-panel player, page text extraction, reading progress, local settings, and a small Fastify backend for future cloud TTS experiments.

## Features

- Read selected text or the main content of the active page.
- Use a minimal Chrome side panel with play, pause, stop, refresh, and settings.
- Default to `chrome.tts` so the extension can be tested without a backend.
- Optionally enable Google Cloud TTS through the local Fastify API.
- Store reading position and preferences in Chrome local storage.
- Extract readable page content with `@mozilla/readability`.

## Project Structure

```text
apps/extension    Chrome extension: side panel, background worker, content script, offscreen audio
apps/api          Fastify API: health check, voices, TTS synthesis, token gate, rate limit, cache
packages/shared   Shared TypeScript types, text preprocessing, chunking, cache helpers
```

This repo keeps `apps/extension` and `apps/api` separate because a Chrome extension has multiple browser runtimes, not just a normal web frontend.

## Requirements

- Node.js 20+
- npm 10+
- Chrome 116+

Google Cloud credentials are only required if you enable the experimental cloud TTS mode.

## Quick Start

```bash
npm install
npm run build
npm test
npm run typecheck
```

## Load The Extension

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select:

```text
apps/extension/dist
```

After every rebuild, click reload on the extension card in `chrome://extensions`.

## Optional Backend

The backend is only needed for Google Cloud TTS mode.

```bash
cp apps/api/.env.example apps/api/.env
npm run dev:api
```

Health check:

```bash
curl http://127.0.0.1:4317/health
```

PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:4317/health
```

## Development Commands

```bash
npm run dev:api        # Start Fastify API in watch mode
npm run dev:extension  # Rebuild extension in watch mode
npm run build          # Build all workspaces
npm test               # Run shared, API, and extension tests
npm run typecheck      # Type-check all workspaces
```

## Debugging

- Extension background: open `chrome://extensions`, find ReadWebsite, then inspect the service worker.
- Side panel UI: open the side panel, right-click inside it, then choose `Inspect`.
- API: check `http://127.0.0.1:4317/health`.
- Restricted pages: Chrome blocks extensions on `chrome://...` and `chromewebstore.google.com`, so test on regular websites.

## Status

ReadWebsite is currently an MVP. The first goal is stable reading on normal websites with `chrome.tts`. Natural cloud voices, richer Vietnamese pronunciation rules, and better story-site extraction can be improved after the base reading flow is solid.
