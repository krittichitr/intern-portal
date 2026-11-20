import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
const testUrl = process.env.RBAC_TEST_DATABASE_URL;
let app, prisma, config;
if (testUrl) {
  const target = new URL(testUrl);
  assert.ok(["postgres:", "postgresql:"].includes(target.protocol));
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname));
  const database = decodeURIComponent(target.pathname.slice(1));
  assert.match(database, /^login_rbac_test_[a-z0-9_]+$/);
  assert.equal(target.searchParams.get("schema") || "public", "public");
  if (process.env.DATABASE_URL) assert.notEqual(database, decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1)));
  process.env.DATABASE_URL = testUrl;
  process.env.JWT_SECRET = randomBytes(48).toString("hex");
  process.env.NODE_ENV = "test";
  ({ app } = await import("../src/server.js"));
  ({ prisma } = await import("../src/lib/prisma.js"));
  ({ config } = await import("../src/config.js"));
}

// Explicit disposable database only; no application DB fallback before imports.
test("Authentication over HTTP with real PostgreSQL", { skip: !testUrl }, async (t) => {
  const originalUsers = await prisma.users.findMany({ orderBy: { id: "asc" } });
  const fixtureId = randomUUID();
  const inactiveId = randomUUID();
  const username = `test_${fixtureId.replaceAll("-", "")}`;
  const password = `${randomUUID()}!`;
  const publicUser = {
    id: fixtureId, username, email: `${username}@example.invalid`, role: "USER",
    firstName: null, lastName: null, phone: null, avatarUrl: null,
  };
  let server;
  const createdIds = [];
  let createdRoleId;
  try {
    let role = await prisma.roles.findUnique({ where: { code: "USER" } });
    if (!role) {
      role = await prisma.roles.create({ data: { code: "USER", name: "User" } });
      createdRoleId = role.id;
    }
    const hash = await bcrypt.hash(password, 12);
    for (const [id, active, name] of [[fixtureId, true, username], [inactiveId, false, `off_${inactiveId}`]]) {
      await prisma.users.create({ data: {
        id, username: name, email: `${name}@example.invalid`, password_hash: hash,
        role: "USER", role_id: role.id, is_active: active, updated_at: new Date(),
      } });
      createdIds.push(id);
    }
    server = await new Promise((resolve, reject) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
      s.once("error", reject);
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = (path, options = {}) => fetch(base + path, options);
    const login = (body) => request("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    let cookie;
    const checkPublic = (data) => {
      assert.deepEqual(data.user, publicUser);
      assert.ok(!JSON.stringify(data).includes(hash), "response must not contain hash");
      assert.ok(!JSON.stringify(data).includes(password), "response must not contain password");
      assert.ok(!JSON.stringify(data).includes(config.jwtSecret), "response must not contain secret");
      assert.ok(!("token" in data) && !("jwt" in data), "response must not contain token");
    };
    await t.test("health returns 200", async () => {
      const res = await request("/api/health");
      assert.equal(res.status, 200);
      assert.equal((await res.json()).success, true);
    });
    await t.test("Prisma reads users and bcrypt hash uses cost 12", async () => {
      assert.equal(await prisma.users.count({ where: { id: fixtureId } }), 1);
      assert.equal(bcrypt.getRounds(hash), 12);
    });
    await t.test("login returns safe user and HttpOnly cookie expiring in one hour", async () => {
      const res = await login({ username, password });
      assert.equal(res.status, 200);
      checkPublic(await res.json());
      const setCookie = res.headers.get("set-cookie") || "";
      assert.ok(setCookie.startsWith("auth_token="), "auth cookie must be set");
      for (const attribute of ["HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=3600"]) {
        assert.ok(setCookie.includes(attribute), `cookie requires ${attribute}`);
      }
      assert.equal(setCookie.includes("; Secure"), process.env.NODE_ENV === "production");
      cookie = setCookie.split(";")[0];
      const claims = jwt.verify(decodeURIComponent(cookie.slice("auth_token=".length)), config.jwtSecret);
      assert.equal(claims.sub, fixtureId);
      assert.equal(claims.exp - claims.iat, 3600);
      assert.equal(res.headers.get("cache-control"), "no-store");
    });
    await t.test("wrong password and unknown username return identical 401", async () => {
      const wrong = await login({ username, password: "wrong-password" });
      const missing = await login({ username: `missing_${fixtureId}`, password });
      assert.equal(wrong.status, 401);
      assert.equal(missing.status, 401);
      assert.deepEqual(await wrong.json(), await missing.json());
    });
    await t.test("inactive account cannot login", async () => {
      assert.equal((await login({ username: `off_${inactiveId}`, password })).status, 401);
    });
    await t.test("missing, empty, non-string and oversized fields return 400", async () => {
      for (const body of [{}, null, [], { username: 1, password }, { username, password: [] },
        { username: " ", password }, { username, password: " " },
        { username: "x".repeat(51), password }, { username, password: "x".repeat(73) },
        { username, password: "ก".repeat(25) }]) {
        assert.equal((await login(body)).status, 400);
      }
    });
    await t.test("invalid JSON returns safe 400", async () => {
      const res = await request("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
      assert.equal(res.status, 400);
      assert.deepEqual(await res.json(), { success: false, message: "Invalid JSON body" });
    });
    await t.test("excessive JSON body returns safe 413", async () => {
      const res = await login({ username, password: "x".repeat(17000) });
      assert.equal(res.status, 413);
      assert.deepEqual(await res.json(), { success: false, message: "Request body too large" });
    });
    await t.test("me returns safe user with valid cookie", async () => {
      const res = await request("/api/auth/me", { headers: { Cookie: cookie } });
      assert.equal(res.status, 200);
      checkPublic(await res.json());
    });
    await t.test("me without cookie returns 401", async () => {
      const res = await request("/api/auth/me");
      assert.equal(res.status, 401);
      assert.deepEqual(await res.json(), { success: false, message: "Unauthorized" });
    });
    await t.test("me rejects forged, expired, wrong-algorithm and invalid-subject tokens", async () => {
      const tokens = ["invalid", jwt.sign({}, randomUUID(), { subject: fixtureId, expiresIn: "1h" }),
        jwt.sign({}, config.jwtSecret, { subject: fixtureId, expiresIn: -1 }),
        jwt.sign({}, config.jwtSecret, { subject: fixtureId, expiresIn: "1h", algorithm: "HS384" }),
        jwt.sign({}, config.jwtSecret, { subject: "invalid-uuid", expiresIn: "1h" }),
        jwt.sign({}, config.jwtSecret, { subject: fixtureId })];
      for (const token of tokens) {
        const res = await request("/api/auth/me", { headers: { Cookie: `auth_token=${token}` } });
        assert.equal(res.status, 401);
      }
    });
    await t.test("me rejects inactive and nonexistent users with signed tokens", async () => {
      for (const sub of [inactiveId, randomUUID()]) {
        const token = jwt.sign({}, config.jwtSecret, { subject: sub, expiresIn: "1h" });
        assert.equal((await request("/api/auth/me", { headers: { Cookie: `auth_token=${token}` } })).status, 401);
      }
    });
    await t.test("CORS allows configured frontend with credentials", async () => {
      const res = await request("/api/auth/login", { method: "OPTIONS", headers: {
        Origin: config.frontendUrl, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type",
      } });
      assert.equal(res.status, 204);
      assert.equal(res.headers.get("access-control-allow-origin"), config.frontendUrl);
      assert.equal(res.headers.get("access-control-allow-credentials"), "true");
    });
    await t.test("logout expires cookie and cleared cookie jar gets 401 from me", async () => {
      // curl maintains the jar, including expiry processing; JWTs are never printed.
      const { promisify } = await import("node:util");
      const { execFile } = await import("node:child_process");
      const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const run = promisify(execFile);
      const dir = await mkdtemp(join(tmpdir(), "auth-cookie-test-"));
      const jar = join(dir, "cookies.txt");
      try {
        const bodyFile = join(dir, "request.json");
        await writeFile(bodyFile, JSON.stringify({ username, password }), { mode: 0o600 });
        const common = ["-sS", "-c", jar, "-b", jar];
        const loggedIn = await run("curl", [...common, "-H", "Content-Type: application/json", "--data-binary", `@${bodyFile}`, `${base}/api/auth/login`]);
        checkPublic(JSON.parse(loggedIn.stdout));
        const before = await run("curl", [...common, "-o", "/dev/null", "-w", "%{http_code}", `${base}/api/auth/me`]);
        assert.equal(before.stdout, "200");
        const out = await run("curl", [...common, "-X", "POST", `${base}/api/auth/logout`]);
        assert.deepEqual(JSON.parse(out.stdout), { success: true, message: "Logout successful" });
        const after = await run("curl", [...common, "-o", "/dev/null", "-w", "%{http_code}", `${base}/api/auth/me`]);
        assert.equal(after.stdout, "401");
      } finally { await rm(dir, { recursive: true, force: true }); }
    });
    await t.test("logout clears matching cookie attributes, even without valid authentication", async () => {
      for (const headers of [{}, { Cookie: "auth_token=invalid" }, { Cookie: cookie }]) {
        const res = await request("/api/auth/logout", { method: "POST", headers });
        assert.equal(res.status, 200);
        const header = res.headers.get("set-cookie") || "";
        for (const attribute of ["auth_token=;", "HttpOnly", "Path=/", "SameSite=Lax", "Expires=Thu, 01 Jan 1970"]) {
          assert.ok(header.includes(attribute), `clearing cookie requires ${attribute}`);
        }
      }
    });
    await t.test("temporary database endpoint is removed", async () => {
      assert.equal((await request("/api/test-db")).status, 404);
    });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    try {
      if (createdIds.length) await prisma.users.deleteMany({ where: { id: { in: createdIds } } });
      if (createdRoleId) await prisma.roles.delete({ where: { id: createdRoleId } });
      const remainingUsers = await prisma.users.findMany({ orderBy: { id: "asc" } });
      assert.ok(JSON.stringify(remainingUsers) === JSON.stringify(originalUsers), "Existing database users must remain unchanged");
    } finally { await prisma.$disconnect(); }
  }
});
