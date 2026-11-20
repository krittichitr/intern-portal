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
npm test            # React DOM + mock Axios; ดูจำนวนล่าสุดจากผลคำสั่ง
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


## C1–C2 Role Relation — 20 พฤศจิกายน 2026

Backend ยังคงส่ง `user.role` เป็น String แต่ใช้ Role Relation เป็นแหล่งข้อมูล AuthContext/Login/AuthStatus รองรับ `403 + RBAC_NOT_READY` แยกจาก Network Error พร้อมข้อความให้ติดต่อผู้ดูแล Session Check ล้าง User เก่าและยกเลิกผลของ Profile/Avatar Response ที่ค้างอยู่ด้วย Revision เดิม ไม่มีการเปลี่ยน Design หรือ JWT/Cookie ผลตรวจล่าสุด: Frontend Tests 100 PASS, Build PASS และ Lint PASS (ผลจำนวน Tests ก่อนหน้านี้เป็นประวัติเดิม)


## Frontend RBAC — งานครบหน้าตาม Assignment (20 พฤศจิกายน 2026)

### Routes และหน้าจอ

| Route | ฟังก์ชัน |
|---|---|
| /login | Login เดิม; หลังสำเร็จใช้ Landing ตามสิทธิ์ |
| /dashboard | Dashboard เดิมผ่าน Menu Grant |
| /profile | Profile/Edit/Avatar เดิมผ่าน Menu Grant |
| /admin/menus | ตาราง/เพิ่ม/แก้ไข/ลบ/Parent/Icon/Path/Sort/Active |
| /admin/roles | Role CRUD และ Explicit Menu Checkboxes |
| /admin/users | ตาราง User แบบแบ่งหน้า เลือก Role เดียวแล้ว Save |
| /403 | ข้อความไม่มีสิทธิ์, Reload Permissions, กลับหน้าที่เข้าได้ และ Logout |

Admin Screens ต้องมี Role ADMIN และ Direct Menu Grant ด้วย Unknown Paths แสดง 404 ไม่สร้างหน้าจาก Menu Path อัตโนมัติ Menu CRUD ไม่ได้สร้าง React Component ใหม่ ผู้พัฒนาต้องลงทะเบียนหน้าใน App/pageRegistry ก่อน

### การโหลดและ State

MenuProvider แยกจาก AuthContext เรียก /me/menus หลัง Auth พร้อม ใช้ข้อมูลจาก API จริง ไม่มี Fallback Hardcode Grants และไม่เก็บ Token/Cookie Value ใน React หรือ Browser Storage ตรวจ Contract/Allowed Paths ให้สอดคล้อง Tree ก่อนนำเข้า State

ใช้ Session Version + User ID + Role เป็น Scope, Promise Dedup ใน StrictMode และตัดผล Request เก่าเมื่อ Logout/เปลี่ยนบัญชี/Role Profile/Avatar เปลี่ยนแต่ Role เดิมไม่โหลดเมนูซ้ำโดยไม่จำเป็น Background Reload รักษาฟอร์มที่กำลังแก้ หากสิทธิ์ยังอยู่ เมื่อ API ยืนยันว่าถูกถอนจึงออกไป 403; Network/Invalid Response แสดง Retry แยกจาก No Grants

Window Focus โหลดสิทธิ์ล่าสุด โดยใช้ Request เดียวร่วม Desktop/Mobile Sidebar; Check Session บน Dashboard โหลดสิทธิ์ด้วย Root/Login/PublicRoute ใช้ Landing เดียวกัน: Dashboard ถ้าอนุญาต → Registered Page แรกตาม Tree → /403 ไม่มี Redirect Loop เมนู Parent ที่ไม่มี Grant เป็น Group คลิกไม่ได้

### การบันทึก

ใช้ Axios เดิม/withCredentials และ Sonner ที่ติดตั้งอยู่แล้ว แจ้งสำเร็จหลัง Backend ยืนยัน มี Pending Guards/Disabled Buttons ป้องกันกดซ้ำ Error 400/401/403/409/500/Network แสดงข้อความและ Retry ตามจุดที่เกิด ไม่แสดงสำเร็จเมื่อ API ล้มเหลว Delete ใช้ shadcn AlertDialog; Cancel ไม่ส่ง Request

Menu Form ส่งเฉพาะ 6 Editable Fields, กันเลือกตนเอง/Descendants เป็น Parent Role Form Code กำหนดเฉพาะตอน Create ส่วน Edit แก้ Name; Checkbox Assign ส่ง menuIds ทั้งชุด ไม่มี Permission รายคำสั่ง User Assignment ส่ง { roleId } เพียงค่าเดียว Target Response ไม่ทับ Admin AuthContext หากเป็นคนละ id Self-role Change ตรวจ Session/Permissions ใหม่ทันทีและออกจากหน้าที่ไม่มีสิทธิ์

User Picker ใช้ Supporting GET /users?page=…&pageSize=10 ตาม D005 เดิม (Backend เพิ่ม Read-only/Admin-only เท่านั้น) ไม่เพิ่ม Create/Delete/Deactivate User Profile Backend Write Guards เชื่อม /profile Grant แล้ว Me/Logout/รูป Public ยังใช้ Flow เดิม

### ไฟล์หลัก

- context/MenuContext.jsx, menu-context.js, useMenus.js — Menu State/Scoped Requests
- lib/menu-navigation.js — Validation/Registry/Filtering/Landing
- components/MenuRoute.jsx, MenuStatus.jsx, pages/Forbidden.jsx — Page Guard/403/Error/Loading
- components/layout/Sidebar.jsx และ ManagementLayout.jsx — Shared Desktop/Mobile Navigation/Layout
- hooks/useAdminApi.js และ lib/admin-response.js — Scoped List/Mutation Loading/Errors/Whitelisted State
- pages/MenuManagement.jsx, RoleManagement.jsx, UserRoleAssignment.jsx — หน้าจัดการจริง
- AuthContext เพิ่ม sessionVersion เล็กน้อยเพื่อแยก Login Sessions; Promise Dedup/Revision เดิมไม่ถูกลบ

### ผลตรวจและวิธีทดสอบ

Build/Lint ผ่าน; Unit/DOM Tests **122 PASS** รวมของเดิม 100 และ RBAC เพิ่ม 22 Cases Browser **20 Checks PASS** ผ่าน Chrome/React/Express/PostgreSQL จริงบน Disposable DB ไม่ใช่ Mock API; Desktop/Mobile, CRUD/Assign/403/Empty Grants/Self-role Change/Edit Profile/Avatar/Refresh/Logout ผ่าน ไม่พบ JS/Console Error หรือ Unexpected 5xx ในรอบนั้น

คำสั่ง npm run test:rbac:e2e ต้องระบุ RBAC_TEST_DATABASE_URL เป็น Local DB ชื่อ login_rbac_test_* Schema public ต่างจาก backend/.env Application DB และ Deploy Migrations ก่อน ต้องเริ่มว่าง Script เริ่ม Backend/Vite บน Ports ชั่วคราวเอง ใช้ Test Credentials ใน Memory ไม่บันทึก Trace/HAR/Storage State และไม่ทดสอบ Mutation กับ Dev Database

ภาพ QA ใช้ข้อมูล Fixture ที่ลบทิ้งแล้ว: ../docs/rbac/screenshots/menu-management-desktop.png, profile-mobile.png และ rbac-browser-results.json (เฉพาะ Method/Path/Status ไม่มี Headers/Body/Secrets)

การทดสอบด้วยตนเองบน Dev: Login Admin เดิม → เปิดสามหน้าจัดการ → ทดลองกับข้อมูลทดสอบที่ตั้งใจแก้; Login Manager/User ตรวจ Sidebar/URL 403; Refresh/Logout และแก้ Profile ตามสิทธิ์ ข้อมูล Dev ไม่ได้ถูกเปลี่ยนอัตโนมัติในงานนี้ .env/Dependencies ไม่เปลี่ยน และไม่มี Commit/Push


## ชื่อบัญชี Dev ล่าสุด — 20 พฤศจิกายน 2026

ชุดข้อมูลลดเหลือ 18 คน: Admin 3 (admin01–03), Manager 5 (manager01–05), User 10 (user01–10) Admin เดิมคือ admin01 และนับรวมในสามคนแล้ว รหัสผ่านปรับตามรูปแบบง่าย/เลขท้ายที่ผู้ใช้กำหนดครบทุกคน ดูไฟล์ Credentials Private ที่เครื่อง ไม่แสดงค่าในรายงาน Refresh หน้าเว็บหนึ่งครั้งเพื่อโหลดรายชื่อ/Username ล่าสุด UI/Routes/Role Menu Grants ไม่เปลี่ยนจากการปรับข้อมูลนี้


## Popup สำหรับการจัดการข้อมูล — 20 พฤศจิกายน 2026

ใช้ Dialog/AlertDialog จาก Registry ทางการ shadcn/ui (new-york-v4, แปลง TypeScript เป็น JSX) และ radix-ui ที่ติดตั้งอยู่แล้ว ไม่เพิ่ม Library ใหม่ ครอบฟอร์ม Edit Profile, Change Photo, Add/Edit Menu, Add/Edit Role, Assign Menu และ Edit User Role; การลบและเปลี่ยน Role ตนเองใช้ AlertDialog ยืนยัน

เมื่อ Backend ยืนยันสำเร็จจึงปิด Popup และแจ้งด้วย Sonner เดิม หาก API ผิดพลาดยังเก็บข้อมูลให้แก้/ลองใหม่ ระหว่างส่งห้ามกดซ้ำหรือปิด Popup Cancel ไม่ส่ง Request มี Focus Trap/คืน Focus และ Dialog เลื่อนเนื้อหาได้บนมือถือ

ตามคำขอ ยังไม่เพิ่ม Sonner สี่จุด: Profile validation/อีเมลซ้ำ 409, Menu validation, Role required/code validation และ Avatar validation/preview error ข้อความเดิมยังแสดงอยู่ ปุ่ม Reload navigation ใน Sidebar ถูกนำออกตามอนุมัติ; การโหลดเมนูเมื่อ Login, Window Focus, Check Session และหลังแก้สิทธิ์ยังทำงานเดิม

Build/Lint ผ่าน, Unit/DOM Tests 128 ผ่าน (รันทีละ Worker) และ Chrome E2E 20 Checks ผ่านบนฐานข้อมูลชั่วคราวที่ลบทิ้งหลังทดสอบ ตรวจยืนยันข้อมูล dev ไม่เปลี่ยน ภาพ Popup ตัวอย่างอยู่ใน docs/rbac/screenshots/menu-edit-dialog-desktop.png และ profile-edit-dialog-mobile.png ไม่มีการแก้ Backend, .env หรือ Schema ในรอบ Popup และไม่มี Commit/Push
