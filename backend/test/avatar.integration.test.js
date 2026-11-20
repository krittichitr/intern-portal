import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import jwt from "jsonwebtoken";

// Fail closed: never allow this test process to connect to auth_db.
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/avatar_mock_only?connect_timeout=1";
process.env.JWT_SECRET = randomBytes(48).toString("hex");
process.env.NODE_ENV = "test";
const { app } = await import("../src/server.js");
const { prisma } = await import("../src/lib/prisma.js");
const { config, publicUserSelect } = await import("../src/config.js");
const { avatarStorage, avatarFilenameFromUrl, avatarUrlPrefix, createAvatarStorage } = await import("../src/lib/avatar-storage.js");
const { maxAvatarBytes } = await import("../src/middleware/upload.middleware.js");

test("Avatar HTTP API: real image processing/files, mocked Prisma, isolated temp directory", async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "login-avatar-test-"));
  const avatarDirectory = join(temporary, "avatars");
  const productionStorage = { ...avatarStorage };
  const isolatedStorage = createAvatarStorage(avatarDirectory);
  Object.assign(avatarStorage, isolatedStorage);
  const id = randomUUID();
  const initial = {
    id, username: "avatar_test_user", email: "avatar@example.invalid", role: "USER",
    role_record: { id: randomUUID(), code: "USER" },
    first_name: "Example", last_name: null, phone: null, avatar_url: null,
    is_active: true, password_hash: "synthetic-field-not-to-be-exposed",
  };
  let record = { ...initial };
  let updates = [];
  let updateError;
  let updateHook;
  let lookups = 0;
  let missing = false;
  const originalFindUnique = prisma.users.findUnique;
  const originalUpdate = prisma.users.update;
  const originalTransaction = prisma.$transaction;
  prisma.$transaction = async (action) => {
    const before = { ...record };
    try { return await action({ users: prisma.users, $executeRaw: async () => 0,
      menus: { findMany: async () => [{ id: 'profile-menu', menu_name: 'Profile', menu_path: '/profile', menu_icon: 'UserRound', parent_id: null, sort_order: 20, is_active: true }] },
      role_menus: { findMany: async () => [{ menu_id: 'profile-menu' }] } }); } catch (error) { record = before; throw error; }
  };
  const project = (user, select) => Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, user[key]]));
  prisma.users.findUnique = async ({ where, select }) => {
    lookups++;
    assert.deepEqual(where, { id });
    return missing ? null : project(record, select);
  };
  prisma.users.update = async (args) => {
    updates.push(args);
    assert.deepEqual(args.where, { id });
    assert.deepEqual(args.select, publicUserSelect);
    if (updateHook) await updateHook(args);
    if (updateError) throw updateError;
    record = { ...record, ...args.data };
    return project(record, args.select);
  };
  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    instance.once("error", reject);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = jwt.sign({}, config.jwtSecret, { subject: id, expiresIn: "1h" });
  const cookie = `auth_token=${token}`;
  const request = (path, options = {}) => fetch(base + path, { signal: AbortSignal.timeout(10000), ...options });
  const png = await sharp({ create: { width: 32, height: 24, channels: 4, background: "#1d64d8" } }).png().toBuffer();
  const jpeg = await sharp(png).jpeg().toBuffer();
  const webp = await sharp(png).webp().toBuffer();
  const upload = (buffer, options = {}) => {
    const body = new FormData();
    if (buffer !== undefined) body.append(options.field || "avatar", new Blob([buffer], { type: options.mime || "image/png" }), options.filename || "original.png");
    if (options.second) body.append("avatar", new Blob([png], { type: "image/png" }), "second.png");
    if (options.extra) body.append("id", randomUUID());
    return request("/api/profile/me/avatar", {
      method: "POST", headers: { ...(options.cookie === null ? {} : { Cookie: options.cookie || cookie }) }, body,
    });
  };
  const reset = async () => {
    Object.assign(avatarStorage, isolatedStorage);
    record = { ...initial }; updates = []; updateError = undefined; updateHook = undefined; lookups = 0; missing = false;
    // This directory belongs only to this test's mkdtemp, never production uploads.
    await rm(avatarDirectory, { recursive: true, force: true });
  };
  const files = async () => {
    try { return await readdir(avatarDirectory); } catch (error) { if (error.code === "ENOENT") return []; throw error; }
  };
  const oldAvatar = async () => {
    const filename = `${randomUUID()}.webp`;
    await mkdir(avatarDirectory, { recursive: true });
    await writeFile(join(avatarDirectory, filename), webp);
    record.avatar_url = avatarUrlPrefix + filename;
    return filename;
  };
  const safeBody = (body) => {
    const encoded = JSON.stringify(body);
    for (const value of [initial.password_hash, token, config.jwtSecret, temporary]) assert.ok(!encoded.includes(value), "Response must not expose internal data");
    assert.ok(!("password_hash" in (body.user || {})));
    assert.ok(!("is_active" in (body.user || {})));
  };
  const invalid = async (buffer, options, expected = 400) => {
    const response = await upload(buffer, options);
    assert.equal(response.status, expected);
    const body = await response.json();
    assert.equal(body.success, false); safeBody(body);
    assert.equal(updates.length, 0);
    assert.deepEqual(await files(), []);
  };
  try {
    await t.test("JWT verification happens before parsing invalid multipart", async () => {
      await reset();
      const response = await request("/api/profile/me/avatar", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=broken" }, body: "not a multipart body" });
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { success: false, message: "Unauthorized" });
      assert.equal(lookups, 0); assert.deepEqual(await files(), []);
    });
    await t.test("invalid/expired cookies and inactive users cannot upload", async () => {
      await reset();
      for (const authCookie of ["auth_token=invalid", `auth_token=${jwt.sign({}, config.jwtSecret, { subject: id, expiresIn: -1 })}`]) {
        await invalid(png, { cookie: authCookie }, 401);
      }
      record.is_active = false;
      await invalid(png, {}, 401);
      record.is_active = true; missing = true;
      await invalid(png, {}, 401);
    });
    await t.test("missing/empty/wrong-field/multiple files and extra ID field are 400", async () => {
      await reset();
      await invalid(undefined); await invalid(Buffer.alloc(0));
      await invalid(png, { field: "photo" });
      await invalid(png, { second: true });
      await invalid(png, { extra: true });
      const response = await request("/api/profile/me/avatar", { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: "{}" });
      assert.equal(response.status, 400);
    });
    await t.test("malformed multipart is a safe 400", async () => {
      await reset();
      const response = await request("/api/profile/me/avatar", { method: "POST", headers: { Cookie: cookie, "Content-Type": "multipart/form-data; boundary=broken" }, body: "broken body" });
      assert.equal(response.status, 400); safeBody(await response.json());
      assert.equal(updates.length, 0); assert.deepEqual(await files(), []);
    });
    await t.test("files above 2 MiB are 413; exact boundary is accepted", async () => {
      await reset();
      const large = Buffer.concat([png, Buffer.alloc(maxAvatarBytes + 1 - png.length)]);
      await invalid(large, {}, 413);
      const exact = Buffer.concat([png, Buffer.alloc(maxAvatarBytes - png.length)]);
      assert.equal((await upload(exact)).status, 200);
    });
    await t.test("fake MIME/signatures, SVG, GIF and corrupt pixels are rejected", async () => {
      await reset();
      const gif = await sharp(png).gif().toBuffer();
      for (const buffer of [Buffer.from("fake image"), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>'), gif, png.subarray(0, 33), jpeg.subarray(0, 30), Buffer.from("RIFF0000WEBPjunk")]) {
        await invalid(buffer, { mime: "image/png", filename: "looks-valid.png" });
      }
    });
    await t.test("JPEG/PNG/WebP become WebP with UUID names; MIME and original paths are ignored", async () => {
      await reset();
      for (const buffer of [jpeg, png, webp]) {
        const before = new Date();
        const response = await upload(buffer, { mime: "application/octet-stream", filename: "../../do-not-use.svg" });
        assert.equal(response.status, 200);
        const body = await response.json(); safeBody(body);
        assert.equal(body.message, "Profile image updated successfully");
        assert.deepEqual(Object.keys(body.user).sort(), ["id", "username", "email", "role", "firstName", "lastName", "phone", "avatarUrl"].sort());
        const filename = avatarFilenameFromUrl(body.user.avatarUrl);
        assert.ok(filename, "Expected a generated UUID WebP URL");
        const metadata = await sharp(await readFile(join(avatarDirectory, filename))).metadata();
        assert.equal(metadata.format, "webp");
        assert.equal(metadata.width, 32); assert.equal(metadata.height, 24);
        assert.equal(body.user.id, id);
        assert.deepEqual(Object.keys(updates.at(-1).data).sort(), ["avatar_url", "updated_at"]);
        assert.ok(record.updated_at >= before);
      }
      assert.equal((await files()).length, 1);
    });
    await t.test("large input is resized to at most 512 and EXIF orientation/metadata are normalized", async () => {
      await reset();
      const source = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "red" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
      const response = await upload(source, { mime: "image/jpeg" });
      assert.equal(response.status, 200);
      const body = await response.json();
      const metadata = await sharp(await readFile(join(avatarDirectory, avatarFilenameFromUrl(body.user.avatarUrl)))).metadata();
      assert.equal(metadata.format, "webp");
      assert.ok(metadata.width <= 512 && metadata.height <= 512);
      assert.ok(metadata.height > metadata.width);
      assert.equal(metadata.orientation, undefined);
      assert.equal(metadata.exif, undefined);
    });
    await t.test("input dimensions over 4096 and animated WebP are rejected", async () => {
      await reset();
      for (const [width, height] of [[4097, 1], [1, 4097]]) {
        const source = await sharp({ create: { width, height, channels: 3, background: "blue" } }).png().toBuffer();
        await invalid(source);
      }
      // Distinct frames are required: libwebp collapses identical frames to a still image.
      const frames = Buffer.concat([Buffer.alloc(8 * 8 * 3, 0), Buffer.alloc(8 * 8 * 3, 255)]);
      const animated = await sharp(frames, { raw: { width: 8, height: 16, channels: 3, pageHeight: 8 } })
        .webp({ loop: 0, delay: [100, 100] }).toBuffer();
      assert.equal((await sharp(animated).metadata()).pages, 2);
      await invalid(animated, { mime: "image/webp" });
    });
    await t.test("database failure removes the new file and keeps the old image", async () => {
      await reset(); const old = await oldAvatar();
      updateError = new Error("private DB detail");
      updateHook = async () => assert.equal((await files()).length, 2, "New file must exist before the DB update");
      const response = await upload(png);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { success: false, message: "Internal server error" });
      assert.deepEqual(await files(), [old]);
      assert.equal(record.avatar_url, avatarUrlPrefix + old);
    });
    await t.test("old image is only deleted after a successful DB update", async () => {
      await reset(); const old = await oldAvatar();
      updateHook = async () => assert.ok((await stat(join(avatarDirectory, old))).isFile());
      const response = await upload(png);
      assert.equal(response.status, 200);
      assert.ok(!(await files()).includes(old));
      assert.equal((await files()).length, 1);
    });
    await t.test("filesystem write failure is a safe 500 and never updates DB", async () => {
      await reset(); const old = await oldAvatar();
      avatarStorage.write = async () => { throw new Error("private filesystem path"); };
      const response = await upload(png);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { success: false, message: "Internal server error" });
      assert.equal(updates.length, 0); assert.deepEqual(await files(), [old]);
    });
    await t.test("old cleanup failure keeps committed new avatar and returns success", async () => {
      await reset(); const old = await oldAvatar();
      const oldUrl = record.avatar_url;
      avatarStorage.remove = async (url) => { if (url === oldUrl) throw new Error("private cleanup path"); return isolatedStorage.remove(url); };
      const response = await upload(png);
      assert.equal(response.status, 200);
      const body = await response.json(); safeBody(body);
      assert.equal(body.user.avatarUrl, record.avatar_url);
      assert.ok((await files()).includes(old));
      assert.ok((await files()).includes(avatarFilenameFromUrl(record.avatar_url)));
    });
    await t.test("external/legacy/traversal URLs never delete outside avatar storage", async () => {
      const outside = join(temporary, `${randomUUID()}.webp`);
      await writeFile(outside, "outside canary");
      for (const oldUrl of ["https://example.invalid/picture.webp", "/avatars/legacy.png", `${avatarUrlPrefix}../${outside.split('/').at(-1)}`, `${avatarUrlPrefix}${randomUUID()}.webp?query=1`, `${avatarUrlPrefix}%2e%2e/keep.webp`]) {
        await reset(); record.avatar_url = oldUrl;
        const response = await upload(png);
        assert.equal(response.status, 200);
        assert.equal(await readFile(outside, "utf8"), "outside canary");
      }
    });
    await t.test("static images have WebP/CORS/nosniff headers and unknown paths are 404", async () => {
      await reset();
      const body = await (await upload(png)).json();
      const response = await request(body.user.avatarUrl, { headers: { Origin: config.frontendUrl } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "image/webp");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(response.headers.get("cross-origin-resource-policy"), "cross-origin");
      assert.equal(response.headers.get("access-control-allow-origin"), config.frontendUrl);
      assert.ok(response.headers.get("cache-control").includes("immutable"));
      assert.equal((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).format, "webp");
      const head = await request(body.user.avatarUrl, { method: "HEAD" });
      assert.equal(head.status, 200); assert.equal((await head.arrayBuffer()).byteLength, 0);
      for (const path of ["/uploads/avatars/", "/uploads/avatars/secret.txt", "/uploads/avatars/%2e%2e%2f.env", "/uploads/avatars/%252e%252e%252f.env", "/uploads/.env", `${avatarUrlPrefix}${randomUUID()}.webp`]) {
        assert.equal((await request(path)).status, 404);
      }
    });
    await t.test("symlinks cannot serve outside files or overwrite existing targets", async () => {
      await reset(); await mkdir(avatarDirectory);
      const outside = join(temporary, "outside-private.txt");
      await writeFile(outside, "do not expose");
      const filename = `${randomUUID()}.webp`;
      await symlink(outside, join(avatarDirectory, filename));
      assert.equal((await request(avatarUrlPrefix + filename)).status, 404);
      await assert.rejects(isolatedStorage.write(filename, webp), { code: "EEXIST" });
      record.avatar_url = avatarUrlPrefix + filename;
      assert.equal((await upload(png)).status, 200);
      assert.equal(await readFile(outside, "utf8"), "do not expose");
    });
    await t.test("storage refuses symlink directories and unrecognized deletion paths", async () => {
      const outsideDirectory = join(temporary, "outside-directory");
      await mkdir(outsideDirectory);
      const linkedDirectory = join(temporary, "linked-avatars");
      await symlink(outsideDirectory, linkedDirectory);
      const linked = createAvatarStorage(linkedDirectory);
      await assert.rejects(linked.write(`${randomUUID()}.webp`, webp));
      assert.deepEqual(await readdir(outsideDirectory), []);
      assert.equal(await isolatedStorage.remove("/uploads/avatars/../../outside-private.txt"), false);
    });
    await t.test("same-user concurrent replacements leave one current file in this process", async () => {
      await reset();
      let active = 0; let maximumActive = 0;
      updateHook = async () => {
        active++; maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setImmediate(resolve));
        active--;
      };
      const responses = await Promise.all([upload(png), upload(jpeg)]);
      assert.deepEqual(responses.map((response) => response.status), [200, 200]);
      assert.equal(maximumActive, 1);
      assert.deepEqual(await files(), [avatarFilenameFromUrl(record.avatar_url)]);
    });
    await t.test("GET me returns current avatar; PATCH profile preserves it and public contract", async () => {
      await reset();
      const uploaded = await (await upload(png)).json();
      const me = await request("/api/auth/me", { headers: { Cookie: cookie } });
      assert.equal(me.status, 200);
      const meBody = await me.json();
      assert.deepEqual(meBody.user, uploaded.user); safeBody(meBody);
      const patched = await request("/api/profile/me", { method: "PATCH", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ firstName: "Changed" }) });
      assert.equal(patched.status, 200);
      const patchedBody = await patched.json();
      assert.equal(patchedBody.user.firstName, "Changed");
      assert.equal(patchedBody.user.avatarUrl, uploaded.user.avatarUrl); safeBody(patchedBody);
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    prisma.users.findUnique = originalFindUnique; prisma.users.update = originalUpdate;
    prisma.$transaction = originalTransaction;
    Object.assign(avatarStorage, productionStorage);
    await prisma.$disconnect();
    await rm(temporary, { recursive: true, force: true });
  }
});
