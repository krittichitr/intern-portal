# Backend Authentication V1

Backend JavaScript ES Modules สำหรับ Login → Dashboard ใช้ Express, Prisma 6.19.2 และ PostgreSQL เดิม ไม่แก้ frontend, schema หรือตาราง และไม่ใช้ migration/reset/db push

## การเริ่มใช้งาน

รันคำสั่งจากโฟลเดอร์ `backend`:

```sh
npm install
npm run prisma:generate
npm run prisma:validate
```

`.env` เดิมถูกเก็บไว้และเพิ่มเฉพาะตัวแปรที่ขาด รวม JWT secret แบบสุ่มสำหรับ local โดยไม่แสดงค่า ส่วน `DATABASE_URL` ไม่เปลี่ยนแปลง และไฟล์ `.env` จำกัดสิทธิ์เป็น 600

บัญชี admin มีอยู่แล้วและผู้ใช้จัดการผ่าน DBeaver จึงไม่ต้อง seed หรือเปลี่ยนรหัสผ่านเดิม

```sh
npm run dev
```

ใช้ `npm start` เพื่อเริ่ม server โดยไม่ watch ไฟล์ ค่าเริ่มต้น port 4000 หรือ `PORT` จาก environment

## โครงสร้างและหน้าที่ไฟล์

```text
backend/
├── prisma/
│   └── schema.prisma               # ของเดิม ไม่แก้ไข
├── prisma.config.ts                # ของเดิม ใช้เฉพาะ Prisma CLI
├── src/
│   ├── server.js                   # แก้ไข: Express, CORS, parsers, routes, errors, shutdown
│   ├── config.js                   # ใหม่: ตรวจ env, JWT config, cookie attributes, public fields
│   ├── routes/auth.routes.js       # ใหม่: จับคู่ URL กับ controller และ middleware
│   ├── controllers/auth.controller.js # ใหม่: login, me, logout
│   ├── middleware/auth.middleware.js  # ใหม่: verify JWT และตรวจ active user จาก DB
│   └── lib/prisma.js               # Prisma client ที่แชร์ต่อ process
├── test/
│   ├── auth.integration.test.js    # ใหม่: HTTP กับ PostgreSQL จริงและ curl cookie jar
│   └── server.integration.test.js  # ใหม่: startup, safe 500, shutdown, production cookie config
├── .env                            # เพิ่มเฉพาะค่าที่ขาด ไม่แสดง secrets
├── .env.example                    # ใหม่: ตัวอย่างตัวแปรไม่มี secret จริง
├── .gitignore                      # แก้ไข: ป้องกัน env variants, keys, logs
├── package.json                    # แก้ไข: dependencies, main และ scripts
├── package-lock.json               # แก้ไขตาม npm จริง
└── README.md                       # ใหม่: คู่มือและผลตรวจสอบ
```

โค้ด runtime และ test ใหม่ทั้งหมดเป็น JavaScript ES Modules; คง `prisma.config.ts` ซึ่งเป็น configuration ของ CLI จากโปรเจกต์เดิมไว้ ไม่มี TypeScript runtime เพิ่มเข้ามา

ใช้ `prisma.users` และฟิลด์ `password_hash`, `is_active`, `created_at`, `updated_at` ตามฐานข้อมูลจริง ไม่เปลี่ยน schema ให้ตรงตัวอย่าง ชื่อ public JSON ยังคงเป็น `id`, `username`, `email`, `role`

Prisma และ `@prisma/client` ติดตั้งจริงตรงกันที่ 6.19.2 ใช้ generator เดิม `prisma-client-js` และ import จาก `@prisma/client` ตาม [Prisma v6 generator reference](https://docs.prisma.io/docs/orm/v6/prisma-schema/overview/generators) `prisma generate` สร้าง client เท่านั้น ไม่เปลี่ยนฐานข้อมูล

Dependencies ที่เพิ่ม: `bcryptjs`, `jsonwebtoken`, `cookie-parser` โดยรักษา Express, CORS, dotenv และ Prisma เดิม

## API

| Method | Endpoint | ผลลัพธ์ |
| --- | --- | --- |
| GET | `/api/health` | 200 สถานะ HTTP server ไม่ใช่ DB readiness check |
| POST | `/api/auth/login` | 200 พร้อม public user และ HttpOnly cookie; 400 validation; 401 credentials/inactive; 500 internal error |
| GET | `/api/auth/me` | 200 public user หลัง middleware verify; 401 cookie/token/user ไม่ผ่าน; 500 database error |
| POST | `/api/auth/logout` | 200 และล้าง cookie แม้ไม่มี/หมดอายุ/ผิดรูปแบบ |

Login JSON มี `username` และ `password` เป็น string ที่ไม่ว่าง username ยาวไม่เกิน 50 ตัวอักษร password ไม่เกิน 72 UTF-8 bytes โดยไม่ trim หรือเปลี่ยนรหัสผ่านก่อน compare ขนาด JSON ทั้ง request จำกัด 16 KB; malformed JSON ตอบ 400 และ payload เกิน limit ตอบ 413

JWT มี `sub` เป็น UUID ของ user, algorithm HS256, อายุ 1 ชั่วโมง และส่งเฉพาะ `auth_token` cookie: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=3600` บน local HTTP ไม่มี Secure; ตั้ง `NODE_ENV=production` จะเปิด Secure ซึ่งต้องใช้ HTTPS

`/me` verify signature, algorithm และ expiry รวมถึงตรวจ UUID ก่อนค้น user ใหม่ทุก request และตรวจ `is_active` ไม่ส่ง hash/token/secret ใน JSON ทุก auth response ตั้ง `Cache-Control: no-store` Global error handler ไม่แสดง stack หรือ DB errors

`/api/test-db` ถูกลบแล้วหลังยืนยันการเชื่อมต่อ PostgreSQL ผ่าน

Frontend origin ที่อนุญาตกำหนดด้วย `FRONTEND_URL` ค่า local คือ `http://localhost:5173` พร้อม `credentials: true` ฝั่ง React ต้องใช้ `credentials: "include"` หรือ axios `withCredentials: true` ใช้ hostname ให้สอดคล้องกัน เช่น localhost ทั้งสองฝั่ง

## ผลทดสอบก่อน Cleanup

วันที่ 17 พฤศจิกายน 2026: `npm test` ผ่าน 19 tests (16 subtests + 3 top-level tests), ไม่ fail/skip โดยใช้ Node 22.21.0 และ PostgreSQL ที่กำหนดใน `.env`

| รายการ | สถานะ |
| --- | --- |
| เริ่ม server จาก entry point และ graceful shutdown | ผ่าน |
| GET health 200 | ผ่าน |
| Prisma เชื่อม/อ่าน/สร้าง fixture กับ PostgreSQL | ผ่าน |
| Login ถูกต้อง 200 | ผ่าน ด้วยบัญชีทดสอบชั่วคราว |
| Password ผิด / username ไม่มี 401 พร้อมข้อความกลางเหมือนกัน | ผ่าน |
| Inactive login 401 | ผ่าน |
| Body ไม่ถูกต้อง / fields ใหญ่เกิน / UTF-8 เกินขนาด 400 | ผ่าน |
| Malformed JSON 400 / JSON เกิน 16 KB 413 | ผ่าน |
| Login มี HttpOnly cookie และ JWT sub/expiry 1 ชั่วโมง | ผ่าน |
| Me พร้อม cookie 200 และไม่เปิดเผยความลับ | ผ่าน |
| Me ไม่มี cookie 401 | ผ่าน |
| Me token ปลอม, ผิด signature, หมดอายุ, ผิด algorithm/subject, ไม่มี expiry 401 | ผ่าน |
| Me user inactive หรือไม่พบ 401 | ผ่าน |
| CORS preflight อนุญาต origin ที่กำหนดพร้อม credentials | ผ่าน |
| Logout ล้าง attributes ตรงกัน มี/ไม่มี/invalid cookie 200 | ผ่าน |
| curl cookie jar หลัง logout เรียก me 401 | ผ่าน |
| Database ใช้งานไม่ได้ ตอบ JSON 500 โดยไม่เผยรายละเอียด | ผ่าน ด้วย child process ที่ชี้ไป DB ทดสอบที่ไม่เปิดอยู่ |
| Production เปิด Secure cookie configuration | ผ่าน; ยังไม่ทดสอบกับ HTTPS deployment จริง |
| `/api/test-db` ถูกลบและตอบ 404 | ผ่าน |
| ข้อมูล user เดิมหลัง tests ตรงกับก่อน tests | ผ่าน |
| Prisma validate / generate และ syntax ทุกไฟล์ JS | ผ่าน |
| Login ด้วยบัญชี admin จริง | ไม่มีรหัสผ่านสำหรับ automated test |

Tests สร้างบัญชีสุ่มเฉพาะชุดทดสอบ และลบเฉพาะ ID ที่ชุดทดสอบ insert สำเร็จใน finally ไม่ update/delete user เดิม ห้ามรันกับฐานข้อมูลที่ไม่เหมาะกับการสร้าง fixture; ค่าเริ่มต้นเป็น local ตามโปรเจกต์นี้

## ปัญหาที่พบและสิ่งที่ควรทราบ

- โฟลเดอร์โปรเจกต์นี้และ backend ไม่มี Git repository จึงตรวจ Git diff/status ไม่ได้ ไม่สร้าง repository ใหม่ให้เอง `.gitignore` พร้อมใช้งานเมื่อเริ่มใช้ Git
- endpoint DB ทดสอบเดิมอ้าง `prisma.user` แต่ model จริงคือ `users` จึงใช้ `prisma.users` ในโค้ดใหม่ และลบ endpoint ชั่วคราวเมื่อยืนยัน DB แล้ว
- มี JWT secret ใน `.env` จากการตั้งค่าเดิม งาน cleanup ไม่แก้ `.env` หรือ secret
- `npm audit` ยังแจ้ง high 4 รายการในสาย Prisma config (`prisma`, `@prisma/config`, `deepmerge-ts`, `effect`) โดยเสนอ Prisma 7.10.1 ซึ่งเป็น major upgrade จึงไม่ใช้ `npm audit fix --force` เพื่อคง Prisma 6.19.2 ตามขอบเขตงาน ต้องประเมินอัปเกรดก่อน deploy

## ข้อจำกัดก่อน Production

- Stateless JWT: logout ล้าง cookie ใน browser แต่ JWT ที่คัดลอกออกไปยังใช้ได้จนหมดอายุ ไม่มี token revocation/refresh token ใน V1 การลบหรือปิด active user จะทำให้ `/me` ปฏิเสธใน request ถัดไป
- HttpOnly ป้องกัน JavaScript อ่าน cookie แต่ไม่ป้องกัน CSRF; SameSite=Lax ช่วยลดความเสี่ยง และ CORS ไม่ใช่ระบบป้องกัน CSRF ควรประเมิน Origin/Referer validation และ CSRF token ตาม deployment ก่อน production
- ยังไม่มี rate limiting, account lockout, timing equalization หรือระบบเฝ้าระวัง brute force ควรเพิ่มตามบริบทจริง
- Production ต้องใช้ HTTPS, `NODE_ENV=production`, origin จริง, secret แบบสุ่มที่เก็บอย่างเหมาะสม และจัดการช่องโหว่ dependencies ถ้า frontend/backend อยู่คนละ site ต้องออกแบบ SameSite และ CSRF ใหม่ให้เข้ากับ deployment
- `.env` ถูก ignore และจำกัดสิทธิ์ แต่หากเคย commit secret มาก่อน `.gitignore` ไม่ลบออกจากประวัติ ต้องจัดการและหมุน secret แยกต่างหาก

ใช้บัญชีเดิมสำหรับ Login และเปิด Backend คู่กับ Frontend โดยส่ง credentials ดูผล cleanup ล่าสุดใน `../CLEANUP_REPORT.md`


## การตรวจสอบหลัง Cleanup

รัน `node --test test/server.integration.test.js` เพื่อตรวจ startup/shutdown, safe error handling และ production cookie configuration โดยไม่เขียนข้อมูลลงฐานข้อมูล

อัปเดต 20 พฤศจิกายน 2026: Real DB Integration Suites ต้องระบุ `RBAC_TEST_DATABASE_URL` เป็น Local PostgreSQL ฐานข้อมูลแยกชื่อ `login_rbac_test_*`, Schema public และต่างจาก Application DB ก่อนเชื่อมต่อ หากไม่ระบุจะ Skip; ชุด Profile/Avatar Mock ใช้ Connection จำลองและ Storage ชั่วคราว ข้อความผลทดสอบก่อน Cleanup ด้านบนเป็นประวัติเดิม ไม่ใช่แนวทางรัน Tests ปัจจุบัน

ลบ seed script ที่เลิกใช้และ Prisma output เก่าที่ไม่มี import แล้ว ปัจจุบัน client ใช้ `@prisma/client` จาก `node_modules` ตาม generator เดิม ไม่แก้ schema หรือ auth source

## ข้อมูล Dev หลาย Role — 20 พฤศจิกายน 2026

ขณะนี้มี Schema RBAC และสคริปต์แยกสำหรับ Role Bootstrap กับข้อมูล User ทดสอบ (ยังไม่ใช่ Menu/Role Management APIs):

```sh
npm run rbac:roles:check   # ตรวจ Mapping แบบ Read Only
npm run rbac:roles:apply   # สร้าง Roles ที่ขาด/เชื่อม User เดิม
npm run rbac:users:check   # ตรวจแผนผู้ใช้ทดสอบ 18 คน ไม่สร้างไฟล์รหัสผ่าน
npm run rbac:users:seed    # เพิ่มเฉพาะบัญชีที่ขาด ไม่ Reset บัญชีเดิม
```

ข้อมูล Dev ล่าสุดรวม ADMIN 3 / MANAGER 5 / USER 10 (18 คนรวม Admin เดิมเป็น admin01) ใช้ชื่อ admin01–03, manager01–05, user01–10 รหัสผ่านตามเลขท้ายที่ผู้ใช้กำหนดดูใน `.local/dev-seed-credentials.json` ที่เครื่องเท่านั้น (Directory 700/File 600/Git Ignore) ไม่ใส่รหัสผ่านใน README หรือแก้ `.env` และอย่าลบไฟล์นี้หากยังต้องการ Login ด้วยรหัสผ่านเริ่มต้นของชุด Seed

Tests ใหม่ `npm run test:rbac:backfill` และ `npm run test:rbac:seed` ต้องกำหนด RBAC_TEST_DATABASE_URL เป็น Local/public-schema DB แยกที่ชื่อขึ้นต้น login_rbac_test_ และเริ่มต้นว่าง/มี Migrations แล้ว Integration จะ Skip เมื่อไม่ตั้งตัวแปร และปฏิเสธ Target ที่ไม่ตรง Guard; ห้ามตั้งเป็น DB Application รายละเอียดผลตรวจและขั้นตอนที่เสร็จแล้วอยู่ใน `../docs/rbac/PHASE1_DATABASE_DESIGN.md` หัวข้อ 13–16


## Authentication กับ Role Relation — C1–C2

Login/Me/Profile/Avatar คืน `user.role` เป็น String จาก `users.role_id → roles.code` ใช้ Public DTO ร่วมใน `src/lib/public-user.js` ไม่มี Legacy Role Fallback JWT/Cookie/Logout ใช้รูปแบบเดิม และ requireAuth อ่าน Role ปัจจุบันจาก DB ทุก Request

บัญชีที่ Credentials/Active ผ่านแต่ยังไม่เชื่อม Role จะได้ **403** พร้อม `code: RBAC_NOT_READY` และข้อความให้ติดต่อผู้ดูแล Login ไม่ออก Cookie ใหม่ในกรณีนี้ ต่างจาก Credentials/JWT/User Active ไม่ผ่านที่ได้ 401 Profile/Avatar ใช้ Transaction เพื่อไม่ Commit หาก Role หายระหว่าง Update

รัน `npm run test:auth:roles` กับ `RBAC_TEST_DATABASE_URL` ตามข้อกำหนดด้านบน โดย Deploy Migrations บน DB ทดสอบแยกก่อน Suite ใหม่ต้องเริ่มด้วย users/roles ว่าง ผลวันที่ 20 พ.ย. 2026: Auth จริง 25 PASS, Profile/Avatar/Server Mock 42 PASS; Dev HTTP Smoke ครบ 3 Roles และข้อมูล Dev 31 คนไม่เปลี่ยน ยังไม่มี requireAdmin หรือ Menu Authorization ในรอบนี้


## Admin Guard — C3

`src/middleware/authorization.middleware.js` export `requireAdmin` ใช้หลัง `requireAuth` เสมอ ตัวอย่างลำดับสำหรับ Routes จัดการในขั้นถัดไป: `requireAuth → requireAdmin → Menu Grant Guard → Controller` requireAuth อ่าน Role Relation ล่าสุดจาก DB แล้ว requireAdmin ตรวจ `req.user.role_record.code === 'ADMIN'` โดยไม่อ่าน DB ซ้ำหรือเชื่อ Role ที่ส่งจาก Client

ไม่มี req.user ตอบ 401; Mapping ไม่พร้อมตอบ 403/RBAC_NOT_READY; Role อื่นตอบ 403/Forbidden; ADMIN เรียก next() ไม่มี Implicit Menu Bypass และไม่ติด requireAdmin บน Profile API ของผู้ใช้ทั่วไป ยังไม่มี Production Management Routes/Probe Endpoint ใน C3

`npm run test:auth:admin` ผ่าน 18 Tests (17 Subtests + Parent Test), 0 FAIL/0 SKIP ใช้ HTTP/JWT จริงกับ Mock Prisma และ Connection จำลองที่ใช้ไม่ได้ ไม่อ่าน/เขียน DB จริง ครอบคลุม Client Spoofing และการเปลี่ยน Role โดยใช้ JWT เดิม ไม่ใช่ Browser หรือ Real PostgreSQL Integration Test ของ C3


## Menu Bootstrap และ Access Policy — C4

```sh
npm run rbac:menus:check  # Read-only plan; default dry run
npm run rbac:menus:seed   # Local Dev bootstrap; transaction; ไม่ reset grants เดิม
npm run test:rbac:menus   # Policy Mock + real DB suite ที่ต้องระบุ RBAC_TEST_DATABASE_URL
```

Dev Seed แล้ว 6 Menus/9 Grants: Dashboard/Profile ให้ ADMIN/MANAGER/USER; กลุ่ม System Management ไม่มี Path และมีสามลูก /admin/menus, /admin/roles, /admin/users ให้ ADMIN เท่านั้น หน้าจัดการทั้งสามยังไม่สร้าง Registry IDs/Paths อยู่ใน src/lib/menu-registry.js

Seed ต้องมี Roles เริ่มต้นและ Active ADMIN; ถ้า Menu Data เดิมขัด ID/Path หรือไม่ครบจะหยุด ไม่ overwrite คำสั่งรันซ้ำไม่ reset ชื่อ/Active/Sort/สิทธิ์ธรรมดาที่แก้ไว้ Critical Access ไม่พร้อมจะแจ้งปัญหา ไม่ซ่อมเงียบ ๆ การ Apply ใช้ Serializable + Locks/Retry ทั้ง Menus/Grants ไม่มี User/Role Updates

src/services/menu-access.service.js สร้าง tree/allowedPaths ตาม Direct Grants + Active Ancestors เรียง Sort Order/ID; Group ที่ไม่มีสิทธิ์คลิกมี menuPath null ไม่มี Inheritance/Admin Bypass getUserMenuAccess อ่าน User/Role/Grants/Menus ใน Read-only Snapshot เดียว User หาย/Inactive ได้ 401, Mapping หายได้ 403/RBAC_NOT_READY, ไม่มี Grant ได้ Snapshot ว่าง

requireMenuAccess(fixedPath) รับ Path ฝั่ง Server และวางหลัง requireAuth; Management ต้องใช้ requireAdmin ด้วย ใน C4 เตรียม Guard/Service แต่ยังไม่ติดบน Profile หรือสร้าง Production Menu Endpoint จึงยังไม่ใช่ RBAC ที่ใช้งานครบทั้งระบบ

ผล 20 พ.ย. 2026: Policy Mock 16 PASS, Bootstrap/PostgreSQL แยก 11 PASS, Auth/PostgreSQL แยก 25 PASS; Mock Regression รวม Admin/Menu/Profile/Avatar/Server 76 PASS (รวม 16 ข้างต้นแล้ว) ทุกชุด 0 FAIL/0 SKIP Real DB tests ต้องใช้ Local login_rbac_test_* แยกจาก Application DB และ Suite Bootstrap ต้องเริ่มว่าง ไม่ใช้ auth_db Dev เป็น Fixture DB ตรวจ Dev users/roles Fingerprint ไม่เปลี่ยน Users 31 คน; Seed ซ้ำไม่เขียนเพิ่ม รายละเอียด docs/rbac/PHASE1_DATABASE_DESIGN.md หัวข้อ 19


## Current User Menus API — C5

เปิด `GET /api/me/menus` แล้ว ใช้ requireAuth ทุก Role ที่ Active/Mapping พร้อม คืน `{ success: true, menus, allowedPaths }` จาก Menu Policy เดิม ไม่มี Grants ได้ 200 Empty ไม่ Logout ไม่มี JWT/Inactive ได้ 401, Mapping ไม่พร้อมได้ 403/RBAC_NOT_READY, DB Error ได้ safe 500 ทุก Response ตั้ง no-store และไม่ออก Cookie ใหม่ รายละเอียด Contract/ไฟล์/Tests อยู่ [ME_MENUS_API.md](ME_MENUS_API.md)

`npm run test:api:my-menus` รัน API Mock + Real DB Suite (ต้องกำหนด RBAC_TEST_DATABASE_URL ฐานแยกที่ Guard แล้วและ Deploy Migrations; ไม่ระบุจะ Skip Real DB) ผลรอบนี้ API Mock 17 PASS / PostgreSQL แยก 8 PASS รวม Mock Regression 93 PASS และ Auth/PostgreSQL 25 PASS, Bootstrap/PostgreSQL 11 PASS ยังไม่เชื่อม Dynamic Sidebar/Frontend Route Guard หรือ Management CRUD APIs


## Menu Management Backend — C6

เปิด GET/POST /api/menus และ PUT/DELETE /api/menus/:id แล้ว ทุกเส้นตรวจ JWT + ADMIN + /admin/menus Direct Grant/Active Ancestors GET คืน Flat List รวม Inactive ส่วน Mutation ตรวจ Hierarchy/Path/Delete Dependencies/Critical Access พร้อม Serializable Transaction/Locks/Retry และ Recheck Actor ก่อนเขียน ดู Request/Response/Error Contract และ Tests ที่ [MENU_API.md](MENU_API.md)

รัน `npm run test:api:menus` เฉพาะ Disposable PostgreSQL ผ่าน RBAC_TEST_DATABASE_URL ตาม Guard เดิม หากไม่ระบุจะ Skip ผลรอบนี้ CRUD/PostgreSQL แยก 15 PASS พร้อม Regression My Menus 8/Bootstrap 11/Auth 25 บน DB แยก และ Mock Regression 93 PASS ไม่เขียน Mutation ลง Dev ยังไม่มี Menu Management UI หรือ Role/Assignment APIs


## Role Management / Assign Menu — C7

เปิด API Role ตาม Assignment ครบหกเส้น: GET/POST /api/roles, PUT/DELETE /api/roles/:id, GET/PUT /api/roles/:id/menus ใช้ JWT + ADMIN + Role Management Direct Menu Grant ทั้งหมด ห้ามลบ Role ที่มี User รวม Inactive และ Assign เป็น Atomic Replace ของ menuIds โดยไม่มี Permission รายคำสั่ง/รายปุ่ม ไม่มี Multiple Roles/Org Group/Audit Log

ดู Contract/Statuses/Source/Tests ที่ [ROLE_API.md](ROLE_API.md) รัน `npm run test:api:roles` โดยระบุ RBAC_TEST_DATABASE_URL เป็น Disposable Local DB ชื่อ login_rbac_test_* Schema public ต่างจาก App และ Deploy Migrations ก่อน Suite ต้องเริ่มว่าง; ไม่ระบุจะ Skip ผล C7 PostgreSQL แยก 17 PASS พร้อม Menu CRUD 15/My Menus 8/Bootstrap 11/Auth 25 และ Mock Regression 93 PASS ไม่ทำ Mutation ใน Dev ข้อมูล Dev สี่ตารางคงเดิม

ยังไม่มี User Role Assignment API/UI, Management UI หรือ Dynamic Sidebar Scope Audit ล่าสุดอยู่ docs/rbac/PHASE1_DATABASE_DESIGN.md หัวข้อ 22


## User Role Assignment — C8

เปิด PUT /api/users/:id/role ตาม Module 3 แล้ว รับ `{ roleId }` UUID เดียว ใช้ JWT + ADMIN + /admin/users Direct Grant/Active Ancestors เปลี่ยนเฉพาะ Target Role และคง Profile/Password/Active เดิม ใช้ Shared Public User DTO ไม่ออก JWT/Cookie ใหม่ Same JWT อ่าน Role ล่าสุดใน Request ถัดไป ป้องกัน Last Active Admin ตามข้อตกลงเดิมใน Serializable Transaction/Locks/Retry

Contract/Errors/Source/Tests อยู่ [USER_ROLE_API.md](USER_ROLE_API.md) รัน `npm run test:api:user-role` ด้วย RBAC_TEST_DATABASE_URL ฐานทดสอบแยกที่ Guard แล้วและ Deploy Migrations (ต้องเริ่มว่าง; ไม่ระบุจะ Skip) ผล User Role/PostgreSQL 14 PASS พร้อม Regression Role 17/Menu 15/My Menus 8/Bootstrap 11/Auth 25 บน DB แยก และ Mock Regression 93 PASS ไม่มี Dev Role Changes

Backend APIs บังคับ 12 เส้นครบ แต่ Frontend Management/Dynamic Sidebar/403 และ Final DB Cutover ยังเหลือ ไม่เพิ่ม GET Users/Create/Delete User หรือ Feature Out of Scope ใน C8


## เชื่อม Frontend RBAC — 20 พฤศจิกายน 2026

เพิ่มเฉพาะ Supporting GET /api/users แบบ Pagination/Admin + /admin/users Grant ตาม D005 เพื่อใช้ User Picker (DTO 6 Fields, Read-only Snapshot) ไม่มี User Create/Delete/Activation และเชื่อม /profile Menu Guard ก่อน PATCH Controller/Avatar Multer แล้ว Me/Logout/รูป Public ไม่ผูก Grant ดู Contract ล่าสุดใน USER_ROLE_API.md, PROFILE_API.md, AVATAR_API.md

Regression บน PostgreSQL แยก: User Role/Picker 15, Role 17, Menu 15, My Menus 8, Bootstrap 11, Auth/Profile 26 Tests ผ่านทั้งหมด; Mock Regression 93 ผ่าน Frontend Chrome E2E อีก 20 Checks ใช้ฐานแยก/Temp Avatar Storage ไม่เปลี่ยนข้อมูล Dev สี่ตาราง


## ปรับชุด Dev ให้เรียบง่าย — 20 พฤศจิกายน 2026

ลดจาก 31 เป็น 18 คนตามคำขอ ลบเฉพาะ Seed ส่วนเกิน 13 คน Admin เดิมรวมใน 3 คนและเปลี่ยนชื่อเป็น admin01; อีกสองคน admin02/admin03 Manager 5 และ User 10 เรียงเลขสองหลัก บัญชีที่เก็บไว้คง ID/Profile/Active/Email เดิมของ Original Admin; Email ของ Seed ใช้ชื่อใหม่@example.invalid ไม่มี Role/Menu/Grant Changes

ผู้ใช้ขอเปลี่ยนรหัสผ่าน Dev ภายหลัง จึงอัปเดต Hash ของทั้ง 18 บัญชีตามรูปแบบและเลขท้ายที่กำหนด รวม Admin เดิมด้วย bcrypt Cost 12 ไม่พิมพ์ Plaintext/Hash/JWT/Cookie ใน Logs เอกสารนี้ไม่เก็บ Password Values ไฟล์ .local/dev-seed-credentials.json อัปเดตชื่อใหม่/รหัสใหม่แบบ Private 600; admin01 มี existingOnly เพื่อไม่ให้ Seed สร้างบัญชีเดิมใหม่หาก ID หาย

devUserPlan เปลี่ยนเป็น 18 คน ชื่อใหม่/รหัส Dev ตามคำขอ ใช้เฉพาะ Dev Guard เดิมปฏิเสธ Production การ Seed ซ้ำยังรักษาข้อมูล/รหัสผ่านที่มีอยู่ ไม่ใช่คำสั่ง Reset/Delete Accounts เมื่อข้อมูลเคยถูกแก้ภายหลัง Migration ลดจำนวนทำครั้งเดียวตามคำขอนี้

Seed Tests 10 PASS บน DB แยก และทดสอบ Resize 31→18/Preserved Fields/Rerun Zero บน DB แยกก่อน Apply Dev จากนั้นตรวจ Login/Me/Logout ครบ 18 บัญชี ไม่แก้ .env/Schema/Frontend และไม่ Commit/Push ข้อความจำนวน 31 ในรายงาน Phase ก่อนหน้านี้เป็นประวัติก่อนปรับชุดข้อมูล
