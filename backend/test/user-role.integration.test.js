import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';

test('User Role Assignment HTTP API on an explicitly configured empty disposable PostgreSQL database', {
  skip: !process.env.RBAC_TEST_DATABASE_URL,
}, async (t) => {
  const targetUrl = new URL(process.env.RBAC_TEST_DATABASE_URL), name = decodeURIComponent(targetUrl.pathname.slice(1));
  assert.ok(['postgres:', 'postgresql:'].includes(targetUrl.protocol));
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(targetUrl.hostname));
  assert.match(name, /^login_rbac_test_[a-z0-9_]+$/);
  assert.equal(targetUrl.searchParams.get('schema') || 'public', 'public');
  if (process.env.DATABASE_URL) assert.notEqual(name, decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1)));
  process.env.DATABASE_URL = targetUrl.toString(); process.env.JWT_SECRET = randomBytes(48).toString('hex'); process.env.NODE_ENV = 'test';
  const { app } = await import('../src/server.js');
  const { prisma } = await import('../src/lib/prisma.js');
  const { seedMenuAccess } = await import('../scripts/seed-menu-access.mjs');
  const { MENU_REGISTRY } = await import('../src/lib/menu-registry.js');
  const { assignUserRole } = await import('../src/services/user-role.service.js');
  const password = randomBytes(24).toString('base64url'), hash = await bcrypt.hash(password, 12);
  const roles = new Map(), users = new Map(), cookies = new Map();
  let owned = false, server;
  const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const snapshot = async () => digest(await prisma.$transaction([
    prisma.users.findMany({ orderBy: { id: 'asc' } }), prisma.roles.findMany({ orderBy: { id: 'asc' } }),
    prisma.menus.findMany({ orderBy: { id: 'asc' } }), prisma.role_menus.findMany({ orderBy: [{ role_id: 'asc' }, { menu_id: 'asc' }] }),
  ]));
  const registry = (key) => MENU_REGISTRY.find((m) => m.key === key);
  try {
    assert.equal(await prisma.users.count(), 0); assert.equal(await prisma.roles.count(), 0); assert.equal(await prisma.menus.count(), 0); owned = true;
    for (const code of ['ADMIN', 'MANAGER', 'USER', 'AUDITOR']) {
      const role = await prisma.roles.create({ data: { code, name: code } }); roles.set(code, role.id);
    }
    for (const [key, code, active] of [['ADMIN_A', 'ADMIN', true], ['ADMIN_B', 'ADMIN', true], ['MANAGER', 'MANAGER', true],
      ['USER', 'USER', true], ['INACTIVE_ADMIN', 'ADMIN', false], ['UNMAPPED', null, true]]) {
      const id = randomUUID(); users.set(key, id);
      await prisma.users.create({ data: { id, username: `assignment_${key}`, email: `assignment_${key}@example.invalid`, password_hash: hash,
        role: code || 'USER', role_id: code ? roles.get(code) : null, is_active: active, updated_at: new Date(0),
        first_name: 'Preserved', last_name: 'Fixture', phone: '0000000000', avatar_url: '/uploads/avatars/existing-fixture.webp' } });
    }
    await seedMenuAccess(prisma, { apply: true });
    server = await new Promise((resolve, reject) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); s.once('error', reject); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const http = (path, options = {}) => fetch(base + path, { signal: AbortSignal.timeout(20000), ...options });
    const login = (key) => http('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: `assignment_${key}`, password }) });
    for (const key of ['ADMIN_A', 'ADMIN_B', 'MANAGER', 'USER']) {
      const response = await login(key); assert.equal(response.status, 200); cookies.set(key, response.headers.get('set-cookie').split(';')[0]);
    }
    const call = (id, body, actor = 'ADMIN_A') => http(`/api/users/${id}/role`, {
      method: 'PUT', headers: { ...(actor ? { Cookie: cookies.get(actor) } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const assign = (target, destination, actor = 'ADMIN_A') => call(users.get(target), { roleId: roles.get(destination) }, actor);
    const result = async (response, status, code) => {
      assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('set-cookie'), null);
      const data = await response.json(); if (code) assert.equal(data.code, code); return data;
    };
    const me = (key) => http('/api/auth/me', { headers: { Cookie: cookies.get(key) } });
    const mine = (key) => http('/api/me/menus', { headers: { Cookie: cookies.get(key) } });
    await t.test('requires JWT, ADMIN and User Role Assignment menu grant; client claims cannot elevate', async () => {
      const before = await snapshot();
      await result(await assign('USER', 'ADMIN', null), 401);
      await prisma.role_menus.createMany({ data: ['USER', 'MANAGER'].map((code) => ({ role_id: roles.get(code), menu_id: registry('users').id })) });
      for (const actor of ['USER', 'MANAGER']) await result(await assign('USER', 'ADMIN', actor), 403);
      await prisma.role_menus.deleteMany({ where: { role_id: { in: [roles.get('USER'), roles.get('MANAGER')] }, menu_id: registry('users').id } });
      const grant = { role_id: roles.get('ADMIN'), menu_id: registry('users').id };
      await prisma.role_menus.delete({ where: { role_id_menu_id: grant } });
      await result(await assign('USER', 'MANAGER'), 403);
      await prisma.role_menus.create({ data: grant }); assert.equal(await snapshot(), before);
    });
    await t.test('validates one roleId only, UUIDs and existence without changing anything', async () => {
      const before = await snapshot();
      for (const body of [undefined, null, [], {}, { roleId: null }, { roleId: [] }, { roleId: [roles.get('ADMIN')] },
        { roleId: 'ADMIN' }, { role_id: roles.get('ADMIN') }, { roleId: roles.get('USER'), isAdmin: true },
        { roleId: roles.get('USER'), email: 'changed@example.invalid' }, { roleId: roles.get('USER'), userId: users.get('ADMIN_A') }]) {
        await result(await call(users.get('USER'), body), 400);
      }
      await result(await call('invalid', { roleId: roles.get('USER') }), 400, 'INVALID_USER_ID');
      await result(await call(randomUUID(), { roleId: roles.get('USER') }), 404, 'USER_NOT_FOUND');
      await result(await call(users.get('USER'), { roleId: randomUUID() }), 404, 'ROLE_NOT_FOUND');
      assert.equal(await snapshot(), before);
    });
    await t.test('assigns one role and returns shared public DTO while preserving profile/hash/activity and actor', async () => {
      const original = await prisma.users.findUnique({ where: { id: users.get('USER') } });
      const actor = await prisma.users.findUnique({ where: { id: users.get('ADMIN_A') } });
      const data = await result(await call(users.get('USER').toUpperCase(), { roleId: roles.get('MANAGER').toUpperCase() }), 200);
      assert.equal(data.user.id, users.get('USER')); assert.equal(data.user.role, 'MANAGER');
      assert.deepEqual(Object.keys(data.user).sort(), ['avatarUrl', 'email', 'firstName', 'id', 'lastName', 'phone', 'role', 'username']);
      const updated = await prisma.users.findUnique({ where: { id: users.get('USER') } });
      assert.equal(updated.role_id, roles.get('MANAGER')); assert.equal(updated.role, 'MANAGER');
      const untouched = (row) => Object.fromEntries(Object.entries(row).filter(([key]) => !['role_id', 'role', 'updated_at'].includes(key)));
      assert.equal(digest(untouched(updated)), digest(untouched(original)));
      assert.equal(digest(await prisma.users.findUnique({ where: { id: users.get('ADMIN_A') } })), digest(actor));
      assert.ok(updated.updated_at.getTime() > original.updated_at.getTime());
    });
    await t.test('same-role save is idempotent and does not rewrite timestamps', async () => {
      const before = await snapshot(); await result(await assign('USER', 'MANAGER'), 200); assert.equal(await snapshot(), before);
    });
    await t.test('existing JWT and future login read new role; custom role with no grants is valid', async () => {
      assert.equal((await (await me('USER')).json()).user.role, 'MANAGER');
      await result(await assign('USER', 'AUDITOR'), 200);
      assert.equal((await (await me('USER')).json()).user.role, 'AUDITOR');
      assert.deepEqual(await (await mine('USER')).json(), { success: true, menus: [], allowedPaths: [] });
      const response = await login('USER'); assert.equal(response.status, 200); assert.equal((await response.json()).user.role, 'AUDITOR');
      await result(await assign('USER', 'USER'), 200);
    });
    await t.test('inactive or unmapped target can be assigned without activating it or changing ownership', async () => {
      await result(await assign('INACTIVE_ADMIN', 'MANAGER'), 200);
      assert.equal((await prisma.users.findUnique({ where: { id: users.get('INACTIVE_ADMIN') } })).is_active, false);
      await result(await assign('UNMAPPED', 'USER'), 200);
      assert.equal((await login('UNMAPPED')).status, 200);
    });
    await t.test('inactive ADMIN does not replace the last active administrator', async () => {
      await result(await assign('INACTIVE_ADMIN', 'ADMIN'), 200);
      await prisma.users.update({ where: { id: users.get('ADMIN_B') }, data: { is_active: false } });
      const before = await snapshot();
      await result(await assign('ADMIN_A', 'MANAGER'), 409, 'LAST_ACTIVE_ADMIN'); assert.equal(await snapshot(), before);
      await result(await assign('ADMIN_A', 'ADMIN'), 200);
      await prisma.users.update({ where: { id: users.get('ADMIN_B') }, data: { is_active: true } });
    });
    await t.test('self-demotion with another active admin succeeds; same cookie loses management rights immediately', async () => {
      await result(await assign('ADMIN_A', 'MANAGER'), 200);
      assert.equal((await (await me('ADMIN_A')).json()).user.role, 'MANAGER');
      const response = await http('/api/roles', { headers: { Cookie: cookies.get('ADMIN_A') } }); assert.equal(response.status, 403);
      await result(await assign('ADMIN_A', 'ADMIN', 'ADMIN_B'), 200);
    });
    await t.test('concurrent self-demotions cannot leave zero active administrators', async () => {
      const responses = await Promise.all([assign('ADMIN_A', 'USER', 'ADMIN_A'), assign('ADMIN_B', 'USER', 'ADMIN_B')]);
      assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
      assert.equal(await prisma.users.count({ where: { is_active: true, role_record: { is: { code: 'ADMIN' } } } }), 1);
      const remaining = (await prisma.users.findUnique({ where: { id: users.get('ADMIN_A') } })).role_id === roles.get('ADMIN') ? 'ADMIN_A' : 'ADMIN_B';
      const demoted = remaining === 'ADMIN_A' ? 'ADMIN_B' : 'ADMIN_A';
      await result(await assign(demoted, 'ADMIN', remaining), 200);
    });
    await t.test('assignment racing role deletion preserves FK integrity', async () => {
      const role = await prisma.roles.create({ data: { code: 'RACE_DESTINATION', name: 'Race destination' } }); roles.set('RACE_DESTINATION', role.id);
      const responses = await Promise.all([assign('USER', 'RACE_DESTINATION'), http(`/api/roles/${role.id}`, { method: 'DELETE', headers: { Cookie: cookies.get('ADMIN_A') } })]);
      const statuses = responses.map((r) => r.status);
      assert.ok((statuses[0] === 200 && statuses[1] === 409) || (statuses[0] === 404 && statuses[1] === 200));
      const row = await prisma.users.findUnique({ where: { id: users.get('USER') } });
      if (row.role_id === role.id) assert.ok(await prisma.roles.findUnique({ where: { id: role.id } }));
      await result(await assign('USER', 'USER'), 200);
    });
    await t.test('service rechecks actor after earlier middleware checks', async () => {
      const before = await snapshot();
      await assert.rejects(assignUserRole(users.get('USER'), users.get('USER'), roles.get('ADMIN')), { status: 403 });
      const grant = { role_id: roles.get('ADMIN'), menu_id: registry('users').id };
      await prisma.role_menus.delete({ where: { role_id_menu_id: grant } });
      await assert.rejects(assignUserRole(users.get('ADMIN_A'), users.get('USER'), roles.get('ADMIN')), { status: 403 });
      await prisma.role_menus.create({ data: grant }); assert.equal(await snapshot(), before);
    });
    await t.test('late database failure rolls back role/link/timestamp and returns safe 500', async () => {
      await prisma.$executeRawUnsafe("CREATE FUNCTION user_role_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.id = '" + users.get('USER') + "'::uuid THEN RAISE EXCEPTION 'Synthetic user role update failure'; END IF; RETURN NEW; END; $$");
      try {
        await prisma.$executeRawUnsafe('CREATE TRIGGER user_role_test_failure BEFORE UPDATE OF role_id ON users FOR EACH ROW EXECUTE FUNCTION user_role_test_failure()');
        const before = await snapshot(); const data = await result(await assign('USER', 'MANAGER'), 500);
        assert.deepEqual(data, { success: false, message: 'Internal server error' }); assert.equal(await snapshot(), before);
      } finally {
        await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS user_role_test_failure ON users');
        await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS user_role_test_failure()');
      }
    });
    await t.test('supporting user list is paginated, admin-only, read-only and never exposes hashes', async () => {
      const before = await snapshot();
      const response = await http('/api/users?page=1&pageSize=2', { headers: { Cookie: cookies.get('ADMIN_A') } });
      assert.equal(response.status, 200); const data = await response.json();
      assert.equal(data.users.length, 2); assert.equal(data.total, 6); assert.equal(data.pageSize, 2);
      assert.deepEqual(Object.keys(data.users[0]).sort(), ['email', 'id', 'isActive', 'role', 'roleId', 'username']);
      for (const key of ['USER', 'MANAGER']) assert.equal((await http('/api/users', { headers: { Cookie: cookies.get(key) } })).status, 403);
      assert.equal((await http('/api/users')).status, 401);
      for (const query of ['page=0', 'pageSize=101', 'page=x', 'page=1&page=2', 'role=ADMIN']) {
        assert.equal((await http('/api/users?' + query, { headers: { Cookie: cookies.get('ADMIN_A') } })).status, 400);
      }
      assert.equal(await snapshot(), before);
    });
    await t.test('new feature does not expose user create/delete APIs', async () => {
      for (const method of ['POST', 'DELETE']) {
        const response = await http('/api/users', { method, headers: { Cookie: cookies.get('ADMIN_A') } }); assert.equal(response.status, 404);
      }
    });
  } finally {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (owned) {
      await prisma.role_menus.deleteMany({ where: { role_id: { in: [...roles.values()] } } });
      await prisma.menus.deleteMany({ where: { parent_id: registry('system').id } });
      await prisma.menus.deleteMany({ where: { id: { in: MENU_REGISTRY.map((m) => m.id) } } });
      await prisma.users.deleteMany({ where: { id: { in: [...users.values()] } } });
      await prisma.roles.deleteMany({ where: { id: { in: [...roles.values()] } } });
    }
    await prisma.$disconnect();
  }
});
