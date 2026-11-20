import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';

const testUrl = process.env.RBAC_TEST_DATABASE_URL;
test('Authentication uses current role relations and preserves the public profile contract', { skip: !testUrl }, async (t) => {
  const target = new URL(testUrl);
  assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname));
  const database = decodeURIComponent(target.pathname.slice(1));
  assert.match(database, /^login_rbac_test_[a-z0-9_]+$/);
  assert.equal(target.searchParams.get('schema') || 'public', 'public');
  if (process.env.DATABASE_URL) assert.notEqual(database, decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1)));
  // No application imports/connections before validating the explicit test target.
  process.env.DATABASE_URL = testUrl;
  process.env.JWT_SECRET = randomBytes(48).toString('hex');
  process.env.NODE_ENV = 'test';
  const { app } = await import('../src/server.js');
  const { prisma } = await import('../src/lib/prisma.js');
  const { config } = await import('../src/config.js');
  const { avatarStorage, createAvatarStorage } = await import('../src/lib/avatar-storage.js');
  const directory = await mkdtemp(join(tmpdir(), 'login-role-auth-'));
  const productionStorage = { ...avatarStorage };
  Object.assign(avatarStorage, createAvatarStorage(directory));
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  const createdRoles = [];
  const profileMenuId = randomUUID();
  const roles = new Map();
  const password = randomBytes(24).toString('base64url');
  const hash = await bcrypt.hash(password, 12);
  let server, cookie, started = false;
  const readyError = { success: false, code: 'RBAC_NOT_READY', message: 'Your account role is not configured. Contact an administrator.' };
  try {
    assert.equal(await prisma.users.count(), 0, 'Disposable database must start empty');
    assert.equal(await prisma.roles.count(), 0);
    started = true;
    for (const code of ['ADMIN', 'MANAGER', 'USER', 'AUDITOR']) {
      const role = await prisma.roles.create({ data: { code, name: code } });
      createdRoles.push(role.id); roles.set(code, role.id);
    }
    await prisma.menus.create({ data: { id: profileMenuId, menu_name: 'Profile', menu_path: '/profile' } });
    await prisma.role_menus.createMany({ data: createdRoles.map((role_id) => ({ role_id, menu_id: profileMenuId })) });
    await prisma.users.createMany({ data: ids.map((id, index) => ({
      id, username: ['role_auth_fixture', 'role_unmapped_fixture', 'role_inactive_fixture'][index],
      email: `role_auth_${index}@example.invalid`, password_hash: hash,
      // Intentionally stale legacy authority: relation must win.
      role: 'ADMIN', role_id: index === 0 ? roles.get('USER') : null,
      is_active: index !== 2, first_name: 'Role', last_name: 'Fixture', phone: '0000000000', updated_at: new Date(),
    })) });
    server = await new Promise((resolve, reject) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s)); s.once('error', reject);
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = (path, options = {}) => fetch(base + path, { signal: AbortSignal.timeout(15000), ...options });
    const login = (username = 'role_auth_fixture', value = password) => request('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: value }),
    });
    const me = () => request('/api/auth/me', { headers: { Cookie: cookie } });
    const patch = (body) => request('/api/profile/me', { method: 'PATCH',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#3366cc' } }).png().toBuffer();
    const upload = () => {
      const form = new FormData(); form.append('avatar', new Blob([png], { type: 'image/png' }), 'fixture.png');
      return request('/api/profile/me/avatar', { method: 'POST', headers: { Cookie: cookie }, body: form });
    };
    const publicContract = (body, code) => {
      assert.equal(body.success, true);
      assert.deepEqual(Object.keys(body.user).sort(), ['id', 'username', 'email', 'role', 'firstName', 'lastName', 'phone', 'avatarUrl'].sort());
      assert.equal(body.user.role, code);
      const encoded = JSON.stringify(body);
      assert.ok(![hash, password, config.jwtSecret, cookie].filter(Boolean).some((value) => encoded.includes(value)), 'Public response exposed private data');
    };
    const fingerprint = async () => (await prisma.$queryRaw`SELECT md5(to_jsonb(u)::text) AS value FROM users u WHERE id=${ids[0]}::uuid`)[0].value;

    await t.test('Login uses the relation despite a stale ADMIN string and preserves cookie/JWT/public fields', async () => {
      const response = await login(); assert.equal(response.status, 200);
      cookie = response.headers.get('set-cookie')?.split(';')[0]; assert.ok(cookie);
      assert.ok(response.headers.get('set-cookie').includes('HttpOnly'));
      publicContract(await response.json(), 'USER');
      const claims = jwt.verify(decodeURIComponent(cookie.slice('auth_token='.length)), config.jwtSecret);
      assert.equal(claims.sub, ids[0]); assert.equal(claims.exp - claims.iat, 3600);
      assert.ok(!('role' in claims) && !('menus' in claims));
      publicContract(await (await me()).json(), 'USER');
      const oldRoleCookie = `auth_token=${jwt.sign({ role: 'ADMIN' }, config.jwtSecret, { subject: ids[0], expiresIn: '1h' })}`;
      const oldRole = await request('/api/auth/me', { headers: { Cookie: oldRoleCookie } });
      assert.equal(oldRole.status, 200); publicContract(await oldRole.json(), 'USER');
    });

    await t.test('the same JWT observes a changed DB role and supports custom roles', async () => {
      for (const code of ['MANAGER', 'AUDITOR']) {
        await prisma.users.update({ where: { id: ids[0] }, data: { role_id: roles.get(code) } });
        const response = await me(); assert.equal(response.status, 200); publicContract(await response.json(), code);
      }
      await prisma.roles.update({ where: { id: roles.get('MANAGER') }, data: { name: 'Edited manager display name' } });
      await prisma.users.update({ where: { id: ids[0] }, data: { role_id: roles.get('MANAGER') } });
      publicContract(await (await login()).json(), 'MANAGER');
    });

    await t.test('unconfigured role denies Login without setting a cookie; invalid credentials/inactive accounts remain 401', async () => {
      const missing = await login('role_unmapped_fixture');
      assert.equal(missing.status, 403); assert.deepEqual(await missing.json(), readyError);
      assert.equal(missing.headers.get('set-cookie'), null);
      assert.equal((await login('role_unmapped_fixture', 'incorrect-password')).status, 401);
      assert.equal((await login('role_inactive_fixture')).status, 401);
    });

    await t.test('missing mapping denies Me/Profile/Avatar before writes and restores with the same JWT', async () => {
      await prisma.users.update({ where: { id: ids[0] }, data: { role_id: null } });
      const before = await fingerprint();
      try {
        const response = await me(); assert.equal(response.status, 403); assert.deepEqual(await response.json(), readyError);
        assert.equal((await patch({ firstName: 'Not written' })).status, 403);
        const avatar = await request('/api/profile/me/avatar', { method: 'POST',
          headers: { Cookie: cookie, 'Content-Type': 'multipart/form-data; boundary=broken' }, body: 'invalid multipart' });
        assert.equal(avatar.status, 403);
        assert.ok(before === await fingerprint(), 'Denied requests changed the user');
        assert.deepEqual(await readdir(directory), []);
        await prisma.users.update({ where: { id: ids[0] }, data: { is_active: false } });
        assert.equal((await me()).status, 401);
      } finally { await prisma.users.update({ where: { id: ids[0] }, data: { role_id: roles.get('MANAGER'), is_active: true } }); }
      const restored = await me(); assert.equal(restored.status, 200); publicContract(await restored.json(), 'MANAGER');
    });

    await t.test('Profile PATCH and Avatar preserve eight public fields and return relation-based role', async () => {
      const response = await patch({ firstName: 'Changed', phone: null }); assert.equal(response.status, 200);
      const data = await response.json(); publicContract(data, 'MANAGER');
      assert.equal(data.user.firstName, 'Changed'); assert.equal(data.user.phone, null);
      const image = await upload(); assert.equal(image.status, 200);
      const uploaded = await image.json(); publicContract(uploaded, 'MANAGER');
      assert.ok(uploaded.user.avatarUrl.startsWith('/uploads/avatars/'));
      const publicImage = await request(uploaded.user.avatarUrl); assert.equal(publicImage.status, 200);
      publicContract(await (await me()).json(), 'MANAGER');
    });

    await t.test('mapping loss during Profile/Avatar update rolls back the row and cleans only the new image', async () => {
      await prisma.$executeRawUnsafe("CREATE FUNCTION role_auth_fixture_unmap() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.username = 'role_auth_fixture' AND (NEW.first_name = 'force_unmapped' OR NEW.avatar_url IS DISTINCT FROM OLD.avatar_url) THEN NEW.role_id = NULL; END IF; RETURN NEW; END; $$");
      try {
        await prisma.$executeRawUnsafe('CREATE TRIGGER role_auth_fixture_unmap BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION role_auth_fixture_unmap()');
        const before = await fingerprint(), files = (await readdir(directory)).sort();
        const response = await patch({ firstName: 'force_unmapped' });
        assert.equal(response.status, 403); assert.deepEqual(await response.json(), readyError);
        assert.ok(before === await fingerprint(), 'Profile mapping failure committed changes');
        const image = await upload(); assert.equal(image.status, 403); assert.deepEqual(await image.json(), readyError);
        assert.ok(before === await fingerprint(), 'Avatar mapping failure committed changes');
        assert.deepEqual((await readdir(directory)).sort(), files);
      } finally {
        await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS role_auth_fixture_unmap ON users');
        await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS role_auth_fixture_unmap()');
      }
    });

    await t.test('Profile grant denial blocks PATCH and upload before parsing while Me stays available', async () => {
      await prisma.users.update({ where: { id: ids[0] }, data: { role_id: roles.get('USER') } });
      const grant = { role_id: roles.get('USER'), menu_id: profileMenuId };
      await prisma.role_menus.delete({ where: { role_id_menu_id: grant } });
      try {
        const before = await prisma.users.findUnique({ where: { id: ids[0] }, select: { email: true, avatar_url: true } });
        assert.equal((await patch({ email: 'denied@example.invalid' })).status, 403);
        assert.equal((await request('/api/profile/me/avatar', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'multipart/form-data; boundary=invalid' }, body: 'invalid' })).status, 403);
        assert.equal((await me()).status, 200);
        assert.deepEqual(await prisma.users.findUnique({ where: { id: ids[0] }, select: { email: true, avatar_url: true } }), before);
      } finally { await prisma.role_menus.create({ data: grant }); }
    });

    await t.test('Logout keeps its existing cookie contract even when mapping is unavailable', async () => {
      await prisma.users.update({ where: { id: ids[0] }, data: { role_id: null } });
      const response = await request('/api/auth/logout', { method: 'POST', headers: { Cookie: cookie } });
      assert.equal(response.status, 200); assert.equal((await response.json()).success, true);
      assert.ok(response.headers.get('set-cookie').includes('Expires=Thu, 01 Jan 1970'));
      assert.equal((await request('/api/auth/me')).status, 401);
    });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    Object.assign(avatarStorage, productionStorage);
    if (started) {
      await prisma.users.deleteMany({ where: { id: { in: ids } } });
      await prisma.role_menus.deleteMany({ where: { menu_id: profileMenuId } });
      await prisma.menus.deleteMany({ where: { id: profileMenuId } });
      if (createdRoles.length) await prisma.roles.deleteMany({ where: { id: { in: createdRoles } } });
    }
    await prisma.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
});
