# API Documentation

คู่มือนี้เทียบกับ Routes, Controllers, Validators และ Services ใน Source ปัจจุบัน วันที่ 20 พฤศจิกายน 2026 ตัวอย่างเป็นข้อมูลสมมติสำหรับอธิบาย Contract ไม่ใช่ข้อมูลจาก DB และไม่ได้รับประกันว่า ID ในตัวอย่างมีอยู่จริง เมื่อทดสอบให้ใช้ ID ที่ได้จาก GET/Create ของเครื่องตนเอง

### วิธีเรียกและ Authentication

- Backend Origin เริ่มต้น: `http://localhost:4000` (เปลี่ยนได้ด้วย PORT)
- ตารางและหัวข้อด้านล่างระบุ Path เต็ม รวม `/api` แล้ว ยกเว้นรูป `/uploads/avatars/...`
- JSON Body ใช้ `Content-Type: application/json`; Response JSON ใช้ camelCase
- Avatar ใช้ FormData `multipart/form-data` ให้ Browser/Axios สร้าง Boundary เอง
- Browser/Axios ใช้ `withCredentials: true` เพื่อแนบ HttpOnly Cookie ที่ได้จาก Login ไม่ต้องอ่าน Token ใน JavaScript และไม่ส่ง Authorization Bearer แทน Cookie
- Session ใช้ Cookie ชื่อ `auth_token`, HttpOnly, SameSite=Lax, Path=/ และ Secure เมื่อ NODE_ENV=production อายุ JWT/Cookie 1 ชั่วโมง HS256 Secret มาจาก Environment
- Request ของ Management ต้องผ่าน `requireAuth → requireAdmin → requireMenuAccess → Controller` เป็น ADMIN อย่างเดียวไม่พอ ต้องมี Direct Grant และ Menu/Ancestors Active ด้วย
- Profile เขียนข้อมูลตนเองเท่านั้น และต้องมี /profile Grant ส่วน Me/Sidebar/Logout ไม่ผูกกับ Grant นี้
- Response ของ Auth/Profile/Me/Management ตั้ง `Cache-Control: no-store` ส่วน Avatar Public มี Cache ตาม F1

ตัวอย่างในเอกสารไม่แสดง JWT, Cookie Value, Password จริง หรือ Password Hash ข้อความ `<your-local-password>` เป็นตัวแทนให้ผู้ทดสอบกรอกเองบนเครื่อง

### สารบัญ Endpoint

12 เส้นตาม Assignment คือ M1–M4, R1–R6, U2 และ S1 ส่วน U1 เป็น Supporting User Picker และ A/P/H/F เป็นระบบเดิม/ประกอบ

| รหัส | Method | Path | หน้าที่ |
|---|---|---|---|
| A1 | POST | `/api/auth/login` | เข้าสู่ระบบ |
| A2 | GET | `/api/auth/me` | อ่านข้อมูลผู้ใช้ปัจจุบัน |
| A3 | POST | `/api/auth/logout` | ออกจากระบบ |
| P1 | PATCH | `/api/profile/me` | แก้ข้อมูลโปรไฟล์ตนเอง |
| P2 | POST | `/api/profile/me/avatar` | อัปโหลดรูปโปรไฟล์ตนเอง |
| M1 | GET | `/api/menus` | อ่านรายการเมนูทั้งหมด |
| M2 | POST | `/api/menus` | เพิ่มเมนู |
| M3 | PUT | `/api/menus/:id` | แก้ไขเมนู |
| M4 | DELETE | `/api/menus/:id` | ลบเมนู |
| R1 | GET | `/api/roles` | อ่านรายการ Role ทั้งหมด |
| R2 | POST | `/api/roles` | เพิ่ม Role |
| R3 | PUT | `/api/roles/:id` | แก้ไข Role |
| R4 | DELETE | `/api/roles/:id` | ลบ Role |
| R5 | GET | `/api/roles/:id/menus` | อ่านเมนูที่กำหนดให้ Role |
| R6 | PUT | `/api/roles/:id/menus` | แทนที่ชุดเมนูของ Role |
| U1 | GET | `/api/users` | อ่านผู้ใช้สำหรับเลือกเปลี่ยน Role |
| U2 | PUT | `/api/users/:id/role` | กำหนดหนึ่ง Role ให้ผู้ใช้ |
| S1 | GET | `/api/me/menus` | อ่านเมนูตามสิทธิ์ของผู้ Login |
| H1 | GET | `/api/health` | ตรวจ HTTP Backend |
| F1 | GET | `/uploads/avatars/:filename` | โหลดไฟล์ Avatar |

### รูปแบบข้อมูลและ Validation ร่วม

**Public User** มีเพียง `id`, `username`, `email`, `role`, `firstName`, `lastName`, `phone`, `avatarUrl` สี่ฟิลด์โปรไฟล์ท้ายเป็น String หรือ null; role มาจาก users.role_id → roles.code ไม่เชื่อ Legacy users.role ไม่มี Password/Hash/Token ใน Response User

**Profile Fields (P1)**

| Field | Input และกติกา |
|---|---|
| firstName / lastName | String trim แล้ว 1–100 Unicode code points หรือ null เพื่อล้าง |
| phone | String trim แล้ว 1–20 Unicode code points, มี 7–15 หลัก, อนุญาต + นำหน้า ช่องว่าง วงเล็บ ขีด หรือ null เพื่อล้าง |
| email | String trim แล้ว 1–255 Unicode code points รูปแบบ email ถูกต้อง normalize ตัวเล็ก ห้าม null/ว่าง; ไม่บังคับส่งหากไม่ได้แก้ |

P1 ต้องเป็น Object มีอย่างน้อยหนึ่ง Field ที่รองรับ ไม่รับ Fields อื่น/Array/Control Characters String ว่างไม่ใช่คำสั่งล้าง ต้องใช้ null สำหรับ Optional Fields

**Menu Fields (M2/M3)**

| Field | Input / Default เมื่อ Create |
|---|---|
| menuName | String trim แล้ว 1–100 UTF-16 code units ไม่มี Control Characters; Create จำเป็น |
| menuPath | null สำหรับ Group หรือ Internal Path ไม่เกิน 255 เช่น /profile; Default null; ไม่ trim, ไม่มี query/hash/percent encoding/dot segment/trailing slash (ยกเว้น /) |
| menuIcon | null หรือชื่อใน Supported Icons เท่านั้น; Default null |
| parentId | null หรือ UUID ของ Menu ที่มีจริง; Default null; ห้าม Cycle/ตัวเองเป็น Parent |
| sortOrder | Integer 0–2147483647; Default 0 |
| isActive | Boolean; Default true |

Supported Icons: LayoutDashboard, UserRound, FileText, ListTree, ShieldCheck, Users, Settings, Folder ใช้ชื่อตรงตัวพิมพ์เล็ก/ใหญ่ ชื่ออื่นได้ 400 Frontend มี Dropdown พร้อมรูป ไม่มีช่องกรอกชื่อเองแล้ว null ใช้รูป Folder เป็น Fallback บน Sidebar

Response Menu เพิ่ม id/createdAt/updatedAt (ISO datetime) เข้ามา ไม่มีฟิลด์ isCritical ใน Contract การป้องกัน Critical Menus ใช้ ID ที่กำหนดฝั่ง Server การเพิ่ม/เปลี่ยน Path ไม่สร้างหน้า React หน้าใหม่ต้องมี Route/pageRegistry ก่อนจะแสดงใน Sidebar

**Role Fields (R2/R3)**

| Field | Input |
|---|---|
| code | Create เท่านั้น String trim/uppercase ขึ้นต้น A–Z และตามด้วย A–Z/0–9/_ รวม 1–20 ตัว ต้องไม่ซ้ำ |
| name | String trim แล้ว 1–100 UTF-16 code units ไม่มี Control Characters; จำเป็นทั้ง Create/Edit |

Response Role มี id/code/name/createdAt/updatedAt; Server สร้าง UUID ไม่รับ id/createdAt/updatedAt ใน Body ฟิลด์ที่ไม่รองรับถูกปฏิเสธด้วย 400 ทุก ID ใน Path/Assignment ต้องเป็น UUID ไม่ใช่ชื่อหรือ Code

### A1 — เข้าสู่ระบบ

**POST `/api/auth/login`**

**สิทธิ์:** ไม่ต้อง Login

**Request:**

```json
{
  "username": "example_admin",
  "password": "<your-local-password>"
}
```

**Response — HTTP 200:**

```json
{
  "success": true,
  "message": "Login successful",
  "user": {
    "id": "11111111-1111-4111-8111-111111111111",
    "username": "example_admin",
    "email": "admin@example.invalid",
    "role": "ADMIN",
    "firstName": null,
    "lastName": null,
    "phone": null,
    "avatarUrl": null
  }
}
```

**Errors:** 400 ข้อมูล Login ไม่ถูกชนิด/ว่าง/ยาวเกิน; 401 บัญชีไม่มี/Inactive/รหัสผิด; 403 RBAC_NOT_READY; 500 ภายในระบบ

**พฤติกรรมสำคัญ:** Username เป็น String ไม่ว่างและยาวไม่เกิน 50 UTF-16 code units; Password ไม่ว่างและไม่เกิน 72 UTF-8 bytes ไม่ trim/normalize Username หรือ Password ก่อนเทียบจริง สำเร็จจะตั้ง HttpOnly Cookie อายุ 1 ชั่วโมง ไม่ส่ง Token ใน JSON

**Source:** [src/controllers/auth.controller.js](backend/src/controllers/auth.controller.js)

### A2 — อ่านข้อมูลผู้ใช้ปัจจุบัน

**GET `/api/auth/me`**

**สิทธิ์:** JWT ของผู้ใช้ Active ที่มี Role

**Request:**

ไม่มี Request Body

**Response — HTTP 200:**

```json
{
  "success": true,
  "user": {
    "id": "11111111-1111-4111-8111-111111111111",
    "username": "example_admin",
    "email": "admin@example.invalid",
    "role": "ADMIN",
    "firstName": null,
    "lastName": null,
    "phone": null,
    "avatarUrl": null
  }
}
```

**Errors:** 401 JWT/ผู้ใช้ไม่ผ่าน; 403 RBAC_NOT_READY; 500 ภายในระบบ

**พฤติกรรมสำคัญ:** ไม่ต้องมี Menu Grant ใช้คืนสถานะ Login หลัง Refresh และรับ Role/Profile ล่าสุดจาก DB

**Source:** [src/controllers/auth.controller.js](backend/src/controllers/auth.controller.js)

### A3 — ออกจากระบบ

**POST `/api/auth/logout`**

**สิทธิ์:** ไม่บังคับ JWT

**Request:**

ไม่มี Request Body

**Response — HTTP 200:**

```json
{
  "success": true,
  "message": "Logout successful"
}
```

**Errors:** 500 ภายในระบบ

**พฤติกรรมสำคัญ:** Clear Cookie แม้ Cookie หาย/หมดอายุหรือ Role ใช้งานไม่ได้ ไม่ revoke JWT ที่ถูกคัดลอกไว้ก่อนหน้า

**Source:** [src/controllers/auth.controller.js](backend/src/controllers/auth.controller.js)

### P1 — แก้ข้อมูลโปรไฟล์ตนเอง

**PATCH `/api/profile/me`**

**สิทธิ์:** JWT + Active /profile Menu Grant

**Request:**

```json
{
  "firstName": "Somchai",
  "lastName": "Example",
  "phone": "0812345678",
  "email": "updated@example.invalid"
}
```

**Response — HTTP 200:**

```json
{
  "success": true,
  "message": "Profile updated successfully",
  "user": {
    "id": "11111111-1111-4111-8111-111111111111",
    "username": "example_admin",
    "email": "updated@example.invalid",
    "role": "ADMIN",
    "firstName": "Somchai",
    "lastName": "Example",
    "phone": "0812345678",
    "avatarUrl": null
  }
}
```

**Errors:** 400 Fields/Validation; 401 ไม่ผ่าน Auth; 403 ไม่มีสิทธิ์/RBAC_NOT_READY; 409 Email ซ้ำ; 500 DB/ภายในระบบ

**พฤติกรรมสำคัญ:** ส่งอย่างน้อยหนึ่งฟิลด์ที่ต้องการเปลี่ยน ไม่จำเป็นต้องส่งครบสี่ฟิลด์ ฟิลด์ที่ไม่ส่งจะคงค่าเดิม ดู Validation ในหัวข้อ Profile Fields ด้านล่าง ไม่รับ id/username/role/password/avatarUrl

**Source:** [src/controllers/profile.controller.js](backend/src/controllers/profile.controller.js)

### P2 — อัปโหลดรูปโปรไฟล์ตนเอง

**POST `/api/profile/me/avatar`**

**สิทธิ์:** JWT + Active /profile Menu Grant

**Request:**

| FormData Field | ชนิด | จำเป็น |
|---|---|---|
| avatar | File: JPG/PNG/WebP ไม่เกิน 2 MiB (2,097,152 bytes) | ใช่ |

```js
const form = new FormData()
form.append('avatar', selectedFile)
await api.post('/profile/me/avatar', form)
```

ตัวอย่างใช้ Axios Instance ของ Frontend ที่มี baseURL ลงท้าย /api และ withCredentials แล้ว

**Response — HTTP 200:**

```json
{
  "success": true,
  "message": "Profile image updated successfully",
  "user": {
    "id": "11111111-1111-4111-8111-111111111111",
    "username": "example_admin",
    "email": "updated@example.invalid",
    "role": "ADMIN",
    "firstName": "Somchai",
    "lastName": "Example",
    "phone": "0812345678",
    "avatarUrl": "/uploads/avatars/55555555-5555-4555-8555-555555555555.webp"
  }
}
```

**Errors:** 400 ไฟล์ขาด/ผิด Field/เนื้อหาไม่ใช่ภาพที่รองรับ; 401 ไม่ผ่าน Auth; 403 ไม่มีสิทธิ์/RBAC_NOT_READY; 413 เกิน 2 MiB; 500 Storage/DB/ภายในระบบ

**พฤติกรรมสำคัญ:** ส่งไฟล์เพียงหนึ่งรายการใน field avatar ไม่มี Text Fields ไม่ส่ง userId/JWT/Password Browser/Axios ต้องสร้าง multipart boundary เอง ไม่กำหนด Content-Type เอง ข้อมูลตัวอย่าง Response สมมติว่าเคยแก้ Profile ตาม P1 แล้ว

**Source:** [src/middleware/upload.middleware.js](backend/src/middleware/upload.middleware.js)

### M1 — อ่านรายการเมนูทั้งหมด

**GET `/api/menus`**

**สิทธิ์:** JWT + ADMIN + Active /admin/menus Menu Grant

**Request:**

ไม่มี Request Body

**Response — HTTP 200:**

```json
{
  "success": true,
  "menus": [
    {
      "id": "33333333-3333-4333-8333-333333333333",
      "menuName": "Demo group",
      "menuPath": null,
      "menuIcon": "Folder",
      "parentId": null,
      "sortOrder": 40,
      "isActive": true,
      "createdAt": "2026-11-20T00:00:00.000Z",
      "updatedAt": "2026-11-20T00:00:00.000Z"
    }
  ]
}
```

**Errors:** 401 ไม่ผ่าน Auth; 403 ไม่ใช่ ADMIN/ไม่มีสิทธิ์/RBAC_NOT_READY; 500 ภายในระบบ

**พฤติกรรมสำคัญ:** Flat List รวม Inactive และ Group เรียง sortOrder แล้ว id ไม่มี Pagination ไม่มีข้อมูลคืน menus: []

**Source:** [src/controllers/menu.controller.js](backend/src/controllers/menu.controller.js)

### M2 — เพิ่มเมนู

**POST `/api/menus`**

**สิทธิ์:** JWT + ADMIN + Active /admin/menus Menu Grant

**Request:**

```json
{
  "menuName": "Demo group",
  "menuPath": null,
  "menuIcon": "Folder",
  "parentId": null,
  "sortOrder": 40,
  "isActive": true
}
```

**Response — HTTP 201:**

```json
{
  "success": true,
  "menu": {
    "id": "33333333-3333-4333-8333-333333333333",
    "menuName": "Demo group",
    "menuPath": null,
    "menuIcon": "Folder",
    "parentId": null,
    "sortOrder": 40,
    "isActive": true,
    "createdAt": "2026-11-20T00:00:00.000Z",
    "updatedAt": "2026-11-20T00:00:00.000Z"
  }
}
```

**Errors:** 400 Input/Parent/Hierarchy; 401/403 ไม่ผ่านสิทธิ์; 409 Path ซ้ำ/Critical Access/Concurrent Conflict; 500 ภายในระบบ

**พฤติกรรมสำคัญ:** menuName จำเป็น ฟิลด์อื่นไม่ส่งได้ มี Default ตามตาราง Menu Fields ID สร้างโดย Backend ตัวอย่างสร้าง Group ไม่ได้สร้างหน้า React ใหม่

**Source:** [src/controllers/menu.controller.js](backend/src/controllers/menu.controller.js)

### M3 — แก้ไขเมนู

**PUT `/api/menus/:id`**

**สิทธิ์:** JWT + ADMIN + Active /admin/menus Menu Grant

**Request:**

```json
{
  "menuName": "Updated demo group",
  "sortOrder": 50
}
```

**Response — HTTP 200:**

```json
{
  "success": true,
  "menu": {
    "id": "33333333-3333-4333-8333-333333333333",
    "menuName": "Updated demo group",
    "menuPath": null,
    "menuIcon": "Folder",
    "parentId": null,
    "sortOrder": 50,
    "isActive": true,
    "createdAt": "2026-11-20T00:00:00.000Z",
    "updatedAt": "2026-11-20T00:00:00.000Z"
  }
}
```

**Errors:** 400 UUID/Input/Parent/Cycle; 401/403 ไม่ผ่านสิทธิ์; 404 MENU_NOT_FOUND; 409 Path ซ้ำ/Critical Access/Concurrent Conflict; 500 ภายในระบบ

**พฤติกรรมสำคัญ:** id เป็น UUID ของ Menu ที่มีจริง แม้ใช้ PUT ปัจจุบันรับบางฟิลด์ได้ ไม่รับ Body ว่าง ฟิลด์ที่ไม่ส่งคงเดิม updatedAt อัปเดตโดย Prisma

**Source:** [src/controllers/menu.controller.js](backend/src/controllers/menu.controller.js)

### M4 — ลบเมนู

**DELETE `/api/menus/:id`**

**สิทธิ์:** JWT + ADMIN + Active /admin/menus Menu Grant

**Request:**

ไม่มี Request Body ใช้ `:id` เป็น UUID ของรายการเป้าหมาย

**Response — HTTP 200:**

```json
{
  "success": true,
  "message": "Menu deleted successfully"
}
```

**Errors:** 400 UUID; 401/403 ไม่ผ่านสิทธิ์; 404 MENU_NOT_FOUND; 409 CRITICAL_MENU_PROTECTED/MENU_HAS_CHILDREN/MENU_ASSIGNED/MENU_DEPENDENCY_CONFLICT/MENU_WRITE_CONFLICT; 500 ภายในระบบ

**พฤติกรรมสำคัญ:** ต้องไม่มีเมนูย่อยและไม่มี Role ผูกอยู่ Critical Management Menus ลบไม่ได้ การลบ Menu ไม่ลบหน้า React หรือ Source Code

**Source:** [src/controllers/menu.controller.js](backend/src/controllers/menu.controller.js)

### R1 — อ่านรายการ Role ทั้งหมด

**GET `/api/roles`**

**สิทธิ์:** JWT + ADMIN + Active /admin/roles Menu Grant

**Request:**

ไม่มี Request Body

**Response — HTTP 200:**

```json
{
  "success": true,
  "roles": [
    {
      "id": "22222222-2222-4222-8222-222222222222",
      "code": "AUDITOR",
      "name": "Auditor",
      "createdAt": "2026-11-20T00:00:00.000Z",
      "updatedAt": "2026-11-20T00:00:00.000Z"
    }
  ]
}
```

**Errors:** 401/403 ไม่ผ่านสิทธิ์; 500 ภายในระบบ

**พฤติกรรมสำคัญ:** เรียง code แล้ว id ไม่มี Pagination ไม่มีข้อมูลคืน roles: []

**Source:** [src/controllers/role.controller.js](backend/src/controllers/role.controller.js)

### R2 — เพิ่ม Role

**POST `/api/roles`**

**สิทธิ์:** JWT + ADMIN + Active /admin/roles Menu Grant

**Request:**

```json
{
  "code": "AUDITOR",
  "name": "Auditor"
}
```

**Response — HTTP 201:**

```json
{
  "success": true,
  "role": {
    "id": "22222222-2222-4222-8222-222222222222",
    "code": "AUDITOR",
    "name": "Auditor",
    "createdAt": "2026-11-20T00:00:00.000Z",
    "updatedAt": "2026-11-20T00:00:00.000Z"
  }
}
```

**Errors:** 400 INVALID_ROLE_INPUT; 401/403 ไม่ผ่านสิทธิ์; 409 ROLE_CODE_CONFLICT/ROLE_WRITE_CONFLICT/Critical Access; 500 ภายในระบบ

**พฤติกรรมสำคัญ:** code และ name จำเป็น ดู Validation ในตาราง Role Fields

**Source:** [src/controllers/role.controller.js](backend/src/controllers/role.controller.js)

### R3 — แก้ไข Role

**PUT `/api/roles/:id`**

**สิทธิ์:** JWT + ADMIN + Active /admin/roles Menu Grant

**Request:**

```json
{
  "name": "Auditor team"
}
```

**Response — HTTP 200:**

```json
{
  "success": true,
  "role": {
    "id": "22222222-2222-4222-8222-222222222222",
    "code": "AUDITOR",
    "name": "Auditor team",
    "createdAt": "2026-11-20T00:00:00.000Z",
    "updatedAt": "2026-11-20T00:00:00.000Z"
  }
}
```

**Errors:** 400 UUID/INVALID_ROLE_INPUT; 401/403 ไม่ผ่านสิทธิ์; 404 ROLE_NOT_FOUND; 409 Conflict/Critical Access; 500 ภายในระบบ

**พฤติกรรมสำคัญ:** รับเฉพาะ name เปลี่ยน code ไม่ได้ ส่ง code มาด้วยจะได้ 400 updatedAt เปลี่ยนเมื่ออัปเดต

**Source:** [src/controllers/role.controller.js](backend/src/controllers/role.controller.js)

### R4 — ลบ Role

**DELETE `/api/roles/:id`**

**สิทธิ์:** JWT + ADMIN + Active /admin/roles Menu Grant

**Request:**

ไม่มี Request Body ใช้ `:id` เป็น UUID ของรายการเป้าหมาย

**Response — HTTP 200:**

```json
{
  "success": true,
  "message": "Role deleted successfully"
}
```

**Errors:** 400 UUID; 401/403 ไม่ผ่านสิทธิ์; 404 ROLE_NOT_FOUND; 409 ADMIN_ROLE_PROTECTED/ROLE_IN_USE/ROLE_WRITE_CONFLICT/Critical Access; 500 ภายในระบบ

**พฤติกรรมสำคัญ:** ADMIN ลบไม่ได้แม้มีผู้ใช้ 0 คน Role อื่นต้องไม่มีผู้ใช้ผูกอยู่ รวม Inactive ลบเฉพาะ Role/Grants ของ Role นั้น ไม่ลบ Menu Records

**Source:** [src/controllers/role.controller.js](backend/src/controllers/role.controller.js)

### R5 — อ่านเมนูที่กำหนดให้ Role

**GET `/api/roles/:id/menus`**

**สิทธิ์:** JWT + ADMIN + Active /admin/roles Menu Grant

**Request:**

ไม่มี Request Body ใช้ `:id` เป็น UUID ของรายการเป้าหมาย

**Response — HTTP 200:**

```json
{
  "success": true,
  "role": {
    "id": "22222222-2222-4222-8222-222222222222",
    "code": "AUDITOR",
    "name": "Auditor",
    "createdAt": "2026-11-20T00:00:00.000Z",
    "updatedAt": "2026-11-20T00:00:00.000Z"
  },
  "menuIds": [
    "33333333-3333-4333-8333-333333333333"
  ]
}
```

**Errors:** 400 UUID; 401/403 ไม่ผ่านสิทธิ์; 404 ROLE_NOT_FOUND; 500 ภายในระบบ

**พฤติกรรมสำคัญ:** คืน ID ของ Grants ที่บันทึกจริง รวมเมนูที่อาจ Inactive ไม่ใช่ Tree สำหรับ Sidebar; ใช้ GET /menus อ่านรายละเอียดแต่ละ ID

**Source:** [src/controllers/role.controller.js](backend/src/controllers/role.controller.js)

### R6 — แทนที่ชุดเมนูของ Role

**PUT `/api/roles/:id/menus`**

**สิทธิ์:** JWT + ADMIN + Active /admin/roles Menu Grant

**Request:**

```json
{
  "menuIds": [
    "33333333-3333-4333-8333-333333333333"
  ]
}
```

**Response — HTTP 200:**

```json
{
  "success": true,
  "role": {
    "id": "22222222-2222-4222-8222-222222222222",
    "code": "AUDITOR",
    "name": "Auditor",
    "createdAt": "2026-11-20T00:00:00.000Z",
    "updatedAt": "2026-11-20T00:00:00.000Z"
  },
  "menuIds": [
    "33333333-3333-4333-8333-333333333333"
  ]
}
```

**Errors:** 400 UUID/INVALID_MENU_IDS (ซ้ำหรือไม่มีจริง)/INVALID_ROLE_INPUT; 401/403 ไม่ผ่านสิทธิ์; 404 ROLE_NOT_FOUND; 409 CRITICAL_MENU_PROTECTED/ROLE_WRITE_CONFLICT/ROLE_IN_USE; 500 ภายในระบบ

**พฤติกรรมสำคัญ:** Replace ทั้งชุดใน Transaction เดียว ส่ง [] เพื่อล้างได้สำหรับ Role ทั่วไป Parent ไม่ให้สิทธิ์ลูกอัตโนมัติ เลือกแต่ละเมนูโดยตรง ห้ามถอน Critical ADMIN Grants ตัวอย่าง Grant Group อย่างเดียวไม่ทำให้มีหน้าปลายทางใน Sidebar

**Source:** [src/controllers/role.controller.js](backend/src/controllers/role.controller.js)

### U1 — อ่านผู้ใช้สำหรับเลือกเปลี่ยน Role

**GET `/api/users`**

**สิทธิ์:** JWT + ADMIN + Active /admin/users Menu Grant

**Request:**

`GET /api/users?page=1&pageSize=10` ไม่มี Request Body

| Query | Default | กติกา |
|---|---|---|
| page | 1 | จำนวนเต็มบวกแบบเลขฐานสิบ ไม่มีเลขศูนย์นำหน้า |
| pageSize | 10 | จำนวนเต็มบวก 1–100 ไม่มีเลขศูนย์นำหน้า |

ไม่รับ Query อื่น และ Offset (page−1)×pageSize ต้องไม่เกิน 2147483647

**Response — HTTP 200:**

```json
{
  "success": true,
  "total": 1,
  "users": [
    {
      "id": "44444444-4444-4444-8444-444444444444",
      "username": "example_user",
      "email": "user@example.invalid",
      "isActive": true,
      "roleId": "22222222-2222-4222-8222-222222222222",
      "role": "AUDITOR"
    }
  ],
  "page": 1,
  "pageSize": 10
}
```

**Errors:** 400 Query ไม่ถูกต้อง; 401/403 ไม่ผ่านสิทธิ์; 500 ภายในระบบ

**พฤติกรรมสำคัญ:** Supporting API รวมผู้ใช้ Active/Inactive เรียง username แล้ว id ไม่แสดง Hash/Profile Fields ไม่เพิ่ม User Create/Delete/Activation API

**Source:** [src/controllers/user-list.controller.js](backend/src/controllers/user-list.controller.js)

### U2 — กำหนดหนึ่ง Role ให้ผู้ใช้

**PUT `/api/users/:id/role`**

**สิทธิ์:** JWT + ADMIN + Active /admin/users Menu Grant

**Request:**

```json
{
  "roleId": "22222222-2222-4222-8222-222222222222"
}
```

**Response — HTTP 200:**

```json
{
  "success": true,
  "user": {
    "id": "44444444-4444-4444-8444-444444444444",
    "username": "example_user",
    "email": "user@example.invalid",
    "role": "AUDITOR",
    "firstName": null,
    "lastName": null,
    "phone": null,
    "avatarUrl": null
  }
}
```

**Errors:** 400 INVALID_USER_ID/INVALID_ROLE_ASSIGNMENT; 401/403 ไม่ผ่านสิทธิ์; 404 USER_NOT_FOUND/ROLE_NOT_FOUND; 409 LAST_ACTIVE_ADMIN/ROLE_ASSIGNMENT_CONFLICT/CRITICAL_MENU_PROTECTED; 500 ภายในระบบ

**พฤติกรรมสำคัญ:** id คือผู้ใช้เป้าหมาย ไม่ใช่ผู้ Login เสมอไป รับ roleId เพียงฟิลด์เดียว ไม่เปลี่ยน Profile/Password/Active ห้ามลดสิทธิ์ Active ADMIN คนสุดท้าย Same JWT จะอ่าน Role ล่าสุดใน Request ถัดไป

**Source:** [src/controllers/user-role.controller.js](backend/src/controllers/user-role.controller.js)

### S1 — อ่านเมนูตามสิทธิ์ของผู้ Login

**GET `/api/me/menus`**

**สิทธิ์:** JWT ทุก Role ที่ Active และ Mapping พร้อม ไม่ต้องมี Menu Grant เพื่อเรียกเส้นนี้

**Request:**

ไม่มี Request Body

**Response — HTTP 200:**

```json
{
  "success": true,
  "menus": [
    {
      "id": "33333333-3333-4333-8333-333333333333",
      "menuName": "Profile",
      "menuPath": "/profile",
      "menuIcon": "UserRound",
      "parentId": null,
      "sortOrder": 20,
      "canAccess": true,
      "children": []
    }
  ],
  "allowedPaths": [
    "/profile"
  ]
}
```

**Errors:** 401 ไม่ผ่าน Auth; 403 RBAC_NOT_READY; 500 ภายในระบบ

**พฤติกรรมสำคัญ:** คืน Tree ตาม Direct Grants และ Active Ancestors เรียง Sort Order/ID ไม่มีสิทธิ์คืน {success:true,menus:[],allowedPaths:[]} (200) ไม่ Logout Parent ที่ไม่ Grant อาจแสดงเป็นหัวกลุ่ม canAccess:false, menuPath:null เพื่อครอบลูกที่มีสิทธิ์ Query userId/roleId ไม่เปลี่ยนผู้ใช้ที่ระบบตรวจ อ่านจาก JWT/DB ของตนเองเท่านั้น

**Source:** [src/services/menu-access.service.js](backend/src/services/menu-access.service.js)

### H1 — ตรวจ HTTP Backend

**GET `/api/health`**

**สิทธิ์:** Public

**Request:**

ไม่มี Request Body

**Response — HTTP 200:**

```json
{
  "success": true,
  "message": "Backend is running"
}
```

**Errors:** 500 ภายในระบบ

**พฤติกรรมสำคัญ:** ตรวจว่า HTTP Backend ตอบได้ ไม่ได้ตรวจ Database Connectivity

**Source:** [src/server.js](backend/src/server.js)

### F1 — โหลดไฟล์ Avatar

**GET `/uploads/avatars/:filename`**

**สิทธิ์:** Public

**Request:**

ไม่มี Request Body

**Response — HTTP 200:**

Binary WebP image ไม่มี JSON Body

**Errors:** 404 ชื่อ/ไฟล์ไม่พบ; 500 Storage Error

**พฤติกรรมสำคัญ:** อยู่นอก /api filename ต้องเป็นชื่อ UUID v4 .webp ที่ระบบสร้าง Content-Type image/webp, Cache-Control public,max-age=31536000,immutable และ nosniff ไม่ส่ง JSON เมื่อสำเร็จ

**Source:** [src/controllers/profile.controller.js](backend/src/controllers/profile.controller.js)

### Error Response และ HTTP Status กลาง

ตัวอย่าง Unauthorized จาก Middleware (ไม่มี code):

```json
{"success": false, "message": "Unauthorized"}
```

ตัวอย่าง Email ซ้ำจาก Profile (ไม่มี code), HTTP 409:

```json
{"success": false, "message": "Email already in use"}
```

ตัวอย่าง Role ที่มีผู้ใช้ผูกอยู่, HTTP 409:

```json
{"success": false, "code": "ROLE_IN_USE", "message": "Move all users, including inactive users, to another role before deleting"}
```

ตัวอย่างระบบป้องกัน Role Mapping ผิดปกติ, HTTP 403:

```json
{"success": false, "code": "RBAC_NOT_READY", "message": "Your account role is not configured. Contact an administrator."}
```

| HTTP | เงื่อนไขกลาง |
|---|---|
| 400 | JSON parse ไม่ได้: Invalid JSON body; UUID/Input ไม่ถูกต้อง หรือไฟล์ไม่ถูกต้อง |
| 401 | Credentials ผิด หรือ JWT ไม่มี/หมดอายุ/Verify ไม่ผ่าน หรือผู้ใช้หาย/Inactive |
| 403 | ไม่ใช่ ADMIN, ไม่มี Menu Grant หรือ Role Mapping ไม่พร้อม |
| 404 | ไม่พบรายการเป้าหมาย/ไฟล์/HTTP Route |
| 409 | ข้อมูลซ้ำ/Dependency/Critical Access/Last Admin/Concurrent Conflict ตาม Endpoint |
| 413 | JSON Body เกิน 16 KiB: Request body too large หรือ Avatar เกิน 2 MiB |
| 500 | {success:false,message:"Internal server error"} ไม่ส่ง Query/Stack/DB Details |

JSON Parser อยู่ก่อน Auth Middleware จึงอาจได้ 400/413 ก่อนตรวจ JWT ได้ JSON/Avatar Errors บางประเภทไม่มี code ห้ามสมมติว่าทุก Error มี code HTTP และข้อความจริงเป็นไปตามจุดที่เกิด ไม่ได้เพิ่ม 429 Rate Limit ใน Backend ปัจจุบัน Network Error/Timeout ไม่มี HTTP Response จาก API จึงไม่ใช่ Status Code ใหม่

### เงื่อนไขการบันทึกและจัดเก็บรูป

- Menu/Role/User Role Mutation ใช้ Serializable Transaction, Table Locks, Retry และตรวจ Actor/สิทธิ์ซ้ำก่อนเขียน หาก Concurrent Conflict ยังคงเกิดหลัง Retry จะตอบ 409 ไม่บันทึกบางส่วน
- Assign Menu Replace ทั้งชุดใน Transaction เดียว ไม่มี Permission รายปุ่มหรือราย Create/Update/Delete
- Critical Management Menu IDs/Paths, Active Ancestors และ ADMIN Grants ที่จำเป็นถูกป้องกัน ข้อนี้เป็นเงื่อนไขเสริมป้องกัน Admin ดูแลระบบต่อไม่ได้
- Role ADMIN ลบไม่ได้; Role อื่นมี User แม้ Inactive ก็ลบไม่ได้; ห้ามลดสิทธิ์ Active Admin คนสุดท้าย
- Avatar ตรวจ Byte Signature และ Decode จริงด้วย Sharp ไม่เชื่อชื่อไฟล์/MIME ที่ Browser ส่งมา รองรับ Static JPEG/PNG/WebP ไม่เกิน 4096×4096 และจำกัด Input Pixels จากนั้นปรับภายใน 512×512 โดยไม่ขยายรูปเล็ก แปลง WebP และตัด Metadata
- เก็บไฟล์ชื่อ UUID ใน backend/uploads/avatars และเก็บเฉพาะ Relative URL ใน users.avatar_url ไม่เก็บ Binary ใน DB หาก DB Update ล้มเหลวลบไฟล์ใหม่ หากสำเร็จจึงลบไฟล์เก่าอย่างปลอดภัย Cleanup ไฟล์เก่าล้มเหลวไม่ย้อน DB ที่ Commit แล้ว
- Profile/Avatar/Me/Login ใช้ Public User DTO ร่วมกัน Frontend ใช้ Response อัปเดต AuthContext แล้วรูปใหม่ปรากฏใน Profile/Header/Sidebar/Dashboard
- Logout ล้าง Cookie ใน Browser แต่ไม่ Revoke JWT ที่ถูกคัดลอกไว้ก่อนหน้า รูป Avatar เป็น Public URL ตามดีไซน์ ก่อน Production ต้องวางแผน HTTPS, CSRF/Origin, Rate Limit และการ Revoke ให้เหมาะสม

### วิธีลอง API โดยไม่เปิดเผย Secrets

1. เริ่ม Backend/Frontend ตามคู่มือ Login ผ่านหน้าเว็บด้วยบัญชี Local ของตนเอง Browser จะจัดการ Cookie ให้
2. ตรวจ DevTools → Network เพื่อดู Method/Path/Status และ Public Response ไม่คัดลอก Cookie/Token/Password ลงรายงาน
3. Management ใช้บัญชี ADMIN ที่ได้ Menu Grant ตรง Endpoint; Manager/User ต้องได้ 403 แม้เรียก URL เอง
4. ตรวจตาม [Test Cases.xlsx](Test%20Cases.xlsx) การลอง POST/PUT/PATCH/DELETE มีผลบันทึกจริง ให้ใช้ข้อมูล/ฐานทดสอบที่ตั้งใจแก้เท่านั้น
