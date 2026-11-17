## Part 10 — Learning Roadmap

### 10.1 ลำดับอ่านจริงจากพื้นฐานไปครบ flow

| ลำดับ | ไฟล์/บรรทัดที่เริ่ม | เป้าหมายการเรียน | คำถามที่ควรตอบได้หลังอ่าน |
| --- | --- | --- | --- |
| 1 | `frontend/index.html:12` → `frontend/src/main.jsx:8` | DOM root, JSX tree, entry point | Reactเริ่มตรงไหน และRouter/Providerครอบใคร? |
| 2 | `frontend/src/App.jsx:10` | Routes, Outlet, Navigate, replace | เปิด/loginกับ/dashboardผ่านguardตัวไหน? |
| 3 | `frontend/src/pages/Login.jsx:14` | controlledinputs, state, events, refs | ทำไมpendingต้องใช้refแต่loadingใช้state? |
| 4 | `frontend/src/pages/Login.jsx:24` | validationและasyncformhandler | กรอกว่างแล้วrequestถูกหยุดตรงไหน? finallyมีประโยชน์อะไร? |
| 5 | `frontend/src/lib/api.js:3` | Axiosinstance, baseURL, credentials, timeout | /auth/loginกลายเป็นfullendpointอย่างไร? cookieใครเป็นคนส่ง? |
| 6 | `frontend/src/context/auth-context.js:3` → `useAuth.js:4` → `AuthContext.jsx:14` | sharedstateและcustomhook | Reactรู้ว่ามีuserจากอะไร และข้อมูลไม่เท่ากับJWTอย่างไร? |
| 7 | `frontend/src/context/AuthContext.jsx:71` | loginmethodและPromise | ทำไมLoginใช้userจากresponseได้เลย? Errorไปถึงcatchไหน? |
| 8 | `backend/src/server.js:9` → `routes/auth.routes.js:5` | middlewareorderและrouting | JSON/cookieพร้อมก่อนcontrollerเพราะอะไร? nextทำอะไร? |
| 9 | `backend/src/controllers/auth.controller.js:6` | credentialverificationและHTTPresponse | findUniqueคืนnullต่างจากquerythrowอย่างไร?401กับ500ต่างกันตรงไหน? |
| 10 | `backend/prisma/schema.prisma:10` → `src/lib/prisma.js:5` | model/constraint/select/client | ทำไมเรียกprisma.users?password_hashหลุดไปJSONได้หรือไม่? |
| 11 | `backend/src/config.js:16` → `controllers/auth.controller.js:22` | JWTclaimsและcookieattributes | expกับmaxAgeใช้หน่วยเหมือนกันไหม?HttpOnlyช่วยอะไร? |
| 12 | `backend/src/middleware/auth.middleware.js:6` → `controllers/auth.controller.js:32` | verifyก่อนlookupและส่งpublicuser | attackerเปลี่ยนsubแล้วทำไมไม่ควรverifyผ่าน?userinactiveทำไมต้องถามDB? |
| 13 | `frontend/src/context/AuthContext.jsx:25` → `ProtectedRoute.jsx:5` → `Dashboard.jsx:14` | restorestateและloading/401/networkbranches | refreshแล้วuseStateหายแต่ทำไมยังคืนuserได้? |
| 14 | `frontend/src/pages/Dashboard.jsx:19` → `AuthContext.jsx:81` → `backend/src/controllers/auth.controller.js:35` | confirmedlogoutและstatelesslimit | ถ้าAPI500Reactควรclearuserไหม?JWTcopyหลังlogoutเป็นอย่างไร? |
| 15 | `frontend/src/components/layout/Header.jsx:10` และ`Sidebar.jsx:10` | propscallbacks, controlledSheet, accessibility | Sidebarเรียกbusinesslogoutได้โดยไม่ต้องมีAxiosเองอย่างไร? |
| 16 | `frontend/src/components/ui/button.jsx:39` → `lib/utils.js:4` | componentreuse, rest/spread, variantstyles | asChildใช้เมื่อไร?propsส่งต่อไปDOMอย่างไร? |
| 17 | testsในPart3.8/4.13 | unit/DOM/mock/integration/E2Eboundaries | testแบบใดเขียนDB?แบบใดไม่ยืนยันcookieจริง? |
| 18 | Findings F01–F10 | แยกbug/risk/suggestionและruntimeevidence | สิ่งใดต้องแก้ก่อนpublicdeploy และอะไรเก็บเป็นงานปรับปรุงได้? |

### 10.2 JavaScript/HTTP syntax ที่ควรเข้าใจจากโค้ดนี้

| Syntax/ศัพท์ | ตัวอย่างในproject | ความหมายที่ใช้จริง |
| --- | --- | --- |
| `req`, `res` | `backend/src/controllers/auth.controller.js:6` | objectsที่Expressส่งให้handler:requestมีข้อมูลที่รับ,responseใช้ตั้งstatus/header/body ไม่ใช่userrecord |
| `req.body` | `controller:7` หลัง`server:12` | ผลJSONparser;เป็นข้อมูลclientที่ยังต้องvalidate ไม่ใช่ข้อมูลDBที่เชื่อถือได้ |
| `req.cookies` | `middleware:7` หลัง`server:13` | objectจากCookieheaderparser tokenยังเป็นuntrustedinputก่อนverify |
| `req.user` | `middleware:26` → `controller:33` | propertyที่applicationmiddlewareสร้างเอง ไม่ใช่Expressเติมuserให้โดยอัตโนมัติ |
| `res.status().json()` | `controller:27` | methodchaining:เลือกHTTPstatusแล้วserializeJSONและจบresponse;`return`ช่วยหยุดhandlerไม่ให้ส่งซ้ำ |
| `async/await` | `controller:15`, `Login.jsx:41` | asyncfunctionคืนPromise;awaitรอผลPromiseในfunctionนั้น ไม่ได้หยุดทั้งNodeprocessหรือbrowserทั้งหมด |
| Promise | `AuthContext.jsx:31` | ตัวแทนผลที่ยังไม่มาถึง;thenรับsuccess,catchรับrejection,finallycleanupทั้งสองกรณี chainแต่ละขั้นคืนPromiseใหม่ |
| functionที่คืนPromiseโดยไม่มีasync | `AuthContext.jsx:25`,`:81` | checkAuth/logoutคืนAxioschain จึงawaitได้เหมือนกัน |
| `try/catch/finally` | `Login.jsx:40`,`:44`,`:53` | tryทำงาน;catchรับthrow/rejectedawait;finallyปลดpendingไม่ว่าผลเป็นอย่างไร |
| Middleware / `next()` | `backend/src/middleware/auth.middleware.js:27` | ส่งงานไปhandlerถัดไป;return401คือหยุดเส้นทาง;next(error)ไปerrorhandler |
| Callback | `server.js:38`, `Login.jsx:77` | functionที่ส่งให้ระบบอื่นเรียกภายหลังเหตุการณ์ ไม่จำเป็นต้องasyncทุกcallback |
| Destructuring | `controller:7`, `AuthContext.jsx:32` | แกะpropertyออกจากobject,renameusernameเป็นnameที่controller26 |
| Rest / spread | `middleware:25`, `Login.jsx:77`, `ui/button.jsx:44` | restรวบรวมส่วนที่เหลือ;spreadกระจายpropertiesเข้าobject/propsใหม่ ทั้งสองใช้`...`แต่บริบทต่างกัน |
| Named export/import | `export function login`, `import {login}` | ต้องใช้ชื่อexportที่ตรง;วงเล็บปีกกาในimportนี้ไม่ใช่objectdestructuringตอนruntime |
| Default export/import | `export default router`, `import authRoutes` | moduleมีdefaultหนึ่งค่า ชื่อlocalimportเลือกได้ |
| Side-effect import | `import 'dotenv/config'`, `import './index.css'` | โหลดผลการตั้งค่าหรือCSSโดยไม่รับตัวแปรbinding |
| Optional chaining | `error.response?.status`, `data?.user` | ถ้าส่วนก่อนหน้าnull/undefinedให้ผลundefinedแทนthrow ไม่ทดแทนvalidation |
| Short-circuit | `controller:19` | ORหยุดเมื่อพบtruthy;เป็นเหตุผลที่unknownuserไม่comparehash |
| Functional state updater | `setShowPassword(value => !value)` | รับค่าก่อนหน้าให้Reactคำนวณค่าถัดไป เหมาะเมื่อค่าถัดไปขึ้นกับค่าเก่า |
| `void checkAuth()` | `AuthContext.jsx:60` | จงใจไม่ใช้returnvalue ไม่ได้cancelPromiseหรือทำให้errorถูกcatchเอง;ปลอดภัยจากAxiosrejectionทั่วไปเพราะcheckAuthcatchไว้ |
| HTTP401 | mefailure | “ยังยืนยันตัวตนไม่ผ่าน” อาจเป็นภาวะguestปกติ ไม่ใช่JavaScriptsyntaxerror |
| Authentication vs Authorization | middlewareเทียบกับrolebadge | authenticationตอบว่าเป็นใคร;authorizationตอบว่าทำอะไรได้ V1ตรวจselfauthแต่ยังไม่มีoperationแยกตามrole |

### 10.3 แบบฝึกหัดอ่านโค้ดโดยไม่แก้ระบบ

1. ตามเส้นทาง“passwordผิด”แล้วเขียนชื่อfunctionsตั้งแต่formจนerrorUI ระบุว่าค่าuserstateเปลี่ยนหรือไม่ ใช้Part5.1ตรวจคำตอบ
2. ตามเส้นทาง“me401”เทียบกับ“me500” ระบุbranchที่ทำให้redirectต่างกัน โดยอ้างAuthContextบรรทัด40
3. ลองอธิบายว่าการลบcookieกับการลบuserrecordต่างกันอย่างไรโดยใช้logoutcontroller35และmiddleware20เป็นหลักฐาน ไม่ต้องทดลองลบข้อมูล
4. อธิบายว่าเหตุใดไม่ควรย้ายuserroleจากDBไปเชื่อJWTที่clientส่งโดยไม่verify และทำไมปัจจุบันsubถูกตรวจUUIDก่อนquery
5. อธิบายทุกpropertyของpublicUserSelectและตำแหน่งที่hashถูกเลือกชั่วคราวแต่ไม่ส่งกลับ
6. อ่านBackendtestก่อนตัดสินใจรัน แล้วแยกqueriesที่อ่านกับที่เขียนให้ครบตามPart6.2
7. ใช้FunctionReferenceเลือกcallbackเล็กหนึ่งตัว เช่นsetErrorsupdater แล้วอธิบายinput/outputโดยไม่ข้ามไปแก้architecture

ตัวอย่างpromptสำหรับนำรายงานไปเรียนกับChatGPTต่อ:

> “ใช้รายงานนี้อธิบาย frontend/src/pages/Login.jsx ทีละช่วง: แสดงinput/state/eventที่เกี่ยวข้อง ตามเส้นทางhandleSubmitสำเร็จและล้มเหลว และถามคำถามตรวจความเข้าใจ ห้ามแก้โค้ดหรือขอรหัสผ่านจริง”

> “อธิบายbackend/src/middleware/auth.middleware.js:6 ทีละbranch พร้อมแยกผลของjwt.verify,PrismafindUnique,return401และnext() แล้วให้ผมลองวาดmeflowเอง”

### 10.4 ขอบเขตการตรวจและแหล่งอ้างอิง

- ตรวจโครงสร้าง/imports/exports/functions/line numbersจากไฟล์จริง ทุกfunctionที่ประกาศในappมีรายการในPart9 และมีคำอธิบายขยายในPart3–4
- ตรวจsource/config/scriptsและlockfiles ไม่อ่านPrismageneratedclient/buildoutputsเป็นbusinesssource และไม่รันtestsที่มีsideeffects
- แหล่งภายนอกใช้ประกอบความหมายlibrary/securityเท่านั้น ไม่ใช้ยืนยันว่าruntimeของเครื่องนี้ผ่าน: [Express5](https://expressjs.com/en/5x/guide/error-handling/), [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken/blob/master/README.md?plain=1), [bcrypt.js](https://github.com/dcodeIO/bcrypt.js), [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [OWASP CORS](https://cheatsheetseries.owasp.org/cheatsheets/CORS_Security_Cheat_Sheet.html), และadvisoryสองรายการที่อ้างในPart7.4
- ไม่ได้ทำpenetrationtest,benchmarktiming,DBintrospection,fullvulnerabilityscanหรือrealaccountE2E ผลส่วนนั้นจึงไม่ควรถูกเปลี่ยนเป็นPASSเพียงเพราะsourceดูสมเหตุผล
- ไม่พบGitrootสำหรับGitstatus/diff ใช้hashinventoryเทียบไฟล์ที่มีอยู่ก่อน/หลังแทน โดยไม่แสดงค่าหรือhashของsecrets
- ไม่แก้findingsอัตโนมัติ ไม่commit/push ไม่install/uninstall ไม่แก้environmentหรือDatabase ไฟล์เดียวที่สร้างคือรายงานนี้

