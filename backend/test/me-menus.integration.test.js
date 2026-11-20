import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';

test('My menus HTTP API on an explicitly configured empty disposable PostgreSQL database', {
  skip: !process.env.RBAC_TEST_DATABASE_URL,
}, async (t) => {
  const target = new URL(process.env.RBAC_TEST_DATABASE_URL);
  const name = decodeURIComponent(target.pathname.slice(1));
  assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname));
  assert.match(name, /^login_rbac_test_[a-z0-9_]+$/);
  assert.equal(target.searchParams.get('schema') || 'public', 'public');
  if (process.env.DATABASE_URL) assert.notEqual(name, decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1)));
  // Configure and validate the isolated database before importing the app/client.
  process.env.DATABASE_URL = target.toString();
  process.env.JWT_SECRET = randomBytes(48).toString('hex');
  process.env.NODE_ENV = 'test';
  const { app } = await import('../src/server.js');
  const { prisma } = await import('../src/lib/prisma.js');
  const { seedMenuAccess } = await import('../scripts/seed-menu-access.mjs');
  const { MENU_REGISTRY } = await import('../src/lib/menu-registry.js');
  const password = randomBytes(24).toString('base64url');
  const hash = await bcrypt.hash(password, 12);
  const users = new Map(), roles = new Map(), cookies = new Map();
  const profile = MENU_REGISTRY.find((m) => m.key === 'profile');
  const group = MENU_REGISTRY.find((m) => m.key === 'system');
  let owned = false, server;
  try {
    assert.equal(await prisma.users.count(), 0); assert.equal(await prisma.roles.count(), 0);
    assert.equal(await prisma.menus.count(), 0); owned = true;
    for (const code of ['ADMIN', 'MANAGER', 'USER']) {
      const role = await prisma.roles.create({ data: { code, name: code } }); roles.set(code, role.id);
      const id = randomUUID(); users.set(code, id);
      await prisma.users.create({ data: { id, username: `my_menus_${code}`, email: `my_menus_${code}@example.invalid`,
        password_hash: hash, role: code, role_id: role.id, is_active: true, updated_at: new Date() } });
    }
    await seedMenuAccess(prisma, { apply: true });
    server = await new Promise((resolve, reject) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s)); s.once('error', reject);
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = (path, options = {}) => fetch(base + path, { signal: AbortSignal.timeout(10000), ...options });
    const mine = (code, query = '') => request('/api/me/menus' + query, { headers: { Cookie: cookies.get(code) } });
    await t.test('three roles login and receive their own sorted menu trees through the actual route', async () => {
      for (const code of ['ADMIN', 'MANAGER', 'USER']) {
        const login = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: `my_menus_${code}`, password }) });
        assert.equal(login.status, 200);
        const cookie = login.headers.get('set-cookie'); assert.ok(cookie);
        cookies.set(code, cookie.split(';')[0]);
        const response = await mine(code); assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('set-cookie'), null);
        const data = await response.json();
        assert.deepEqual(Object.keys(data).sort(), ['allowedPaths', 'menus', 'success']);
        assert.deepEqual(data.allowedPaths, code === 'ADMIN' ? ['/dashboard', '/profile', '/admin/menus', '/admin/roles', '/admin/users'] : ['/dashboard', '/profile']);
        if (code === 'ADMIN') {
          assert.equal(data.menus[2].menuPath, null); assert.equal(data.menus[2].canAccess, false);
          assert.equal(data.menus[2].children.length, 3);
        }
      }
    });
    await t.test('query parameters cannot read another user or role permissions', async () => {
      const data = await (await mine('USER', `?roleId=${roles.get('ADMIN')}&userId=${users.get('ADMIN')}&role=ADMIN`)).json();
      assert.deepEqual(data.allowedPaths, ['/dashboard', '/profile']);
    });
    await t.test('empty grants return 200 without logout; Me remains available; grants may be restored', async () => {
      const where = { role_id: roles.get('USER') };
      const original = await prisma.role_menus.findMany({ where });
      await prisma.role_menus.deleteMany({ where });
      const response = await mine('USER'); assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { success: true, menus: [], allowedPaths: [] });
      const me = await request('/api/auth/me', { headers: { Cookie: cookies.get('USER') } }); assert.equal(me.status, 200);
      await prisma.role_menus.createMany({ data: original });
    });
    await t.test('inactive ancestors hide management children without changing grants; reactivation restores access', async () => {
      const before = await prisma.role_menus.count();
      await prisma.menus.update({ where: { id: group.id }, data: { is_active: false } });
      assert.deepEqual((await (await mine('ADMIN')).json()).allowedPaths, ['/dashboard', '/profile']);
      assert.equal(await prisma.role_menus.count(), before);
      await prisma.menus.update({ where: { id: group.id }, data: { is_active: true } });
      assert.equal((await (await mine('ADMIN')).json()).allowedPaths.length, 5);
    });
    await t.test('same JWT observes role assignment changes; missing mapping and inactive users are denied', async () => {
      const where = { id: users.get('USER') };
      await prisma.users.update({ where, data: { role_id: roles.get('ADMIN') } });
      assert.equal((await (await mine('USER')).json()).allowedPaths.length, 5);
      await prisma.users.update({ where, data: { role_id: null } });
      let response = await mine('USER'); assert.equal(response.status, 403); assert.equal((await response.json()).code, 'RBAC_NOT_READY');
      await prisma.users.update({ where, data: { role_id: roles.get('USER'), is_active: false } });
      response = await mine('USER'); assert.equal(response.status, 401);
      await prisma.users.update({ where, data: { is_active: true } });
      assert.deepEqual((await (await mine('USER')).json()).allowedPaths, ['/dashboard', '/profile']);
    });
    await t.test('ADMIN does not bypass a revoked ordinary direct grant', async () => {
      const grant = { role_id: roles.get('ADMIN'), menu_id: profile.id };
      await prisma.role_menus.delete({ where: { role_id_menu_id: grant } });
      assert.equal((await (await mine('ADMIN')).json()).allowedPaths.includes('/profile'), false);
      await prisma.role_menus.create({ data: grant });
    });
    await t.test('GET leaves all four tables unchanged and cannot be used after logout', async () => {
      const snapshot = async () => JSON.stringify(await prisma.$transaction([
        prisma.users.findMany({ orderBy: { id: 'asc' } }), prisma.roles.findMany({ orderBy: { id: 'asc' } }),
        prisma.menus.findMany({ orderBy: { id: 'asc' } }),
        prisma.role_menus.findMany({ orderBy: [{ role_id: 'asc' }, { menu_id: 'asc' }] }),
      ]));
      const before = await snapshot();
      for (const code of ['ADMIN', 'MANAGER', 'USER']) assert.equal((await mine(code)).status, 200);
      assert.equal(await snapshot(), before);
      const logout = await request('/api/auth/logout', { method: 'POST', headers: { Cookie: cookies.get('USER') } });
      assert.equal(logout.status, 200);
      assert.ok(/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(logout.headers.get('set-cookie')));
      // A browser applies the clearing Set-Cookie; do not replay the old JWT.
      const response = await request('/api/me/menus'); assert.equal(response.status, 401);
    });
  } finally {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (owned) {
      await prisma.role_menus.deleteMany({ where: { role_id: { in: [...roles.values()] } } });
      await prisma.menus.deleteMany({ where: { parent_id: group.id } });
      await prisma.menus.deleteMany({ where: { id: { in: MENU_REGISTRY.map((m) => m.id) } } });
      await prisma.users.deleteMany({ where: { id: { in: [...users.values()] } } });
      await prisma.roles.deleteMany({ where: { id: { in: [...roles.values()] } } });
    }
    await prisma.$disconnect();
  }
});
