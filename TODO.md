# ReadWebsite MVP TODO

## Context Resume Rule
- Khi bat dau mot phien moi hoac sau khi bi compact/het context, doc file nay truoc.
- Dung file nay lam nguon su that ve muc tieu, quyet dinh da chot, tien do va viec tiep theo.
- Moi khi hoan thanh mot hang muc lon, cap nhat checklist nay de phien sau tiep tuc dung mach.

## Product Goal
- Xay Chrome Extension Manifest V3 doc noi dung tren bat ky website.
- Uu tien trai nghiem nghe truyen chu tieng Viet dich, bot may moc hon cac extension doc web tong quat.
- Luong chinh: side panel lay text vung chon hoac noi dung chinh cua trang, chia doan, doc bang Google Cloud TTS qua backend rieng, fallback bang `chrome.tts`.

## Decisions Locked
- Internal name: `ReadWebsite`.
- Stack: React + TypeScript + Vite cho extension.
- Backend: Node.js + TypeScript + Fastify.
- Repo layout: npm workspaces voi `apps/extension`, `apps/api`, `packages/shared`.
- UI chinh: Chrome Side Panel.
- TTS cloud mac dinh: Google Cloud Text-to-Speech.
- Kiem soat chi phi MVP: `X-Dev-Token`, gioi han ky tu/request, rate limit theo token/IP, cache audio theo hash.
- MVP chua lam PDF/EPUB, dang nhap that, thanh toan, sync cloud, playlist chuong, mobile, hay publish Chrome Web Store.

## Implementation Checklist

### 1. Monorepo Scaffold
- [x] Tao `package.json` root voi npm workspaces.
- [x] Tao TypeScript/base config dung chung.
- [x] Tao `apps/extension`.
- [x] Tao `apps/api`.
- [x] Tao `packages/shared`.
- [x] Them scripts root: `dev`, `build`, `test`, `typecheck`.

### 2. Shared Package
- [x] Dinh nghia shared types cho voice, settings, TTS request/response, extraction result.
- [ ] Them text preprocessing helpers:
  - [x] Normalize whitespace va dau cau.
  - [x] Xu ly dau `...`, hoi thoai, tieu de `Chuong 123`.
  - [x] Tach chunk an toan cho TTS.
  - [x] Ap dung pronunciation dictionary ca nhan.
- [x] Them cache key helper theo `{ text, voice, rate, pitch }`.
- [x] Unit test cho normalization, chunking, dictionary va cache key.

### 3. Backend API
- [x] Tao Fastify server TypeScript.
- [x] Endpoint `GET /health`.
- [x] Endpoint `GET /voices?lang=vi-VN`.
- [x] Endpoint `POST /tts/synthesize` nhan `{ text, voice, rate, pitch, format }`.
- [x] Tich hop Google Cloud TTS voi fallback voice:
  - [x] `vi-VN-Chirp3-HD-*` neu kha dung.
  - [x] `vi-VN-Neural2-*`.
  - [x] `vi-VN-Wavenet-*`.
- [x] Middleware `X-Dev-Token`.
- [x] Gioi han ky tu/request.
- [x] Rate limit theo token/IP.
- [x] Cache audio theo hash.
- [x] Tra loi loi co ma ro rang: invalid token, text too long, quota/rate limit, provider timeout, provider failure.
- [x] Test integration voi Google TTS mock.

### 4. Chrome Extension
- [x] Tao Manifest V3 voi permissions: `sidePanel`, `storage`, `scripting`, `activeTab`, `contextMenus`, `tts`, `offscreen`; commands nam o manifest top-level.
- [x] Khong xin `<all_urls>` trong MVP.
- [x] Tao service worker:
  - [x] Open side panel.
  - [x] Context menu doc vung chon/trang hien tai.
  - [x] Commands keyboard co ban.
  - [x] Messaging voi side panel va content script.
- [ ] Content extraction:
  - [x] Uu tien selected text.
  - [x] Neu khong co selection, dung `@mozilla/readability`.
  - [x] Loc bo menu/quang cao/noise co ban.
- [x] Highlight doan dang doc trong trang.
- [x] Offscreen/audio playback cho audio cloud.
- [x] Fallback `chrome.tts` khi backend loi hoac chua cau hinh.
- [x] Luu local settings, reading position theo URL, cache metadata va dictionary bang `chrome.storage`.

### 5. Side Panel UI
- [x] React side panel voi layout doc/truyen ro rang, khong lam landing page.
- [x] Controls: Play/Pause/Stop.
- [x] Progress: index doan, tong doan, trang thai dang doc.
- [x] Voice selector.
- [x] Speed control.
- [x] Highlight toggle.
- [x] Cache status.
- [x] Fallback indicator.
- [x] Dictionary editor toi thieu cho phat am ca nhan.
- [x] Hien thi ro rang noi dung co the duoc gui toi backend/Google Cloud TTS.
- [x] Viet hoa UI side panel co dau va chinh typography de chu tieng Viet ro hon trong khung hep.
- [x] Hien thi loi than thien khi Chrome chan doc trang nhu `chromewebstore.google.com` thay vi loi JavaScript tho.
- [x] Don gian hoa UI theo huong Read Aloud: mot nut doc chinh, cac nut tam dung/dung/refresh, setting an sau nut gear.
- [x] Doi mac dinh sang `chrome.tts`; Google Cloud TTS la tuy chon thu nghiem opt-in de uu tien doc duoc tren web thuong truoc.
- [x] Them icon rieng cho extension thay cho fallback chu `R`: `apps/extension/public/icons/icon-*.png`.

### 6. Verification
- [x] `npm install`.
- [x] `npm run build`.
- [x] `npm test`.
- [x] `npm run typecheck`.
- [ ] Manual Chrome test:
  - [ ] Doc vung chon.
  - [ ] Doc toan trang.
  - [ ] Pause/resume/stop.
  - [ ] Doi tab.
  - [ ] Reload trang van giu tien do.
  - [ ] Side panel dong/mo lai van tiep tuc dung trang thai.
- [ ] Chat luong truyen: test it nhat 5 chuong tieng Viet dich.

## Next Step
- Cau hinh `apps/api/.env` voi Google service account that.
- Chay backend local tai `http://127.0.0.1:4317`.
- Load unpacked extension tu `apps/extension/dist` trong Chrome va lam manual test.
- Tinh chinh chat luong doc bang 5 chuong truyen tieng Viet dich.
- Sau moi lan build extension, bam reload extension trong `chrome://extensions` de Chrome nhan file `dist` moi.
