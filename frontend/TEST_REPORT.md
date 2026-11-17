# Frontend verification — 17 November 2026

ตรวจด้วย local Google Chrome ผ่าน Playwright และ Vitest/jsdom ไม่สร้างบัญชีใหม่ ไม่แก้ Backend/Database และไม่รัน seed ใช้ URL Frontend `http://localhost:5173/login` และ Backend `http://localhost:4000`

## Browser + Backend จริง

เปิด Chrome แบบ headed และเตรียม username `admin` ให้ผู้ใช้กรอกรหัสผ่านในหน้าเว็บโดยตรง ผู้ใช้เลือก **ขอทดสอบ Login จริงภายหลัง** จึงหยุดการรอและปิดหน้าต่างทดสอบ ไม่มีการรับ/อ่าน/บันทึกรหัสผ่านจริง และไม่มี JWT หรือ cookie value ในผลรายงาน

| รายการ | ผล | รายละเอียด |
| --- | --- | --- |
| Frontend ทำงาน | PASS | GET `/login` HTTP 200; `npm run dev` เริ่มได้ |
| Backend ทำงาน | PASS | GET `/api/health` HTTP 200 |
| ใช้ browser automation บน local | PASS | Playwright ใช้ Google Chrome ที่ติดตั้งอยู่ โดยไม่ดาวน์โหลด browser |
| เปิด Dashboard โดยไม่มี session | PASS | GET `/api/auth/me` 401 และ redirect `/login` |
| หน้า Login แสดงผล | PASS | heading และฟอร์มแสดงใน Chrome จริง |
| ฟอร์มว่าง | PASS | แสดง error ทั้ง username/password และไม่เรียก Login API |
| Show Password | PASS | เปลี่ยน input type เป็น text ด้วยค่าทดสอบสุ่ม ไม่ใช่รหัสผ่านจริง |
| Hide Password | PASS | คืน input type เป็น password |
| Login ด้วยข้อมูลผิด | PASS | POST `/api/auth/login` 401 กับรหัสทดสอบสุ่ม |
| Error ของ Login ที่ผิด | PASS | แสดงข้อความกลางบนฟอร์ม |
| Login Desktop responsive | PASS | 1440×1000 ไม่มี horizontal overflow |
| Login Tablet responsive | PASS | 820×1180 ไม่มี horizontal overflow |
| Login Mobile responsive | PASS | 390×844 ไม่มี horizontal overflow |
| Login Small Mobile responsive | PASS | 320×720 ไม่มี horizontal overflow |
| กรอกรหัสผ่านจริงและ Login สำเร็จ | NOT TESTED | ผู้ใช้ขอทดสอบภายหลัง ไม่ใช่ผล FAIL ของ application |
| ไป `/dashboard` หลัง Login จริง | NOT TESTED | ต้องมี successful login ก่อน |
| Dashboard แสดง user จาก API จริง | NOT TESTED | ไม่ทดแทนด้วยข้อมูล mock เพื่ออ้างผล real API |
| Refresh แล้วคง authenticated session จริง | NOT TESTED | ต้องมี successful login ก่อน |
| Logout session จริงและเข้า Dashboard ไม่ได้ | NOT TESTED | ต้องมี successful login ก่อน |
| Console/runtime ก่อน handoff | PASS | 0 JavaScript runtime errors; 2 console HTTP 401 messages สอดคล้องกับ unauthenticated me และ rejected login ที่ตั้งใจทดสอบ |
| Network ก่อน handoff | PASS | auth requests จริงมี GET me 401 และ POST login 401 ไม่มี request/redirect loop |

ตัวนับใน `test-results/e2e-results.json` มี 13 automated PASS checks ก่อน handoff; ตารางข้างต้นแยก/รวมขั้นตอนย่อยบางรายการเพื่ออธิบาย checklist ของผู้ใช้ให้ครบ ไม่ใช่จำนวน test cases เพิ่มเติม

ตรวจภาพ screenshot ของ Login desktop/mobile จริงแล้ว หน้า mobile เน้นฟอร์ม ส่วน desktop เป็น split layout ภาพ screenshot ไม่มีรหัสผ่านจริง

## Frontend browser regression — mock API เท่านั้น

`npm run test:ui`: **16/16 PASS** ใช้ Playwright + Chrome headless และ intercept auth API ด้วย fixture ใน browser ไม่มี request ไปเขียน DB และไม่มีบัญชี fixture ถูกสร้างจริง

- Dashboard อ่าน/แสดงข้อมูลจาก API response fixture
- ไม่มี horizontal overflow ทั้ง 1440, 1024, 820, 768, 390 และ 320 px
- Mobile drawer เปิดได้ มี accessible dialog ปิดด้วย Escape และคืน focus ให้ trigger
- เลือก Dashboard ใน drawer แล้ว drawer ปิด
- Check session เรียก me เพียงครั้งเดียว
- Logout ตอบ error แล้วคง user/route และแจ้งข้อผิดพลาด
- Logout success แล้วไป login และ Dashboard ถูกป้องกัน
- ไม่มี browser runtime errors หรือ me request loop

ตรวจ screenshot Dashboard desktop/mobile แล้ว และปรับขนาดตัวอักษรกับสีข้อความเพื่อให้อ่านง่ายขึ้น ภาพเหล่านี้ใช้ fixture `preview_user` สำหรับ visual QA เท่านั้น ไม่ใช่หลักฐานว่า real account login สำเร็จ

## React DOM integration tests

`npm test`: **14/14 PASS** ใน jsdom โดยใช้ AuthProvider/Router/Pages จริงและ mock เฉพาะ Axios adapter:

1. StrictMode เรียก initial me ครั้งเดียว และ redirect dashboard ที่ไม่ authenticated
2. Loading ระหว่าง me ยังไม่ตอบ
3. Validation empty fields และ focus
4. Show/hide ไม่ submit form
5. Enter submit, ใช้ user จาก Login ทันที ไม่เรียก me ซ้ำ ไม่เขียน browser storage
6. Wrong credentials แสดง error และอยู่ login
7. Disable submit และป้องกัน duplicate requests
8. Validate password ตาม UTF-8 byte length
9. Restore session จาก me และ redirect signed-in login
10. Confirmed logout ล้าง user และป้องกัน dashboard
11. Failed logout ไม่แสดงว่าออกจากระบบสำเร็จ
12. Network failure แยกจาก 401 และ retry ได้
13. Session check 401 กลับ login
14. Drawer เปิด/ปิดด้วย keyboard

## Build และ dependencies

- `npm run build`: PASS
- `npm audit`: ไม่พบช่องโหว่ของ Frontend
- Initial CUA preview เปิดไม่ได้เพราะ browser host unavailable; เมื่อผู้ใช้ขอ Playwright จึงติดตั้ง `playwright-core` ใน Frontend และใช้ Chrome local ได้ตามจริง ไม่เปลี่ยน backend เพื่อแก้ข้อจำกัดเครื่องมือ
- ไม่มี Git repository ในโฟลเดอร์นี้ จึงไม่มี Git diff ให้ตรวจ
- โค้ด runtime ใหม่ทั้งหมดเป็น JavaScript/JSX; ตั้ง shadcn `tsx: false` และใช้ Tailwind v4 Vite plugin

## ทดสอบ E2E จริงต่อภายหลัง

เปิด Backend และ Frontend แล้วจากโฟลเดอร์ Frontend รัน:

```sh
npm run test:e2e
```

หลังตรวจหน้า login และข้อมูลผิดแล้ว Script จะเปิด Chrome รอ password ของ admin ที่มีอยู่แล้วเป็นเวลาไม่เกิน 10 นาที ให้กรอก/submit ใน Chrome โดยตรง จากนั้นจะตรวจ API user, dashboard, refresh, redirect, responsive, drawer, session check, logout และ dashboard guard อัตโนมัติ

ไม่มี password ผ่าน CLI arguments, env ที่ฝังใน source, chat หรือ log; ไม่สร้าง trace/HAR หรือ persist authentication state ผลลัพธ์เก็บเฉพาะ method/path/status, PASS/FAIL และ screenshot ที่ไม่แสดง credentials ใน `test-results/` ซึ่งถูก gitignore


## UI simplification — 17 November 2026

ปรับเป็น Intern Portal ตามภาพอ้างอิง: Login การ์ดกลางหน้าจอ, sidebar สีเข้ม, สีหลักน้ำเงิน, ลดรายละเอียดตกแต่ง และคงข้อมูลจริงกับฟังก์ชันเดิม

- `npm test`: PASS 14/14
- `npm run build`: PASS
- `npm run test:ui`: PASS 16/16 โดย mock API เฉพาะ browser tests
- Login 1440, 390 และ 320 px: PASS ไม่มี horizontal overflow
- ตรวจภาพ Login desktop และ Dashboard desktop/mobile แล้ว
- ไม่ทดสอบ Login ด้วย password จริงซ้ำ และไม่เปลี่ยน Backend/Database
