# ReadWebsite

Chrome Extension MVP để đọc website và truyện chữ tiếng Việt tự nhiên hơn bằng Google Cloud Text-to-Speech qua backend riêng.

## Project Layout

```text
apps/extension   Chrome extension frontend: side panel, background, content script, offscreen audio
apps/api         Backend Fastify: health, voice list, Google TTS synthesis, token/rate-limit/cache
packages/shared  TypeScript types và helper dùng chung cho cả extension/backend
```

Giữ cấu trúc `apps/extension` và `apps/api` thay vì đổi thành `frontend/backend`, vì extension có nhiều runtime riêng của Chrome chứ không chỉ là một web frontend thông thường.

## Quick Start

```bash
npm install
npm run build
npm test
```

## Development

```bash
cp apps/api/.env.example apps/api/.env
npm run dev:api
npm run dev:extension
```

Load extension từ `apps/extension/dist` trong `chrome://extensions` sau khi build.

MVP hiện ưu tiên đọc được trước bằng `chrome.tts`. Google Cloud TTS đang là tùy chọn thử nghiệm trong phần Cài đặt của extension.

## Debug

- Backend: mở `http://127.0.0.1:4317/health` hoặc chạy `Invoke-RestMethod http://127.0.0.1:4317/health`.
- Extension background: vào `chrome://extensions`, tìm ReadWebsite, bấm `service worker`.
- Side panel UI: mở side panel, click phải trong panel, chọn `Inspect`.
- Chrome chặn extension đọc các trang như `chrome://...` và `chromewebstore.google.com`; hãy test trên website thường hoặc bôi đen một đoạn văn bản rồi bấm Đọc.
