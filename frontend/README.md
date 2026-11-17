# Intern Portal — Login & Dashboard

Frontend ของโปรเจกต์เดิม ใช้ React + JavaScript/JSX + Vite, Tailwind CSS v4, shadcn/ui, Lucide, React Router และ Axios ทุกการแก้ไขในงานนี้อยู่ภายใน `frontend` เท่านั้น ไม่แก้ Backend, `.env` ของ Backend หรือฐานข้อมูล และไม่สร้าง/reset บัญชี admin

## เริ่มใช้งาน

จาก `frontend`:

```sh
npm install
npm run dev
```

เปิด <http://localhost:5173/login> ใช้บัญชี admin ที่คุณสร้างผ่าน DBeaver ไว้แล้ว ไม่จำเป็นต้องรัน seed เพิ่ม

Backend ต้องรันที่ <http://localhost:4000> หากยังไม่รัน ให้เปิดอีก terminal แล้วรันคำสั่งของ Backend เดิม:

```sh
cd ../backend
npm run dev
```

คำสั่งนี้เป็นแนวทางให้ผู้ใช้เริ่ม server เท่านั้น งาน Frontend นี้ไม่ได้แก้ไฟล์ Backend หรือรัน seed

API client ใช้ `VITE_API_BASE_URL` หรือค่าเริ่มต้น `http://localhost:4000/api` จึงรัน local ได้โดยไม่สร้าง `.env` ใหม่ หากต้องเปลี่ยนให้ดู `.env.example` ตัวแปร `VITE_` เปิดเผยใน browser bundle ได้ ห้ามใส่ passwords หรือ JWT secrets

ใช้ `localhost` ทั้ง Frontend และ Backend เพื่อให้ cookie/origin สอดคล้องกับ CORS เดิม Vite ตั้ง port 5173 และ `strictPort: true` เพื่อไม่เปลี่ยน port เงียบ ๆ จน CORS ใช้ไม่ได้

```sh
npm run build       # สร้าง dist
npm run preview     # preview build; ไม่ใช่ production hosting
npm test            # 14 tests: React DOM + mock Axios
npm run test:ui     # 16 browser checks: mocked API, ใช้ Google Chrome ที่ติดตั้งอยู่
npm run test:e2e    # real API + existing account; กรอกรหัสผ่านเองใน Chrome
```

Browser tests ต้องมี frontend/backend ที่ใช้ทดสอบเปิดอยู่ `test:ui` intercept auth requests ภายใน browser และไม่เขียนฐานข้อมูล `test:e2e` ใช้ Chrome ที่มีบนเครื่องผ่าน `playwright-core` ไม่ดาวน์โหลด browser เพิ่ม ไม่มี password ค่าเริ่มต้น ไม่มี traces/HAR/storage state ที่เก็บ cookie และไม่แสดง credentials ในรายงาน

## Design

ปรับตามภาพอ้างอิงเป็น **Intern Portal** แบบเรียบง่าย: พื้นสีอ่อน, sidebar สีเข้ม, ปุ่มสีน้ำเงิน, การ์ดขาวและตัวอักษรอ่านง่าย

- Login: การ์ดฟอร์มกลางหน้าจอ พร้อม validation, show/hide และ loading/error
- Dashboard: ข้อมูลบัญชีและ session, profile, check session และ logout พร้อม mobile drawer
- ตัดภาพประกอบ แบนเนอร์ ข้อความประชาสัมพันธ์ และส่วนตกแต่งที่ไม่จำเป็นออก
- ไม่มีสถิติสมมติหรือเมนูที่ไม่มีหน้าปลายทาง
- ฟังก์ชัน Authentication และ API integration เดิมยังคงอยู่
- fixture `preview_user` ใช้เฉพาะ browser tests ไม่ใช่ข้อมูลใน application

ตั้งค่า Tailwind ด้วย [Vite plugin ตามเอกสาร](https://tailwindcss.com/docs/installation/using-vite) และสร้าง shadcn/ui ผ่าน CLI โดยตั้ง [`tsx: false`](https://ui.shadcn.com/docs/javascript) สำหรับ JavaScript จากนั้นปรับ components ให้ใช้ `src/lib/utils.js` ร่วมกัน

## โครงสร้างและไฟล์ที่เปลี่ยน

```text
frontend/
├── public/favicon.svg                 แก้: brand icon
├── src/
│   ├── components/
│   │   ├── ui/                        ใหม่: shadcn components 9 รายการ
│   │   │   ├── alert.jsx
│   │   │   ├── avatar.jsx
│   │   │   ├── badge.jsx
│   │   │   ├── button.jsx
│   │   │   ├── card.jsx
│   │   │   ├── input.jsx
│   │   │   ├── label.jsx
│   │   │   ├── separator.jsx
│   │   │   └── sheet.jsx
│   │   ├── layout/
│   │   │   ├── Header.jsx             ใหม่: header และ mobile drawer
│   │   │   └── Sidebar.jsx            ใหม่: nav, profile, sign out
│   │   ├── AuthStatus.jsx             ใหม่: loading/retry สำหรับ session check
│   │   ├── Brand.jsx                  ใหม่: logo ที่ใช้ร่วมกัน
│   │   ├── UserAvatar.jsx             ใหม่: initials จาก username จริง
│   │   ├── ProtectedRoute.jsx         ใหม่: ป้องกัน dashboard
│   │   └── PublicRoute.jsx            ใหม่: redirect ผู้ที่ login แล้ว
│   ├── context/
│   │   ├── AuthContext.jsx            ใหม่: provider, user, login/logout/checkAuth
│   │   ├── auth-context.js            ใหม่: context object
│   │   └── useAuth.js                 ใหม่: hook เข้าถึง context
│   ├── lib/
│   │   ├── api.js                     ใหม่: Axios instance พร้อม credentials/timeout
│   │   └── utils.js                   ใหม่: cn utility
│   ├── pages/
│   │   ├── Login.jsx                  ใหม่: validation, visibility, submit/errors
│   │   └── Dashboard.jsx              ใหม่: account/session UI และ logout feedback
│   ├── test/
│   │   ├── setup.js                   ใหม่: jsdom setup/cleanup
│   │   └── auth.test.jsx              ใหม่: auth regression tests 14 รายการ
│   ├── App.jsx                        แก้: routing และ 404
│   ├── main.jsx                       แก้: BrowserRouter/AuthProvider
│   └── index.css                      แก้: Tailwind theme และ responsive design
├── scripts/
│   ├── ui-smoke.mjs                   ใหม่: browser regression แบบ mock API
│   └── e2e-local.mjs                  ใหม่: real API + local password handoff
├── .env.example                       ใหม่: public API endpoint example
├── .gitignore                         แก้: env และ test artifacts
├── components.json                    ใหม่: shadcn config แบบ JSX
├── jsconfig.json                      ใหม่: @ alias สำหรับ editor
├── vite.config.js                     แก้: Tailwind, alias, strict port
├── vitest.config.js                   ใหม่: test environment
├── index.html                         แก้: title/favicon metadata
├── package.json                       แก้: dependencies และ test scripts
├── package-lock.json                  แก้: npm lockfile จริง
├── README.md                          แก้: คู่มือปัจจุบันแทน Vite starter
└── TEST_REPORT.md                     ใหม่: ผลตรวจสอบจริงและข้อจำกัด
```

ลบ assets, icon sprite และ `src/App.css` ของ Vite starter ที่ไม่มี references แล้ว รวมถึง shadcn helper components ที่ไม่ได้ใช้ คง components ที่ใช้งานและ tests เดิมไว้ ไม่เปลี่ยน `eslint.config.js` โฟลเดอร์นี้ไม่มี Git repository จึงไม่สามารถแสดง Git diff ได้ ดูรายการ cleanup ใน `../CLEANUP_REPORT.md`

## Dependencies ที่เพิ่ม

Runtime: `axios`, `react-router`, `lucide-react`, `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`

Development: `tailwindcss`, `@tailwindcss/vite`, `tw-animate-css`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `axios-mock-adapter`, `playwright-core`

shadcn/ui เป็น source components ใน `src/components/ui` ไม่ใช่ UI framework อีกชุดหนึ่ง คง React/Vite และ dependencies เดิมไว้

## Authentication flow

1. เริ่ม application → `GET /auth/me` ผ่าน Axios instance พร้อม `withCredentials: true` ระหว่างรอแสดง loading โดยไม่รีบ redirect
2. 200 → เก็บเฉพาะ `id`, `username`, `email`, `role` ใน React state; 401 → unauthenticated; network/500 → error พร้อม retry โดยไม่แสดงว่า logout แล้ว
3. Login ผ่าน validation → `POST /auth/login` → ใช้ public user จาก response โดยตรง → dashboard ไม่เรียก `/me` ซ้ำหลัง login
4. Refresh หรือเปิด `/dashboard` ตรง → ตรวจ `/me` ใหม่ Cookie ถูก browser ส่งให้อัตโนมัติ
5. กลับมาโฟกัส tab ที่ login อยู่ หรือกด Check session → ตรวจ `/me` อีกครั้ง ไม่มี polling
6. Logout → รอ `POST /auth/logout` ยืนยัน success ก่อนล้าง user และไป login; หาก request ล้มเหลวยังคง user พร้อมแจ้ง error
7. `/login` เมื่อ authenticated จะไป dashboard; `/dashboard` เมื่อ unauthenticated จะไป login; request check ถูก deduplicate แม้อยู่ใน React StrictMode

ไม่มีการอ่าน `document.cookie`, ไม่เก็บ JWT/password ใน localStorage/sessionStorage และไม่ log credentials ProtectedRoute ทำหน้าที่ UX; Backend ยังคงเป็นตัวตรวจสิทธิ์ API จริง

## ผลทดสอบและข้อจำกัด

ดู [TEST_REPORT.md](./TEST_REPORT.md) ซึ่งแยกผล browser+Backend จริงออกจากผล mock ชัดเจน

- Production build ผ่าน
- React DOM tests 14/14 ผ่าน
- Chrome browser regression แบบ mock API 16/16 ผ่าน
- Browser กับ Backend จริงผ่าน 13 checks ก่อนการกรอกรหัสผ่าน
- ผู้ใช้เลือกเลื่อน Login จริงไว้ภายหลัง จึงยังไม่ยืนยัน successful real login, real user Dashboard, refresh authenticated session หรือ logout ของ session จริง
- `npm audit` ของ Frontend ไม่พบ vulnerabilities

ก่อน production ต้องตั้ง API URL/HTTPS และ CORS/cookie ให้ตรง deployment รวมถึงตั้ง web server ให้ fallback เส้นทาง SPA ไป `index.html` การป้องกัน CSRF, rate limiting และข้อจำกัด stateless JWT ยังต้องจัดการฝั่ง Backend ตามโครงการเดิม ไม่เพิ่มหรือเปลี่ยน backend security ในงานนี้
