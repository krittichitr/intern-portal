import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// Fail closed: this process never receives the auth_db connection or real JWT
// secret. Every users query used below is mocked before any HTTP request.
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/profile_mock_only?connect_timeout=1";
process.env.JWT_SECRET = randomBytes(48).toString("hex");
process.env.NODE_ENV = "test";
const { app } = await import("../src/server.js");
const { prisma } = await import("../src/lib/prisma.js");
const { config, publicUserSelect } = await import("../src/config.js");
const { Prisma } = await import("@prisma/client");

// Prisma is mocked here; real-DB suites require an explicit disposable target.
test("Profile API over HTTP with mocked Prisma and an unreachable test DB", async (t) => {
  const id = randomUUID();
  const password = randomUUID();
  const original = {
    id, username: "profile_test_user", email: "before@example.invalid", role: "USER",
    role_record: { id: randomUUID(), code: "USER" },
    first_name: null, last_name: "Existing", phone: "0812345678", avatar_url: "/avatars/default.svg",
    is_active: true, password_hash: await bcrypt.hash(password, 12), updated_at: new Date(0),
  };
  let record = { ...original };
  let updates = [];
  let updateError;
  let lookupError;
  let missing = false;
  const project = (row, select) => Object.fromEntries(
    Object.keys(select).filter((key) => select[key]).map((key) => [key, row[key]]),
  );
  // Prisma delegates expose methods through proxy getters. Assign the fake
  // methods directly and restore them in finally instead of mocking descriptors.
  const originalFindUnique = prisma.users.findUnique;
  const originalUpdate = prisma.users.update;
  const originalTransaction = prisma.$transaction;
  prisma.$transaction = async (action) => {
    const before = { ...record };
    try { return await action({ users: prisma.users, $executeRaw: async () => 0,
      menus: { findMany: async () => [{ id: 'profile-menu', menu_name: 'Profile', menu_path: '/profile', menu_icon: 'UserRound', parent_id: null, sort_order: 20, is_active: true }] },
      role_menus: { findMany: async () => [{ menu_id: 'profile-menu' }] } }); } catch (error) { record = before; throw error; }
  };
  prisma.users.findUnique = async ({ where, select }) => {
    if (lookupError) throw lookupError;
    if (missing || (where.id && where.id !== id) || (where.username && where.username !== record.username)) return null;
    return project(record, select);
  };
  prisma.users.update = async (args) => {
    updates.push(args);
    if (updateError) throw updateError;
    assert.deepEqual(args.where, { id });
    record = { ...record, ...args.data };
    return project(record, args.select);
  };
  const token = jwt.sign({}, config.jwtSecret, { subject: id, expiresIn: "1h", algorithm: "HS256" });
  const cookie = `auth_token=${token}`;
  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    instance.once("error", reject);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const reset = () => {
    record = { ...original };
    updates = [];
    updateError = undefined;
    lookupError = undefined;
    missing = false;
  };
  const request = (path, options = {}) => fetch(base + path, options);
  const patch = (body, authCookie = cookie) => request("/api/profile/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(authCookie ? { Cookie: authCookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const checkInvalid = async (body) => {
    const before = updates.length;
    const response = await patch(body);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).success, false);
    assert.equal(updates.length, before, "Invalid input must never reach users.update");
  };
  const expectedUser = () => ({
    id, username: record.username, email: record.email, role: record.role,
    firstName: record.first_name, lastName: record.last_name,
    phone: record.phone, avatarUrl: record.avatar_url,
  });
  const checkSafe = (body) => {
    assert.ok(!JSON.stringify(body).includes(original.password_hash), "Response must not include a hash");
    assert.ok(!JSON.stringify(body).includes(config.jwtSecret), "Response must not include JWT secret");
    assert.ok(!JSON.stringify(body).includes(token), "Response must not include JWT");
    assert.ok(!("password_hash" in (body.user || {})), "No password field in public user");
  };
  try {
    await t.test("missing, invalid, expired and wrong-signature cookies are unauthorized", async () => {
      reset();
      const cookies = [undefined, "auth_token=invalid",
        `auth_token=${jwt.sign({}, config.jwtSecret, { subject: id, expiresIn: -1 })}`,
        `auth_token=${jwt.sign({}, randomUUID(), { subject: id, expiresIn: "1h" })}`];
      for (const authCookie of cookies) {
        const response = await patch({ firstName: "Example" }, authCookie || "");
        assert.equal(response.status, 401);
        assert.deepEqual(await response.json(), { success: false, message: "Unauthorized" });
      }
      assert.equal(updates.length, 0);
    });
    await t.test("inactive and deleted users cannot update", async () => {
      reset(); record.is_active = false;
      assert.equal((await patch({ firstName: "Example" })).status, 401);
      record.is_active = true; missing = true;
      assert.equal((await patch({ firstName: "Example" })).status, 401);
      assert.equal(updates.length, 0);
    });
    await t.test("all four fields map to DB columns and safe camelCase response", async () => {
      reset();
      const before = new Date();
      const response = await patch({ firstName: " Somchai ", lastName: " Jaidee ", phone: "+66 81 234 5678", email: " Somchai@Example.com " });
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.deepEqual(data, { success: true, message: "Profile updated successfully", user: expectedUser() });
      assert.deepEqual(updates[0].where, { id });
      assert.deepEqual(updates[0].select, publicUserSelect);
      assert.deepEqual(Object.keys(updates[0].data).sort(), ["email", "first_name", "last_name", "phone", "updated_at"].sort());
      assert.equal(record.first_name, "Somchai");
      assert.equal(record.last_name, "Jaidee");
      assert.equal(record.email, "somchai@example.com");
      assert.ok(record.updated_at instanceof Date && record.updated_at >= before);
      assert.equal(record.avatar_url, original.avatar_url);
      assert.equal(response.headers.get("cache-control"), "no-store");
      checkSafe(data);
    });
    await t.test("PATCH changes only the supplied field plus updated_at", async () => {
      reset();
      const response = await patch({ lastName: "New last name" });
      assert.equal(response.status, 200);
      assert.deepEqual(Object.keys(updates[0].data).sort(), ["last_name", "updated_at"]);
      assert.equal(record.email, original.email);
      assert.equal(record.first_name, original.first_name);
      assert.equal(record.phone, original.phone);
      assert.equal(record.password_hash, original.password_hash);
      assert.equal(record.role, original.role);
      assert.equal(record.username, original.username);
    });
    await t.test("null explicitly clears optional fields but not email or avatar", async () => {
      reset();
      const response = await patch({ firstName: null, lastName: null, phone: null });
      assert.equal(response.status, 200);
      const { user } = await response.json();
      assert.equal(user.firstName, null);
      assert.equal(user.lastName, null);
      assert.equal(user.phone, null);
      assert.equal(record.email, original.email);
      assert.equal(user.avatarUrl, original.avatar_url);
      await checkInvalid({ email: null });
    });
    await t.test("nullable profile fields remain explicit null in the public response", async () => {
      reset();
      record.first_name = null;
      record.last_name = null;
      record.phone = null;
      record.avatar_url = null;
      const response = await patch({ email: original.email });
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).user, expectedUser());
    });
    await t.test("empty, absent, non-object and malformed JSON bodies are rejected", async () => {
      reset();
      for (const body of [{}, undefined, null, [], "text", 1]) await checkInvalid(body);
      const response = await request("/api/profile/me", { method: "PATCH", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: "{" });
      assert.equal(response.status, 400);
      assert.equal(updates.length, 0);
    });
    await t.test("unknown, privileged, ID and prototype keys are rejected without writes", async () => {
      reset();
      for (const key of ["id", "userId", "username", "role", "password", "password_hash", "is_active", "updated_at", "created_at", "avatarUrl", "avatar_url", "first_name", "constructor", "toString", "__proto__"]) {
        await checkInvalid(Object.fromEntries([["firstName", "Example"], [key, "forbidden"]]));
      }
    });
    await t.test("wrong types, empty strings and control characters are rejected", async () => {
      reset();
      for (const field of ["firstName", "lastName", "phone", "email"]) {
        for (const value of [true, false, 42, {}, [], "", "   ", "ab\u0000cd", "ab\ncd", "ab\tcd"]) await checkInvalid({ [field]: value });
      }
    });
    await t.test("name length boundaries and Unicode names follow varchar character limits", async () => {
      reset();
      for (const field of ["firstName", "lastName"]) {
        assert.equal((await patch({ [field]: "ก".repeat(100) })).status, 200);
        await checkInvalid({ [field]: "ก".repeat(101) });
        assert.equal((await patch({ [field]: "𐐀".repeat(100) })).status, 200);
        await checkInvalid({ [field]: "𐐀".repeat(101) });
      }
    });
    await t.test("email format and 255-character limit are validated", async () => {
      reset();
      for (const value of ["no-at", "a@@b.com", "a b@example.com", "a@example", "@example.com", "a@.com"]) await checkInvalid({ email: value });
      assert.equal((await patch({ email: "x".repeat(243) + "@example.com" })).status, 200);
      await checkInvalid({ email: "x".repeat(244) + "@example.com" });
    });
    await t.test("unchanged email can be updated without a conflicting pre-check", async () => {
      reset();
      assert.equal((await patch({ email: original.email })).status, 200);
      assert.equal(record.email, original.email);
    });
    await t.test("phone accepts common formatting and rejects punctuation-only/invalid lengths", async () => {
      reset();
      for (const phone of ["0812345678", "+66812345678", "081-234-5678", "(081) 234 5678", "1234567", "123456789012345"]) {
        assert.equal((await patch({ phone })).status, 200);
      }
      for (const phone of ["-------", "+++++++", "123456", "1234567890123456", "081abc5678", "081+2345678", "1" + " ".repeat(14) + "234567"]) {
        await checkInvalid({ phone });
      }
    });
    await t.test("Prisma P2002 maps duplicate email to safe 409", async () => {
      reset();
      updateError = new Prisma.PrismaClientKnownRequestError("private database detail", { code: "P2002", clientVersion: Prisma.prismaVersion.client, meta: { target: ["email"] } });
      const response = await patch({ email: "taken@example.invalid" });
      assert.equal(response.status, 409);
      const body = await response.json();
      assert.deepEqual(body, { success: false, message: "Email already in use" });
      checkSafe(body);
      assert.equal(record.email, original.email);
    });
    await t.test("unexpected update errors reach the existing global 500 handler", async () => {
      reset(); updateError = new Error("private database detail");
      const response = await patch({ firstName: "Example" });
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { success: false, message: "Internal server error" });
    });
    await t.test("authentication lookup errors remain safe 500 rather than unauthorized", async () => {
      reset(); lookupError = new Error("private lookup detail");
      const response = await patch({ firstName: "Example" });
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { success: false, message: "Internal server error" });
      assert.equal(updates.length, 0);
    });
    await t.test("CORS preflight allows PATCH with credentials for configured frontend", async () => {
      reset();
      const response = await request("/api/profile/me", { method: "OPTIONS", headers: { Origin: config.frontendUrl, "Access-Control-Request-Method": "PATCH", "Access-Control-Request-Headers": "content-type" } });
      assert.equal(response.status, 204);
      assert.equal(response.headers.get("access-control-allow-origin"), config.frontendUrl);
      assert.equal(response.headers.get("access-control-allow-credentials"), "true");
      assert.ok(response.headers.get("access-control-allow-methods").includes("PATCH"));
    });
    await t.test("health, login/logout and camelCase me response work", async () => {
      reset();
      record.first_name = "Somchai";
      record.avatar_url = `/uploads/avatars/${randomUUID()}.webp`;
      assert.equal((await request("/api/health")).status, 200);
      const login = (body) => request("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const success = await login({ username: original.username, password });
      assert.equal(success.status, 200);
      const loggedIn = await success.json();
      assert.deepEqual(loggedIn.user, expectedUser());
      checkSafe(loggedIn);
      const setCookie = success.headers.get("set-cookie") || "";
      assert.ok(setCookie.includes("HttpOnly") && setCookie.includes("Max-Age=3600"), "Expected original login cookie attributes");
      assert.equal((await login({ username: original.username, password: randomUUID() })).status, 401);
      assert.equal((await login({ username: "missing_user", password })).status, 401);
      const me = await request("/api/auth/me", { headers: { Cookie: cookie } });
      assert.equal(me.status, 200);
      const meBody = await me.json();
      assert.deepEqual(meBody.user, expectedUser());
      assert.deepEqual(meBody.user, loggedIn.user, "Login and me must expose identical public profile fields");
      checkSafe(meBody);
      const out = await request("/api/auth/logout", { method: "POST" });
      assert.equal(out.status, 200);
      assert.deepEqual(await out.json(), { success: true, message: "Logout successful" });
      assert.ok((out.headers.get("set-cookie") || "").includes("Expires=Thu, 01 Jan 1970"));
      assert.equal((await request("/api/auth/me")).status, 401);
    });
    await t.test("login returns explicit nulls when optional profile fields are absent", async () => {
      reset();
      for (const key of ["first_name", "last_name", "phone", "avatar_url"]) record[key] = null;
      const response = await request("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: original.username, password }),
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.user, expectedUser());
      checkSafe(body);
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    prisma.users.findUnique = originalFindUnique;
    prisma.users.update = originalUpdate;
    prisma.$transaction = originalTransaction;
    await prisma.$disconnect();
  }
});
