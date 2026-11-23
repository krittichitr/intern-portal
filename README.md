# Intern Portal

ระบบตัวอย่างสำหรับงานสหกิจศึกษา: Login, Dashboard, แก้ไขโปรไฟล์/รูปภาพ, จัดการเมนูและ Role พร้อมกำหนดสิทธิ์และแสดง Sidebar ตามผู้ใช้

คู่มือนี้สำหรับ **ติดตั้งใหม่บนเครื่อง Local ด้วยฐานข้อมูลว่าง** หลัง Clone โปรเจกต์จาก GitHub ไม่ต้องนำฐานข้อมูลหรือไฟล์ `.env` ของผู้พัฒนาไปใช้

## 1. โปรแกรมที่ต้องมี

| โปรแกรม | ใช้ทำอะไร / เวอร์ชัน |
|---|---|
| Git | Clone Source Code |
| Node.js และ npm | ใช้ Node.js **22.x ตั้งแต่ 22.13 ขึ้นไป** เพื่อรองรับเครื่องมือพัฒนาปัจจุบัน; เครื่องพัฒนาตรวจด้วย 22.23.1 |
| PostgreSQL | เก็บข้อมูล ต้องเปิด Service และมีบัญชีที่สร้างฐานข้อมูล/ตารางได้; รอบทดสอบใช้ PostgreSQL 18 |
| โปรแกรมแก้ไขข้อความ เช่น VS Code | แก้ไฟล์ตั้งค่าและเปิด Terminal |
| DBeaver หรือ pgAdmin | เลือกใช้เพื่อสร้าง/ตรวจฐานข้อมูล หากมี psql อยู่แล้วใช้แทนได้ |

ตรวจใน Terminal:

```sh
git --version
node --version
npm --version
```

หาก `node` ยังเป็นเวอร์ชันเก่า ให้เปลี่ยนเวอร์ชันก่อนติดตั้ง Dependencies คำสั่งในคู่มือรันได้จาก Terminal บน macOS/Linux หรือ PowerShell บน Windows โดยขั้นตอนคัดลอกไฟล์มีตัวอย่างแยกไว้

## 2. Clone โปรเจกต์

เปิด Terminal ในตำแหน่งที่ต้องการเก็บโปรเจกต์ แล้วรัน:

```sh
git clone https://github.com/krittichitr/intern-portal.git
cd intern-portal
```

โฟลเดอร์ `intern-portal` คือ **Project Root** ที่กล่าวถึงในคู่มือนี้

```text
intern-portal/
├── README.md
├── API Documentation.md
├── Test Cases.xlsx
├── backend/
│   ├── .env.example
│   ├── prisma/
│   ├── scripts/
│   └── src/
└── frontend/
    ├── .env.example
    └── src/
```

## 3. เปิด PostgreSQL และสร้างฐานข้อมูลใหม่

1. เปิด PostgreSQL Service
2. เชื่อมต่อผ่าน DBeaver/pgAdmin ด้วย Host `localhost`, Port `5432` และบัญชี PostgreSQL ของเครื่องนั้น
3. สร้าง Database ชื่อ `intern_portal_dev` โดยให้บัญชีที่จะใส่ใน DATABASE_URL มีสิทธิ์ใช้งานและสร้างตารางในฐานนี้

ถ้าใช้ SQL Editor ให้เชื่อมต่อฐาน `postgres` เปิด Auto-commit แล้วรันคำสั่งนี้หนึ่งครั้ง:

```sql
CREATE DATABASE intern_portal_dev;
```

ถ้าใช้ psql ให้เข้าสู่ฐาน `postgres` ด้วยบัญชีของตนเอง แล้วรัน SQL ข้างต้น ไม่ต้องสร้างตารางด้วยมือ เพราะ Prisma Migration จะสร้างให้ในขั้นตอนที่ 5

ถ้าฐานชื่อนี้มีข้อมูลอยู่แล้ว ให้เลือกชื่อฐานใหม่และแก้ชื่อใน DATABASE_URL ให้ตรงกัน คู่มือนี้ไม่ใช้คำสั่ง Reset หรือ Delete ฐานเดิม

## 4. ตั้งค่า Backend

ใน Terminal แรก จาก Project Root:

```sh
cd backend
```

คัดลอกไฟล์ตัวอย่างเป็น `.env`:

**macOS / Linux**

```sh
cp .env.example .env
```

**Windows PowerShell**

```powershell
Copy-Item .env.example .env
```

เปิด `backend/.env` ด้วยโปรแกรมแก้ไขข้อความ และตั้งค่า:

```dotenv
PORT=4000
DATABASE_URL="postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/intern_portal_dev?schema=public"
JWT_SECRET="PASTE_YOUR_RANDOM_SECRET_HERE"
FRONTEND_URL="http://localhost:5173"
NODE_ENV=development
```

| ตัวแปร | วิธีตั้งค่า |
|---|---|
| PORT | ใช้ 4000 ตามตัวอย่าง |
| DATABASE_URL | แทน YOUR_USER/YOUR_PASSWORD ด้วยบัญชี PostgreSQL ของเครื่องพี่เลี้ยง ไม่ใช่บัญชี Login เข้าเว็บไซต์ |
| JWT_SECRET | สร้างค่าของเครื่องตนเองอย่างน้อย 32 bytes ด้วยคำสั่งด้านล่าง แล้วนำผลมาแทน Placeholder |
| FRONTEND_URL | ใช้ http://localhost:5173 ให้ตรงกับ Browser Origin |
| NODE_ENV | ใช้ development สำหรับระบบทดสอบนี้ |

สร้าง JWT Secret ได้ด้วย Node.js โดยไม่ต้องติดตั้ง Package เพิ่ม:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

หาก Username/Password ของ PostgreSQL มีอักขระพิเศษ เช่น `@`, `#`, `%`, `/` ต้อง URL-encode เฉพาะส่วน Username/Password ใน Connection String เก็บ `.env` เฉพาะเครื่องตนเอง ไม่แนบ Secret/Password ลง GitHub หรือรายงาน

## 5. ติดตั้ง Backend และเตรียมข้อมูล

ยังอยู่ในโฟลเดอร์ `backend` และตั้ง `.env` แล้ว รันตามลำดับ:

```sh
npm ci
npm run prisma:generate
npm run prisma:validate
npx prisma migrate deploy
npm run seed
```

| คำสั่ง | หน้าที่ |
|---|---|
| npm ci | ติดตั้ง Dependencies ตาม package-lock.json |
| npm run prisma:generate | สร้าง Prisma Client ให้ตรง Schema |
| npm run prisma:validate | ตรวจรูปแบบ Schema และ Configuration |
| npx prisma migrate deploy | สร้างตาราง/Constraints ตาม Migration ที่ยังไม่เคยรัน |
| npm run seed | เตรียม Role → ผู้ใช้ทดสอบ → เมนู/สิทธิ์ ผ่านไฟล์กลาง scripts/seed.mjs |

เมื่อเสร็จจะได้ตารางหลัก `users`, `roles`, `menus`, `role_menus` และตารางประวัติ `_prisma_migrations` โดย `users.role_id` ต้องมีค่าและอ้างอิง Role ที่มีจริง

**ข้อมูลเริ่มต้นสำหรับฐานใหม่**

| ประเภท | จำนวน / รายละเอียด |
|---|---|
| Roles | 3: ADMIN, MANAGER, USER |
| Users | 18: admin01–admin03, manager01–manager05, user01–user10 |
| Menus | 6: Dashboard, Profile, System Management, Menu Management, Role Management, User Role Assignment |
| Menu Grants | 9: Admin เข้าได้ 5 หน้า, Manager 2 หน้า, User 2 หน้า; System Management เป็นหัวกลุ่ม |

Seed ใช้เฉพาะ Local Dev และปฏิเสธ Production เมื่อขั้นใดผิดพลาดจะหยุดก่อนขั้นถัดไป ขั้นที่สำเร็จแล้วไม่ได้ Rollback ข้าม Script ให้แก้สาเหตุแล้วรันซ้ำ ไม่ต้อง Reset ฐานข้อมูล Seed ซ้ำรักษาบัญชี/รหัสผ่านเดิม และไม่ใช้เป็นคำสั่ง Reset สิทธิ์หลัง Admin แก้แล้ว

หากขั้นใดขึ้น Error ให้แก้ก่อนทำขั้นถัดไป ไม่จำเป็นต้องรัน Migration/Seed ใหม่ทุกครั้งที่เปิดระบบ

## 6. เปิด Backend

ใน Terminal แรกที่โฟลเดอร์ `backend`:

```sh
npm run dev
```

ปล่อย Terminal นี้เปิดไว้ ควรเห็นข้อความ `Server running on port 4000`

เปิด URL นี้ใน Browser เพื่อตรวจว่า Backend ตอบได้:

http://localhost:4000/api/health

ผลที่คาดหวัง:

```json
{
  "success": true,
  "message": "Backend is running"
}
```

Health ตรวจการตอบ HTTP เท่านั้น ส่วนการเชื่อม Database ตรวจผ่าน Migration/Seed และ Login

## 7. ตั้งค่าและเปิด Frontend

เปิด **Terminal ที่สอง** ที่ Project Root แล้วรัน:

```sh
cd frontend
```

คัดลอกไฟล์ตั้งค่า:

**macOS / Linux**

```sh
cp .env.example .env
```

**Windows PowerShell**

```powershell
Copy-Item .env.example .env
```

ตรวจ `frontend/.env` ให้เป็น:

```dotenv
VITE_API_BASE_URL=http://localhost:4000/api
```

ติดตั้งและเปิด:

```sh
npm ci
npm run dev
```

ปล่อย Terminal นี้เปิดไว้ แล้วเปิด:

**http://localhost:5173/login**

| ส่วน | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:4000 |
| API Base | http://localhost:4000/api |

ใช้ `localhost` ให้เหมือนกันตามคู่มือ ไม่สลับกับ `127.0.0.1` เพราะ CORS/Cookie อ้างอิง Host/Origin หากแก้ไฟล์ `.env` ให้ Restart Server ฝั่งที่แก้

## 8. Login และทดลองใช้งาน

หลัง Seed สำเร็จ เปิดไฟล์ **backend/.local/dev-seed-credentials.json** ด้วยโปรแกรมแก้ไขข้อความบนเครื่องที่ติดตั้ง แล้วดู Username/Password ของบัญชีที่ต้องการ ไฟล์นี้สร้างตอน Seed ไม่ได้มากับ GitHub และไม่ต้องอัปโหลดกลับ

| บัญชีตัวอย่าง | Role | สิทธิ์เริ่มต้น |
|---|---|---|
| admin01 | ADMIN | Dashboard, Profile, Menu Management, Role Management, User Role Assignment |
| manager01 | MANAGER | Dashboard, Profile |
| user01 | USER | Dashboard, Profile |

กรอกบัญชีบนหน้า Login จะไป Dashboard ตามสิทธิ์ ผู้ใช้ใหม่ยังไม่มี Avatar จึงเห็นรูปอักษรย่อก่อนอัปโหลด

**รายการทดลองสำหรับพี่เลี้ยง**

1. Login เป็น Admin และ Refresh หน้า Dashboard ต้องยังอยู่ในระบบ
2. เปิด Profile → Edit Profile → แก้ชื่อ/เบอร์/Email แล้ว Save ข้อมูลต้องอัปเดต
3. Change Photo → เลือก JPG/PNG/WebP ไม่เกิน 2 MiB → Preview → Upload รูปต้องเปลี่ยน และยังอยู่หลัง Refresh
4. Menu Management → Add menu/แก้ไข → เลือก Icon, Parent, Sort Order, Active แล้วบันทึก การเพิ่มเมนูไม่สร้างหน้า React ใหม่
5. Role Management → เพิ่ม Role ทดสอบ → Assign menus → เลือก/ยกเลิกแล้ว Save
6. User Role Assignment → เปลี่ยน Role ของบัญชีทดสอบคนอื่น แล้ว Login บัญชีนั้นใหม่เพื่อตรวจ Sidebar
7. Login เป็น Manager/User แล้วพิมพ์ /admin/menus โดยตรง ต้องได้หน้า 403 และ API จัดการต้องปฏิเสธด้วย
8. ลองลบ Role ที่มีผู้ใช้ ต้องถูกปฏิเสธ ย้ายผู้ใช้ไป Role อื่นก่อนจึงลบ Role ทั่วไปได้
9. Logout แล้วเปิด /dashboard หรือ /profile ต้องกลับหน้า Login

เมื่อไม่มี Menu Grants จะได้หน้าไม่มีสิทธิ์ โดย Session ยังอยู่และ Logout ได้ ไม่จำเป็นต้องมีสิทธิ์ Dashboard เสมอ

## 9. เปิดระบบในวันถัดไป / หยุดระบบ

เปิด PostgreSQL แล้วใช้สอง Terminal:

**Terminal 1 — Backend**

```sh
cd backend
npm run dev
```

**Terminal 2 — Frontend**

```sh
cd frontend
npm run dev
```

คำสั่ง cd ด้านบนเริ่มจาก Project Root ใช้ Ctrl+C ในแต่ละ Terminal เพื่อหยุด Server การหยุด Server ไม่ลบข้อมูลใน PostgreSQL และไม่ต้อง Seed ทุกครั้ง

## 10. ตรวจการติดตั้งและเอกสารทดสอบ

ดาวน์โหลด [Test Cases.xlsx](Test%20Cases.xlsx) แล้วเปิดด้วย Excel เพื่อทำ Manual Testing ตารางทดสอบแยกอยู่ในไฟล์นี้ ไม่รวมไว้ในคู่มือติดตั้ง

ไฟล์มีชีต Overview สำหรับวิธีใช้/สรุปสถานะ และชีต Test Cases สำหรับเงื่อนไข ข้อมูล ขั้นตอน ผลที่คาดหวัง ผลจริง ผู้ทดสอบ วันที่ และหลักฐาน ทุกกรณีเริ่มต้น NOT RUN ให้กรอกผลหลังทดสอบจริงเท่านั้น

ตรวจ Build และรูปแบบโค้ดเพิ่มเติมได้จากโฟลเดอร์ frontend:

```sh
npm run build
npm run lint
```

จากโฟลเดอร์ backend ใช้ `npm run prisma:validate` ตรวจ Schema ไม่มีชุดทดสอบอัตโนมัติหรือคำสั่ง npm test แล้ว

## 11. ปัญหาที่พบบ่อย

| อาการ | จุดที่ตรวจ |
|---|---|
| node/npm ไม่พบ หรือ Dependency แจ้งเวอร์ชันไม่รองรับ | ติดตั้ง/เลือก Node.js 22.x >=22.13 แล้วเปิด Terminal ใหม่ |
| Missing DATABASE_URL / JWT_SECRET สั้นเกิน | สร้าง backend/.env จริง ไม่ใช่แก้เฉพาะ .env.example และใส่ Secret ที่สร้างเอง |
| Prisma ต่อ DB ไม่ได้ (เช่น P1000/P1001) | PostgreSQL เปิดอยู่หรือไม่, Host/Port/User/Password/ชื่อฐานใน DATABASE_URL ถูกหรือไม่ |
| Permission denied ขณะ Migration | บัญชี PostgreSQL ต้องมีสิทธิ์ใน Database/Schema public และสร้างตารางได้ |
| Final Migration แจ้งต้อง Backfill Role | ใช้ฐานเก่าที่มีผู้ใช้ยังไม่ผูก Role หยุดก่อน แล้วทำตามหัวข้ออัปเกรดด้านล่าง ไม่ Reset ฐาน |
| Seed หยุดหรือชื่อบัญชีชน | อ่านข้อความขั้นที่ล้มเหลว ตรวจบัญชีเดิม/ไฟล์ Credentials ไม่ลบไฟล์ Credentials เพื่อบังคับ Seed ซ้ำ |
| Login ไม่ผ่าน | ใช้บัญชีเว็บไซต์จากไฟล์ Credentials หลัง Seed ไม่ใช่บัญชี PostgreSQL ตรวจ Backend/Network และสถานะ Active |
| CORS / Cookie / Refresh แล้วหลุด | ตรวจ FRONTEND_URL, VITE_API_BASE_URL และ Host localhost ให้ตรงกัน ใช้ NODE_ENV=development บน HTTP Local |
| Port 4000/5173 ถูกใช้งาน | หยุด Server เดิมที่ใช้พอร์ตนั้นก่อน Vite ตั้ง strictPort จึงไม่ย้ายไปพอร์ตอื่นให้อัตโนมัติ |
| เข้าเมนูจัดการได้ 403 | ต้องเป็น ADMIN และมี Active Menu Grant/Ancestors ตามหน้านั้น |
| เพิ่มเมนูแล้วไม่เห็นใน Sidebar | ต้องเป็น Path ที่มี React Route/pageRegistry จริง, Menu/Parent Active และ Role มี Grant |
| อัปโหลดรูปไม่ได้ | JPG/PNG/WebP ไม่เกิน 2 MiB เป็นภาพ Static ไม่เกิน 4096×4096 และ Backend เขียน uploads/avatars ได้ |
| Build แจ้ง Chunk >500 kB | เป็นคำเตือนขนาด Bundle หากคำสั่งจบสำเร็จยัง Build ได้ |

ถ้าจำเป็นต้องเปลี่ยนพอร์ต Backend ต้องปรับ PORT กับ VITE_API_BASE_URL ให้ตรงกัน หากเปลี่ยนพอร์ต Frontend ต้องปรับ Vite และ FRONTEND_URL ให้ตรง Browser Origin ด้วย

## 12. ข้อจำกัดและกติกาของระบบ

- หนึ่ง User มีหนึ่ง Role Role กำหนดสิทธิ์เป็นรายเมนู ไม่มี Permission รายปุ่ม/ราย Create/Update/Delete
- Parent ไม่ให้สิทธิ์ลูกอัตโนมัติ ต้องเลือกแต่ละเมนู Parent ที่ไม่มีสิทธิ์อาจแสดงเป็นหัวกลุ่มคลิกไม่ได้เพื่อครอบลูกที่มีสิทธิ์
- เมนูจัดการระบบสำคัญและ ADMIN Grants ที่จำเป็นถูกป้องกันการลบ/ปิด เพื่อให้ยังจัดการระบบต่อได้
- Role ADMIN ลบไม่ได้ Role อื่นต้องมีผู้ใช้ 0 คน รวม Inactive จึงลบได้ และห้ามลดสิทธิ์ Active Admin คนสุดท้าย
- เมนูทั่วไปต้องไม่มีลูกและไม่มี Role ผูกก่อนลบ Inactive/Inactive Ancestors ไม่แสดงและไม่ให้สิทธิ์
- Sidebar โหลดสิทธิ์จาก API ตอน Login/Refresh/Window Focus และหลังแก้สิทธิ์ที่เกี่ยวข้อง ไม่มีระบบ Push แบบ Real-time
- JWT ผ่าน HttpOnly Cookie; Logout ล้าง Cookie แต่ไม่ Revoke Token ที่ถูกคัดลอกไว้ก่อนหน้า รูป Avatar เป็น Public URL
- ระบบนี้ใช้ Local Dev/Demo ก่อน Production ต้องเตรียม HTTPS, Secrets, CSRF/Rate Limit, Storage/Backup และการ Revoke ให้เหมาะสม

### รายละเอียดการทำงานเพิ่มเติม

Frontend ใช้ React/Vite/Tailwind/shadcn (Radix), Lucide, Axios และ Sonner ส่วน Backend ใช้ Node.js/Express/Prisma/PostgreSQL

AuthContext เก็บเฉพาะข้อมูลผู้ใช้สาธารณะ ไม่เก็บ JWT/Password Hash มีการใช้ Request ร่วมกันและ Revision ป้องกัน Response เก่าทับ Session ใหม่ Axios ใช้ withCredentials ให้ Browser จัดการ Cookie ส่วน Sidebar และ Route Guard ใช้ข้อมูลสิทธิ์จาก MenuContext/pageRegistry เดียวกัน

เมื่อ API ยืนยันสำเร็จจึงปิด Dialog และแจ้ง Sonner หากบันทึกล้มเหลวเก็บ Draft ให้แก้/ลองใหม่ Pending ป้องกันกดซ้ำและปิด Dialog ขณะส่ง Profile Validation/Email 409, Menu Validation, Role Native Validation และ Avatar File/Preview Validation ใช้ข้อความในหน้า ยังไม่ได้เพิ่ม Sonner ตามขอบเขตที่ตกลงไว้

Schema ใช้ users.role_id → roles.id เป็นสิทธิ์จริง Legacy users.role เก็บเพื่อช่วงเปลี่ยนผ่านเท่านั้น role_menus ใช้ Composite PK ป้องกัน Grant ซ้ำ และ Menu Hierarchy ตรวจ Cycle ที่ Service

## 13. อัปเกรดฐานเดิมที่มี RBAC แล้ว

คู่มือหลักด้านบนใช้สำหรับฐานใหม่เท่านั้น หากฐานเดิมมี roles และ users.role_id อยู่แล้ว ให้ติดตั้ง Dependencies/Generate Client แล้วตรวจ Mapping ก่อน Final NOT NULL Migration:

```sh
npm ci
npm run prisma:generate
npm run rbac:roles:check
```

ถ้ารายงานพบผู้ใช้ยังไม่มี Role ให้ตรวจ Mapping และใช้ `npm run rbac:roles:apply` ก่อน `npx prisma migrate deploy` Migration จะหยุดหากยังมี role_id ว่าง ไม่กำหนดสิทธิ์ให้ผู้ใช้เงียบ ๆ และไม่ใช้ migrate reset/db push

ฐาน Login V1 ที่ยังไม่มีตาราง RBAC ต้องวางขั้นตอนสร้างตารางและ Backfill ก่อน Final Constraint แยกต่างหาก อย่าใช้ขั้นตอนติดตั้งฐานว่างกับฐานเดิมที่มีข้อมูล

## 14. เอกสารและสิ่งส่งมอบ

| รายการ | ตำแหน่ง |
|---|---|
| Frontend Source | frontend/src |
| Backend Source | backend/src |
| Database Schema | [schema.prisma](backend/prisma/schema.prisma) |
| Migration SQL | [prisma/migrations](backend/prisma/migrations) |
| API Documentation | [API Documentation](API%20Documentation.md) |
| Seed กลาง | [seed.mjs](backend/scripts/seed.mjs) |
| คู่มือติดตั้งและรัน | README นี้ |
| Test Cases | [Test Cases.xlsx](Test%20Cases.xlsx) |

ไฟล์ .env, node_modules, Credentials ส่วนตัว และรูปผู้ใช้ไม่ได้ส่งมากับ Repository ตัวโปรแกรมสร้างโฟลเดอร์จัดเก็บรูปให้เมื่ออัปโหลด

ผลตรวจหลังนำไฟล์ทดสอบอัตโนมัติออก วันที่ 20 พฤศจิกายน 2026: Build/Lint ผ่าน และตรวจผ่าน Chrome ด้วยเครื่องมือชั่วคราวนอก Repository 22 Checks ผ่าน ครอบคลุม Login ผิด/ถูก, Admin/Manager/User, Sidebar/403/API denial, Menu/Role/Assign/User Role, Profile, Avatar/Refresh/Logout และ Mobile ไม่พบ JavaScript/Console Error หรือ Unexpected 5xx ใช้ฐาน PostgreSQL แยกที่ลบทิ้งแล้ว ข้อมูล Dev ก่อน/หลังตรงกัน ผลนี้เป็นรายการที่ตรวจในรอบ Browser ไม่ใช่การรับรองว่าทุกกรณีใน Test Cases.xlsx ถูกตรวจครบแล้ว
