import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";

// Never connect to the application database or use its signing secret.
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/admin_mock_only?connect_timeout=1";
process.env.JWT_SECRET = randomBytes(48).toString("hex");
process.env.NODE_ENV = "test";
const { requireAuth } = await import("../src/middleware/auth.middleware.js");
const { requireAdmin } = await import("../src/middleware/authorization.middleware.js");
const { prisma } = await import("../src/lib/prisma.js");
const { config, publicUserSelect } = await import("../src/config.js");

test("Admin authorization over HTTP with real JWT middleware and mocked Prisma", async (t) => {
  const id = randomUUID();
  const roleId = randomUUID();
  let record, lookupError, queries = 0, handled = 0;
  const reset = (code = "ADMIN") => {
    record = { id, username: "admin_guard_fixture", email: "guard@example.invalid",
      role: "USER", role_record: { id: roleId, code }, is_active: true,
      first_name: null, last_name: null, phone: null, avatar_url: null };
    lookupError = null; queries = 0; handled = 0;
  };
  reset();
  const originalFindUnique = prisma.users.findUnique;
  prisma.users.findUnique = async ({ where, select }) => {
    queries += 1;
    assert.deepEqual(where, { id });
    assert.deepEqual(select, { ...publicUserSelect, is_active: true });
    if (lookupError) throw lookupError;
    return record ? structuredClone(record) : null;
  };
  // Probe exists only in this test app. No production endpoint is added.
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  const handler = (req, res) => { handled += 1; res.json({ success: true }); };
  app.all("/admin-probe", requireAuth, requireAdmin, handler);
  app.get("/missing-auth-order-probe", requireAdmin, handler);
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    res.status(500).json({ success: false, message: "Internal server error" });
  });
  let server;
  const signed = (claims = {}, options = {}) => jwt.sign(claims, config.jwtSecret,
    { subject: id, expiresIn: "1h", algorithm: "HS256", ...options });
  const token = signed();
  try {
    server = await new Promise((resolve, reject) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
      instance.once("error", reject);
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = (value = token, extra = {}) => fetch(base + "/admin-probe", {
      signal: AbortSignal.timeout(10000), ...extra,
      headers: { ...(value ? { Cookie: `auth_token=${value}` } : {}), ...extra.headers },
    });
    const denied = async (response, status, body) => {
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), body || {
        success: false, message: status === 401 ? "Unauthorized" : "Forbidden",
      });
      assert.equal(handled, 0, "Denied request must never reach the resource handler");
    };

    for (const [label, value] of [["missing", null], ["malformed", "invalid"],
      ["expired", signed({}, { expiresIn: -1 })],
      ["wrong signature", jwt.sign({}, randomBytes(48).toString("hex"), { subject: id, expiresIn: "1h" })]]) {
      await t.test(`${label} JWT returns 401 before querying the user`, async () => {
        reset(); await denied(await request(value), 401); assert.equal(queries, 0);
      });
    }
    for (const code of ["USER", "MANAGER", "AUDITOR", "admin"]) {
      await t.test(`${code} relation returns 403 despite a legacy ADMIN role`, async () => {
        reset(code); record.role = "ADMIN";
        await denied(await request(), 403); assert.equal(queries, 1);
      });
    }
    await t.test("ADMIN relation passes even when the legacy string is USER", async () => {
      reset(); const response = await request();
      assert.equal(response.status, 200); assert.deepEqual(await response.json(), { success: true });
      assert.equal(handled, 1); assert.equal(queries, 1, "Admin guard must not duplicate the auth query");
    });
    await t.test("request body, headers, query and JWT ADMIN claims cannot elevate a USER", async () => {
      reset("USER");
      await denied(await request(signed({ role: "ADMIN", isAdmin: true }), {
        method: "POST", headers: { "Content-Type": "application/json", "X-Role": "ADMIN", "X-Is-Admin": "true" },
        body: JSON.stringify({ role: "ADMIN", isAdmin: true, role_record: { id: roleId, code: "ADMIN" } }),
      }), 403);
      await denied(await fetch(base + "/admin-probe?role=ADMIN&isAdmin=true", {
        headers: { Cookie: `auth_token=${token}` }, signal: AbortSignal.timeout(10000),
      }), 403);
    });
    await t.test("same JWT is denied after demotion and accepted after promotion", async () => {
      reset(); assert.equal((await request()).status, 200); assert.equal(handled, 1);
      record.role_record.code = "MANAGER"; handled = 0;
      await denied(await request(), 403);
      record.role_record.code = "ADMIN";
      assert.equal((await request()).status, 200); assert.equal(handled, 1); assert.equal(queries, 3);
    });
    for (const state of ["missing", "inactive"]) {
      await t.test(`${state} user returns 401 even with a valid JWT`, async () => {
        reset(); if (state === "missing") record = null; else record.is_active = false;
        await denied(await request(), 401);
      });
    }
    await t.test("missing role mapping preserves RBAC_NOT_READY before reaching the admin guard", async () => {
      reset(); record.role = "ADMIN"; record.role_record = null;
      await denied(await request(), 403, { success: false, code: "RBAC_NOT_READY",
        message: "Your account role is not configured. Contact an administrator." });
    });
    await t.test("database lookup failure never grants access", async () => {
      reset(); lookupError = new Error("Synthetic database unavailable");
      await denied(await request(), 500, { success: false, message: "Internal server error" });
    });
    await t.test("guard without requireAuth fails closed instead of allowing the handler", async () => {
      reset(); await denied(await fetch(base + "/missing-auth-order-probe", {
        signal: AbortSignal.timeout(10000),
      }), 401); assert.equal(queries, 0);
    });
    await t.test("guard never falls back to req.user.role when the relation is absent", () => {
      let status, body, called = false;
      const res = { status(value) { status = value; return this; }, json(value) { body = value; return this; } };
      requireAdmin({ user: { role: "ADMIN" } }, res, () => { called = true; });
      assert.equal(status, 403); assert.equal(body.code, "RBAC_NOT_READY"); assert.equal(called, false);
    });
  } finally {
    prisma.users.findUnique = originalFindUnique;
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await prisma.$disconnect();
  }
});
