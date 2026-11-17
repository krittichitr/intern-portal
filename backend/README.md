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

`npm test` ยังคงเก็บชุด integration ที่สร้าง/ลบ fixture ของตัวเองไว้สำหรับฐานข้อมูลทดสอบ ไม่รันชุดนี้ระหว่าง cleanup เพื่อรักษาข้อกำหนดไม่แก้ Database

ลบ seed script ที่เลิกใช้และ Prisma output เก่าที่ไม่มี import แล้ว ปัจจุบัน client ใช้ `@prisma/client` จาก `node_modules` ตาม generator เดิม ไม่แก้ schema หรือ auth source
