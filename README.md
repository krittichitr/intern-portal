# Intern Portal — Login, Profile, Menu & Role Management

React/Vite/Tailwind/shadcn + Express/Prisma/PostgreSQL. Authentication ใช้ JWT ผ่าน HttpOnly Cookie เดิม

## การใช้งาน Local ปัจจุบัน

- Frontend: http://localhost:5173/login
- Backend: http://localhost:4000
- Login ด้วยบัญชีเดิม ไม่มีการเปลี่ยนรหัสผ่านจากงาน Frontend
- Admin: /admin/menus, /admin/roles, /admin/users
- ผู้ใช้ทั่วไปเห็น Sidebar ตาม Role และ Menu Grants; URL ที่มีจริงแต่ไม่มีสิทธิ์แสดง 403

## ติดตั้ง Dev ใหม่

1. เตรียม PostgreSQL และไฟล์ backend/.env จาก backend/.env.example กำหนด Database/JWT Secret/Frontend Origin ของตนเอง ไม่ Commit .env
2. ใน backend รัน npm ci, npm run prisma:generate และ npx prisma migrate deploy
3. สำหรับฐาน Dev/Demo ใหม่ที่ยังไม่มี Role/User: npm run rbac:roles:apply แล้ว npm run rbac:users:seed เพื่อสร้างบัญชีทดสอบ 18 คน (Admin 3 / Manager 5 / User 10) Credentials เก็บเฉพาะ backend/.local/dev-seed-credentials.json ที่ Ignore/Permission จำกัด ไม่แสดงรหัสผ่านใน Docs/Logs หากมีผู้ใช้เดิมจะรักษาข้อมูลเดิมไว้
4. ตรวจแผนด้วย npm run rbac:menus:check แล้วเริ่มต้นด้วย npm run rbac:menus:seed ให้มี Menus/Grants ก่อนใช้ Guards Seed เป็น Bootstrap ไม่ใช่เครื่องมือ Reset สิทธิ์หลังแก้ข้อมูลตามปกติ
5. เปิด Backend: cd backend แล้ว npm run dev
6. อีก Terminal: cd frontend, npm ci, ตั้งค่า Frontend จาก .env.example หากต้องเปลี่ยน Backend URL แล้ว npm run dev

คำสั่งเตรียมฐานใหม่เป็นแนวทางติดตั้ง ไม่ได้รันซ้ำกับ Dev ของผู้ใช้ในงาน Frontend นี้ .env และข้อมูล Dev เดิมไม่เปลี่ยน Seed Users เป็น Dev-only ไม่ใช่ Production Provisioning

## ฟังก์ชันตาม Assignment

- Login/Dashboard/Logout และแก้ Profile/Avatar เดิม
- Menu CRUD: ชื่อ/Path/Icon/Parent/Sort/Active และตารางรวม Inactive
- Role CRUD และ Assign Menu แบบเลือก/ยกเลิก Explicit Grants
- User Role Assignment ผ่านตารางผู้ใช้แบบแบ่งหน้า หนึ่ง Role ต่อ User ไม่มี Create/Delete User
- Dynamic Sidebar + Parent/Submenu/Active/Sort และ Route Guard/403
- Backend ตรวจ JWT/Admin/Menu Grants; Profile Write APIs ตรวจ /profile Grant และยังแก้เฉพาะตนเอง
- API บังคับ 12 เส้น + Supporting GET /api/users ตาม D005 สำหรับ User Picker ไม่เพิ่ม Permission รายคำสั่ง/รายปุ่ม, Multiple Roles, Group/Department หรือ Audit Log

## เอกสารและการทดสอบ

- [คู่มือ Frontend](frontend/README.md)
- [Backend](backend/README.md), [Menu API](backend/MENU_API.md), [Role API](backend/ROLE_API.md), [User Role/User Picker API](backend/USER_ROLE_API.md), [My Menus API](backend/ME_MENUS_API.md)
- [แผนและความคืบหน้า](docs/rbac/PHASE1_DATABASE_DESIGN.md) หัวข้อ 24
- Frontend: npm run build, npm run lint, npm test
- Browser E2E: ใน frontend ใช้ npm run test:rbac:e2e เฉพาะเมื่อกำหนด RBAC_TEST_DATABASE_URL เป็น Local Disposable DB ชื่อ login_rbac_test_* ที่ไม่ใช่ App DB, Deploy Migrations แล้ว และเริ่มว่าง Script ใช้ Chrome ที่ติดตั้งไว้ ไม่ติดตั้ง Browser เพิ่ม ไม่บันทึก Password/JWT/Cookie/Trace/HAR และมีการสร้าง/ลบ Fixtures เฉพาะในฐานทดสอบ

ผลล่าสุด 20 พ.ย. 2026: Frontend 122 Tests / Build / Lint ผ่าน; Chrome E2E 20 Checks ผ่านกับ API/PostgreSQL จริงบนฐานแยก Backend Regression ทั้ง Mock/Real DB ผ่าน ข้อมูล Dev สี่ตารางไม่เปลี่ยน ดูรายละเอียด/ภาพในรายงาน

## งานก่อน Final Delivery ที่ยังเหลือ

Frontend ครบหน้าที่ระบุและทดสอบแล้ว ยังต้องทำ Final role_id NOT NULL Cutover ตามแผน (ปัจจุบัน Nullable ช่วง Transition), ตรวจ Fresh Install/Upgrade/Seed กับ Schema สุดท้าย และปิด Delivery Checklist ไม่อ้างว่า Production Deployment หรือ Final Acceptance Database ครบแล้ว ไม่มี Commit/Push อัตโนมัติ


## บัญชี Dev ปัจจุบัน — ปรับตามคำขอ 20 พฤศจิกายน 2026

รวม 18 คน: admin01–admin03, manager01–manager05, user01–user10 โดย admin01 คือบัญชี Admin เดิมที่เปลี่ยน Username แล้ว เก็บ ID/Email/Profile เดิมไว้ จำนวน Admin 3 รวมบัญชีนี้แล้ว ไม่ใช่เพิ่มอีก 3 คน

รหัสผ่านของทั้ง 18 บัญชีปรับตามรูปแบบง่ายและเลขท้ายที่ผู้ใช้กำหนด ใช้เฉพาะชุด Dev นี้ รายละเอียดอยู่ในไฟล์ Credentials Private เดิม ไม่มีการแก้ JWT/.env หรือเพิ่ม User CRUD Seed ใหม่สร้างชุด 18 คนตามชื่อใหม่ และการรันซ้ำไม่คืนบัญชีส่วนเกิน/ไม่ Reset รหัสผ่านของบัญชีที่มีอยู่
# intern-portal
