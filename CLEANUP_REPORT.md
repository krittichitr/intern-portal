# Cleanup & Code Audit — Login Dashboard V1

วันที่ 17 พฤศจิกายน 2026 เป้าหมายคือเอาไฟล์/โค้ดที่ยืนยันว่าไม่ใช้แล้วออก โดยไม่เปลี่ยน UI, สถาปัตยกรรม, API contract หรือ authentication flow

## ขอบเขตและหลักฐาน

ตรวจ entry points → imports → routes/controllers/middleware → shared Prisma/Axios clients → tests/config/scripts ก่อนลบ ไม่ใช้ migration/reset/db push ไม่แก้ PostgreSQL หรือ `.env` ไม่เพิ่ม dependencies และไม่เปลี่ยนเวอร์ชัน

ไม่มี Git repository ใน project root หรือ parent จึงใช้ Git status/diff ไม่ได้ ไม่สร้าง Git ใหม่ ใช้ file inventory และ SHA-256 ก่อน/หลังแทน โดยไม่แสดง hash หรือค่าของ secrets ในรายงาน

## ไฟล์ที่ลบ

| ไฟล์/กลุ่ม | เหตุผลและ references ที่ตรวจ |
| --- | --- |
| `frontend/src/App.css` | CSS จาก Vite starter ไม่มี import; ปัจจุบันใช้ `src/index.css` จาก `main.jsx` |
| `frontend/src/assets/react.svg` | logo ของ starter ไม่มี import หรือ URL reference |
| `frontend/src/assets/vite.svg` | logo ของ starter ไม่มี import หรือ URL reference |
| `frontend/src/assets/hero.png` | ภาพ starter ที่ไม่มี import และ UI ปัจจุบันไม่ใช้ |
| `frontend/public/icons.svg` | SVG sprite ของหน้า starter ไม่มี `<use>` หรือ reference ใน UI ปัจจุบัน |
| `backend/src/seed-admin.js` | ผู้ใช้ยืนยันว่ามี admin ที่สร้างผ่าน DBeaver แล้ว; ไม่ถูก import จาก runtime มีเพียง npm script และเอกสารที่เคยอ้างถึง ซึ่งปรับพร้อมกัน |
| `backend/generated/prisma/` จำนวน 10 ไฟล์ | ตรวจ generated headers, references และ generator จริงแล้ว: `prisma-client-js` ใช้ `@prisma/client` ใน `node_modules` ไม่ใช้โฟลเดอร์นี้; ลบเฉพาะ output เก่า ไม่ลบ active Prisma Client |
| `.DS_Store` ที่ project root | metadata ของ Finder ไม่ใช่ source/config ของระบบ |
| `frontend/test-results/` | ลบ screenshots/JSON ของ QA ครั้งก่อนและ outputs ที่สร้างซ้ำระหว่างตรวจ cleanup; เก็บ scripts/tests ที่สร้างใหม่ได้ไว้ครบ |

Prisma output เก่าที่ลบ ได้แก่ `browser.ts`, `client.ts`, `commonInputTypes.ts`, `enums.ts`, `models.ts`, `models/users.ts`, `internal/class.ts`, `internal/prismaNamespace.ts`, `internal/prismaNamespaceBrowser.ts` และ `libquery_engine-darwin.dylib.node`

รวมไฟล์ที่ลบจาก source inventory เดิม 17 ไฟล์ และ QA artifacts ที่แยกไว้ใน ignored directory ไม่มีไฟล์ผู้ใช้ที่ไม่ทราบวัตถุประสงค์ถูกลบ

## โค้ดและ scripts ที่ลบ

- `avatar.jsx`: `AvatarImage`, `AvatarBadge`, `AvatarGroup`, `AvatarGroupCount` — ไม่ถูก import/เรียกใช้
- `card.jsx`: `CardAction`, `CardFooter` — ไม่ถูก import/เรียกใช้
- `alert.jsx`: `AlertTitle` — ไม่ถูก import/เรียกใช้
- `sheet.jsx`: `SheetClose`, `SheetHeader`, `SheetFooter` — ไม่มี callers; internal Portal/Overlay/Close ที่ SheetContent ใช้ยังอยู่
- `button.jsx`, `badge.jsx`: เอาเฉพาะ export ของ `buttonVariants`/`badgeVariants` ที่ไม่มีผู้ใช้ภายนอกออก โดยเก็บตัวแปรและการใช้งานภายในไว้ ทำให้ผ่าน Fast Refresh lint rule โดยไม่ปิด rule
- เอา `use client` ที่ไม่มีผลกับ Vite SPA ออกจาก Avatar/Sheet
- เอา span และ CSS `.nav-active-dot` ที่ซ่อนด้วย `display: none` ตลอดออก
- เอา class markers `eyebrow` และ `mobile-menu-button` ที่ไม่มี CSS references ออก โดยเก็บ Tailwind `lg:hidden` ไว้
- Backend: ลบ npm script `seed:admin` และตัวแปร seed ใน `.env.example`; `.env` จริงไม่เปลี่ยน
- ไม่พบ `test-db.js` และไม่มี `/api/test-db` ใน server อยู่แล้ว จึงไม่มี endpoint ที่ต้องลบเพิ่ม; ตรวจ HTTP แล้วได้ 404 และเก็บ regression assertion ไว้

ยังคง GET `/api/health`, POST `/api/auth/login`, GET `/api/auth/me`, POST `/api/auth/logout` ครบ โดย Backend runtime source ไม่เปลี่ยน

## Dependencies

**ไม่มี package ที่ถอนการติดตั้ง** เพราะทุก direct dependency มีหน้าที่ใน runtime, configuration, tests หรือ editor tooling:

- Frontend runtime: React/React DOM, Router, Axios, Lucide, Radix, CVA, clsx, tailwind-merge
- Frontend configuration: Vite/React plugin, Tailwind/Vite plugin, tw-animate-css, ESLint และ plugins
- Frontend tests: Vitest/jsdom, Testing Library, Axios mock adapter, playwright-core
- `@types/react` และ `@types/react-dom` เก็บไว้สำหรับ JSX/editor และ tooling
- Backend: Express, Prisma/Client, bcryptjs, JWT, cookie-parser, CORS, dotenv ยังใช้ทั้งหมด แม้ลบ seed แล้ว bcryptjs ยังต้องใช้ตรวจ login

เรียก npm เพื่อประเมิน lockfile ตามปกติแล้ว การลบ script อย่างเดียวไม่ทำให้ lockfile เปลี่ยน เก็บ `package-lock.json` เดิมทั้งสองฝั่ง และตรวจ locked package versions ก่อน/หลังตรงกันทุกตัว ไม่ลบ `node_modules`

## ไฟล์ที่แก้ไข

- `backend/package.json`
- `backend/.env.example`
- `backend/README.md` — เอาคำสั่ง seed และโครงสร้างเก่าออก ชี้ไปบัญชีเดิมและแยกผลทดสอบในอดีตจาก cleanup นี้
- `frontend/src/App.jsx`
- `frontend/src/components/layout/Header.jsx`
- `frontend/src/components/layout/Sidebar.jsx`
- `frontend/src/components/ui/alert.jsx`
- `frontend/src/components/ui/avatar.jsx`
- `frontend/src/components/ui/badge.jsx`
- `frontend/src/components/ui/button.jsx`
- `frontend/src/components/ui/card.jsx`
- `frontend/src/components/ui/sheet.jsx`
- `frontend/src/index.css`
- `frontend/README.md` — ปรับสถานะไฟล์ starter ที่ลบและอ้างรายงานนี้
- `CLEANUP_REPORT.md` — รายงานใหม่

`package-lock.json` ทั้งสองไฟล์, `.gitignore` ทั้งสองไฟล์, Prisma schema/config, Backend auth/config/server/Prisma client source และ Frontend auth provider/API client/login/dashboard/protected/public routes ไม่เปลี่ยน ตรวจด้วย SHA-256 เทียบ baseline

## ไฟล์ที่เก็บไว้

- `.vscode/settings.json`: เป็นการตั้ง editor ให้คง Prisma 6 มีวัตถุประสงค์ชัดเจน ไม่ลบ user configuration
- `backend/prisma.config.ts`: Prisma CLI ใช้งานจริง ไม่เปลี่ยนเพียงเพราะ runtime เป็น JavaScript
- Backend `test/auth.integration.test.js`: มีประโยชน์ต่อ auth/JWT/cookie regression จึงเก็บไว้ แต่ไม่รันรอบนี้เพราะสร้าง/ลบ test fixtures ใน DB
- Frontend `src/test/`, `scripts/ui-smoke.mjs`, `scripts/e2e-local.mjs`: เป็น automated tests ที่ยังใช้ตรวจ functionality ไม่ใช่ไฟล์ทดลอง
- Mock fixture ใน tests: เก็บไว้เพราะใช้ตรวจ UI โดยไม่แตะ DB ไม่ถูก import เข้า runtime
- Theme tokens/variants ภายใน shadcn primitives ที่ใช้งาน: เก็บส่วนประกอบที่ reusable ไม่เปลี่ยน API ภายในของ component ที่ยังใช้
- `.gitignore` เดิม: คงทุกบรรทัดตามข้อกำหนด แม้ entry สำหรับ generated directory เก่าจะยังอยู่
- `.env` เดิม: ไม่ลบหรือแก้ค่าตัวแปรใด แม้ seed script ถูกถอดแล้ว

ไม่พบไฟล์ source อื่นที่ต้องเดาวัตถุประสงค์ก่อนลบ

## โครงสร้างหลัง cleanup

```text
Login/
├── .vscode/settings.json
├── CLEANUP_REPORT.md
├── backend/
│   ├── prisma/schema.prisma
│   ├── prisma.config.ts
│   ├── src/
│   │   ├── server.js
│   │   ├── config.js
│   │   ├── routes/auth.routes.js
│   │   ├── controllers/auth.controller.js
│   │   ├── middleware/auth.middleware.js
│   │   └── lib/prisma.js
│   ├── test/
│   │   ├── auth.integration.test.js
│   │   └── server.integration.test.js
│   ├── .env
│   ├── .env.example
│   ├── .gitignore
│   ├── package.json
│   ├── package-lock.json
│   └── README.md
└── frontend/
    ├── public/favicon.svg
    ├── src/
    │   ├── components/
    │   │   ├── ui/ (9 modules เฉพาะ helpers ที่ใช้)
    │   │   ├── layout/Header.jsx, Sidebar.jsx
    │   │   ├── AuthStatus.jsx, Brand.jsx, UserAvatar.jsx
    │   │   └── ProtectedRoute.jsx, PublicRoute.jsx
    │   ├── context/AuthContext.jsx, auth-context.js, useAuth.js
    │   ├── lib/api.js, utils.js
    │   ├── pages/Login.jsx, Dashboard.jsx
    │   ├── test/setup.js, auth.test.jsx
    │   ├── App.jsx
    │   ├── main.jsx
    │   └── index.css
    ├── scripts/ui-smoke.mjs, e2e-local.mjs
    ├── components.json
    ├── jsconfig.json
    ├── vite.config.js
    ├── vitest.config.js
    ├── eslint.config.js
    ├── index.html
    ├── .env.example
    ├── .gitignore
    ├── package.json
    ├── package-lock.json
    ├── README.md
    └── TEST_REPORT.md
```

ไม่แสดง `node_modules/` และ `frontend/dist/` ซึ่งเป็น dependencies/build output ที่คงไว้ ไม่มี migrations เดิมใน checkout นี้และไม่ได้เพิ่ม/ลบ migrations

## ผลทดสอบหลัง cleanup

| รายการ | ผลและขอบเขต |
| --- | --- |
| Frontend `npm run lint` | PASS รวม Fast Refresh export rules |
| Frontend `npm test` | PASS 14/14, React DOM + mocked Axios |
| Frontend `npm run build` | PASS ไม่มี broken imports/modules |
| Frontend `npm run test:ui` | PASS 16/16, Chrome + mocked auth API |
| Dashboard responsive / mobile drawer / focus / logout success/failure / route guard | PASS ใน Chrome mock API tests, 6 viewport widths |
| Dashboard refresh / login state / initial me deduplication | PASS ใน DOM tests ที่ mock API; ไม่ใช่ real authenticated session |
| Browser JavaScript runtime errors | ไม่พบใน UI regression run |
| เริ่ม Frontend ใหม่ผ่าน `npm run dev` | PASS บน ephemeral local port และตอบ HTTP 200 แล้วปิดเฉพาะ process ที่สร้าง |
| Backend `node --test test/server.integration.test.js` | PASS 2/2: startup/shutdown, safe DB-error response, production Secure/HttpOnly config |
| Backend JavaScript syntax ทั้ง src/test | PASS |
| Prisma `prisma:validate` | PASS โดยไม่แก้ schema หรือ migrate |
| Prisma เชื่อม local PostgreSQL หลังลบ generated output เก่า | PASS ด้วย SELECT 1 และอ่าน count ของ admin เท่านั้น |
| Server เดิม Frontend/Backend | HTTP 200 ทั้งคู่ ไม่หยุด server เดิมของผู้ใช้ |
| GET `/api/health` จริง | PASS 200 |
| GET `/api/auth/me` จริง ไม่มี cookie และ invalid cookie | PASS 401 ทั้งสองกรณี |
| POST `/api/auth/login` จริง body ว่าง | PASS 400 |
| POST `/api/auth/logout` จริง ไม่มี cookie | PASS 200 พร้อม HttpOnly cookie clearing attributes |
| GET `/api/test-db` จริง | PASS 404 |
| Login สำเร็จ/JWT cookie/Me ที่ authenticated/Refresh/Logout ของบัญชีจริง | ยังไม่ได้ทดสอบรอบนี้ ไม่มี password และผู้ใช้เคยขอทดสอบบัญชีจริงภายหลัง ไม่อ้างว่า mock tests ยืนยันผลนี้ |
| Backend full integration suite | ไม่รันเพื่อไม่ให้สร้าง/ลบ fixtures ในฐานข้อมูล แต่เก็บชุดทดสอบเดิมไว้ครบ |

## ยืนยันขอบเขต

ไม่มี SQL INSERT/UPDATE/DELETE หรือ DDL ในการตรวจครั้งนี้ ไม่สร้าง/reset user ไม่แก้ PostgreSQL, schema, `.env`, secrets, `.gitignore`, JWT/cookie config หรือ authentication contract

Audit verdict: cleanup พร้อมใช้งานต่อ โดย changes จำกัดอยู่ที่โค้ด/ไฟล์ที่ไม่มีผู้เรียกใช้และเอกสาร ผล real authenticated E2E ยังต้องให้ผู้ใช้ทดสอบด้วยบัญชีเดิมภายหลัง
