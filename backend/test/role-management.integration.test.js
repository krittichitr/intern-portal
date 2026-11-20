import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';

test('Role CRUD and menu assignment on an explicitly configured empty disposable PostgreSQL database', {
  skip: !process.env.RBAC_TEST_DATABASE_URL,
}, async (t) => {
  const target = new URL(process.env.RBAC_TEST_DATABASE_URL), name = decodeURIComponent(target.pathname.slice(1));
  assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname));
  assert.match(name, /^login_rbac_test_[a-z0-9_]+$/);
  assert.equal(target.searchParams.get('schema') || 'public', 'public');
  if (process.env.DATABASE_URL) assert.notEqual(name, decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1)));
  process.env.DATABASE_URL = target.toString(); process.env.JWT_SECRET = randomBytes(48).toString('hex'); process.env.NODE_ENV = 'test';
  const { app } = await import('../src/server.js');
  const { prisma } = await import('../src/lib/prisma.js');
  const { seedMenuAccess } = await import('../scripts/seed-menu-access.mjs');
  const { MENU_REGISTRY, CRITICAL_MENU_IDS } = await import('../src/lib/menu-registry.js');
  const { mutateRole } = await import('../src/services/role-management.service.js');
  const password = randomBytes(24).toString('base64url'), hash = await bcrypt.hash(password, 12);
  const users = new Map(), roles = new Map(), cookies = new Map(), ownedRoles = new Set(), ownedMenus = new Set(MENU_REGISTRY.map((m) => m.id));
  const registry = (key) => MENU_REGISTRY.find((m) => m.key === key);
  let server, owned = false;
  const snapshot = async () => JSON.stringify(await prisma.$transaction([
    prisma.users.findMany({ orderBy: { id: 'asc' } }), prisma.roles.findMany({ orderBy: { id: 'asc' } }),
    prisma.menus.findMany({ orderBy: { id: 'asc' } }), prisma.role_menus.findMany({ orderBy: [{ role_id: 'asc' }, { menu_id: 'asc' }] }),
  ]));
  try {
    assert.equal(await prisma.users.count(), 0); assert.equal(await prisma.roles.count(), 0); assert.equal(await prisma.menus.count(), 0); owned = true;
    for (const code of ['ADMIN', 'MANAGER', 'USER']) {
      const role = await prisma.roles.create({ data: { code, name: code } }); roles.set(code, role.id); ownedRoles.add(role.id);
      const id = randomUUID(); users.set(code, id);
      await prisma.users.create({ data: { id, username: `role_crud_${code}`, email: `role_crud_${code}@example.invalid`,
        password_hash: hash, role: code, role_id: role.id, is_active: true, updated_at: new Date() } });
    }
    await seedMenuAccess(prisma, { apply: true });
    server = await new Promise((resolve, reject) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); s.once('error', reject); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const http = (path, options = {}) => fetch(base + path, { signal: AbortSignal.timeout(20000), ...options });
    for (const code of ['ADMIN', 'MANAGER', 'USER']) {
      const response = await http('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: `role_crud_${code}`, password }) });
      assert.equal(response.status, 200); cookies.set(code, response.headers.get('set-cookie').split(';')[0]);
    }
    const call = (method, suffix = '', body, actor = 'ADMIN') => http('/api/roles' + suffix, {
      method, headers: { ...(actor ? { Cookie: cookies.get(actor) } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const result = async (response, status, code) => {
      assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'no-store');
      const data = await response.json(); if (code) assert.equal(data.code, code); return data;
    };
    const createRole = async (code, name = code) => {
      const data = await result(await call('POST', '', { code, name }), 201); ownedRoles.add(data.role.id); return data.role;
    };
    const assign = (id, menuIds) => call('PUT', `/${id}/menus`, { menuIds });
    const mine = async (code) => {
      const response = await http('/api/me/menus', { headers: { Cookie: cookies.get(code) } }); assert.equal(response.status, 200); return response.json();
    };
    const createMenu = async (body) => {
      const response = await http('/api/menus', { method: 'POST', headers: { Cookie: cookies.get('ADMIN'), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await result(response, 201); ownedMenus.add(data.menu.id); return data.menu;
    };
    await t.test('all six endpoints require authentication and ADMIN even when non-admin has the menu grant', async () => {
      const before = await snapshot();
      await prisma.role_menus.createMany({ data: ['USER', 'MANAGER'].map((code) => ({ role_id: roles.get(code), menu_id: registry('roles').id })) });
      for (const [method, suffix, body] of [['GET', ''], ['POST', '', { code: 'DENIED', name: 'Denied' }],
        ['PUT', `/${roles.get('USER')}`, { name: 'Denied' }], ['DELETE', `/${roles.get('USER')}`],
        ['GET', `/${roles.get('USER')}/menus`], ['PUT', `/${roles.get('USER')}/menus`, { menuIds: [] }]]) {
        for (const actor of [null, 'USER', 'MANAGER']) await result(await call(method, suffix, body, actor), actor ? 403 : 401);
      }
      await prisma.role_menus.deleteMany({ where: { role_id: { in: [roles.get('USER'), roles.get('MANAGER')] }, menu_id: registry('roles').id } });
      const grant = { role_id: roles.get('ADMIN'), menu_id: registry('roles').id };
      await prisma.role_menus.delete({ where: { role_id_menu_id: grant } });
      await result(await call('GET'), 403); await result(await call('POST', '', { code: 'DENIED', name: 'Denied' }), 403);
      await prisma.role_menus.create({ data: grant }); assert.equal(await snapshot(), before);
    });
    let custom;
    await t.test('create normalizes code/name and returns the five-field DTO without implicit grants', async () => {
      custom = await createRole('  reviewer  ', '  Reviewer  ');
      assert.equal(custom.code, 'REVIEWER'); assert.equal(custom.name, 'Reviewer');
      assert.deepEqual(Object.keys(custom).sort(), ['code', 'createdAt', 'id', 'name', 'updatedAt']);
      assert.equal(await prisma.role_menus.count({ where: { role_id: custom.id } }), 0);
      assert.ok(!Number.isNaN(Date.parse(custom.createdAt)));
    });
    await t.test('rename supports duplicate display names; code cannot be edited', async () => {
      const another = await createRole('SECOND_REVIEWER', 'Reviewer'); assert.equal(another.name, custom.name);
      const renamed = await result(await call('PUT', `/${custom.id.toUpperCase()}`, { name: '  Updated Reviewer  ' }), 200);
      assert.equal(renamed.role.name, 'Updated Reviewer'); assert.equal(renamed.role.code, 'REVIEWER');
      const before = await snapshot();
      await result(await call('PUT', `/${custom.id}`, { name: 'Attempt', code: 'ADMIN' }), 400); assert.equal(await snapshot(), before);
    });
    await t.test('invalid role bodies, UUIDs and canonical duplicate codes do not write data', async () => {
      const before = await snapshot();
      for (const body of [null, [], {}, { code: 'MISSING' }, { name: 'Missing' }, { code: '', name: 'x' },
        { code: 'x'.repeat(21), name: 'x' }, { code: '1USER', name: 'x' }, { code: 'ROLE-TEST', name: 'x' },
        { code: 'VALID', name: '' }, { code: 'VALID', name: 'x'.repeat(101) }, { code: 'VALID', name: null },
        { code: 'VALID', name: 'x', isAdmin: true }, { code: 'VALID', name: 'x', permissions: ['create'] }]) await result(await call('POST', '', body), 400);
      await result(await call('POST', '', { code: 'reviewer', name: 'Duplicate' }), 409, 'ROLE_CODE_CONFLICT');
      await result(await call('PUT', '/invalid', { name: 'x' }), 400);
      await result(await call('DELETE', '/invalid'), 400);
      await result(await call('GET', '/invalid/menus'), 400);
      await result(await call('PUT', `/${custom.id}`, {}), 400); assert.equal(await snapshot(), before);
    });
    await t.test('missing roles return 404 on update/delete/read assignment/assign', async () => {
      const id = randomUUID();
      for (const [method, suffix, body] of [['PUT', `/${id}`, { name: 'Missing' }], ['DELETE', `/${id}`],
        ['GET', `/${id}/menus`], ['PUT', `/${id}/menus`, { menuIds: [] }]]) await result(await call(method, suffix, body), 404, 'ROLE_NOT_FOUND');
    });
    await t.test('GET roles/assignments are read-only, deterministic and include inactive menu grants', async () => {
      const before = await snapshot(), data = await result(await call('GET'), 200);
      assert.deepEqual(data.roles.map((r) => r.code), [...data.roles.map((r) => r.code)].sort());
      const assigned = await result(await call('GET', `/${roles.get('USER')}/menus`), 200);
      assert.deepEqual(assigned.menuIds, [registry('dashboard').id, registry('profile').id].sort());
      assert.equal(await snapshot(), before);
    });
    await t.test('assignment strictly validates arrays, duplicate/unknown IDs and fields before replacing grants', async () => {
      const before = await snapshot();
      for (const body of [null, [], {}, { menuIds: null }, { menuIds: 'x' }, { menuIds: ['invalid'] },
        { menuIds: [registry('profile').id, registry('profile').id.toUpperCase()] }, { menuIds: [], userId: users.get('ADMIN') }]) {
        await result(await call('PUT', `/${roles.get('MANAGER')}/menus`, body), 400);
      }
      await result(await assign(roles.get('MANAGER'), [registry('profile').id, randomUUID()]), 400, 'INVALID_MENU_IDS');
      assert.equal(await snapshot(), before);
    });
    await t.test('replace/remove grants changes only the target role; empty grants do not log out', async () => {
      await result(await assign(roles.get('MANAGER'), [registry('profile').id.toUpperCase()]), 200);
      assert.deepEqual((await mine('MANAGER')).allowedPaths, ['/profile']);
      assert.deepEqual((await mine('USER')).allowedPaths, ['/dashboard', '/profile']);
      await result(await assign(roles.get('MANAGER'), []), 200);
      assert.deepEqual(await mine('MANAGER'), { success: true, menus: [], allowedPaths: [] });
      const me = await http('/api/auth/me', { headers: { Cookie: cookies.get('MANAGER') } }); assert.equal(me.status, 200);
    });
    await t.test('direct assignment has no parent inheritance and inactive state preserves stored grants', async () => {
      const parent = await createMenu({ menuName: 'Assignment Parent', menuPath: '/assignment-parent' });
      const child = await createMenu({ menuName: 'Assignment Child', menuPath: '/assignment-child', parentId: parent.id });
      await result(await assign(roles.get('MANAGER'), [parent.id]), 200);
      assert.deepEqual((await mine('MANAGER')).allowedPaths, ['/assignment-parent']);
      await result(await assign(roles.get('MANAGER'), [child.id]), 200);
      const access = await mine('MANAGER'); assert.deepEqual(access.allowedPaths, ['/assignment-child']); assert.equal(access.menus[0].canAccess, false);
      await result(await http(`/api/menus/${parent.id}`, { method: 'PUT', headers: { Cookie: cookies.get('ADMIN'), 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: false }) }), 200);
      assert.deepEqual((await mine('MANAGER')).allowedPaths, []);
      assert.deepEqual((await result(await call('GET', `/${roles.get('MANAGER')}/menus`), 200)).menuIds, [child.id]);
      await result(await http(`/api/menus/${parent.id}`, { method: 'PUT', headers: { Cookie: cookies.get('ADMIN'), 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: true }) }), 200);
      assert.deepEqual((await mine('MANAGER')).allowedPaths, ['/assignment-child']);
    });
    await t.test('Role with active or inactive users cannot be deleted and retains its grants', async () => {
      const bound = await createRole('BOUND_ROLE');
      await result(await assign(bound.id, [registry('profile').id]), 200);
      for (const active of [true, false]) {
        await prisma.users.update({ where: { id: users.get('USER') }, data: { role_id: bound.id, is_active: active } });
        const before = await snapshot(); await result(await call('DELETE', `/${bound.id}`), 409, 'ROLE_IN_USE'); assert.equal(await snapshot(), before);
      }
      await prisma.users.update({ where: { id: users.get('USER') }, data: { role_id: roles.get('USER'), is_active: true } });
      await result(await call('DELETE', `/${bound.id}`), 200);
      assert.equal(await prisma.role_menus.count({ where: { role_id: bound.id } }), 0);
      assert.ok(await prisma.menus.findUnique({ where: { id: registry('profile').id } }));
    });
    await t.test('ADMIN code/delete and critical grants remain protected; ordinary grants can change', async () => {
      const before = await snapshot();
      await result(await call('DELETE', `/${roles.get('ADMIN')}`), 409, 'ADMIN_ROLE_PROTECTED');
      await result(await assign(roles.get('ADMIN'), []), 409, 'CRITICAL_MENU_PROTECTED');
      await result(await assign(roles.get('ADMIN'), CRITICAL_MENU_IDS.slice(1)), 409, 'CRITICAL_MENU_PROTECTED'); assert.equal(await snapshot(), before);
      await result(await assign(roles.get('ADMIN'), CRITICAL_MENU_IDS), 200);
      assert.deepEqual((await mine('ADMIN')).allowedPaths, ['/admin/menus', '/admin/roles', '/admin/users']);
      await result(await assign(roles.get('ADMIN'), [...CRITICAL_MENU_IDS, registry('dashboard').id, registry('profile').id]), 200);
      await result(await call('PUT', `/${roles.get('ADMIN')}`, { name: 'Administrator (renamed)' }), 200);
      const me = await http('/api/auth/me', { headers: { Cookie: cookies.get('ADMIN') } }); assert.equal((await me.json()).user.role, 'ADMIN');
    });
    await t.test('concurrent canonical code creation inserts only one role', async () => {
      const responses = await Promise.all([call('POST', '', { code: 'RACE_ROLE', name: 'A' }), call('POST', '', { code: 'race_role', name: 'B' })]);
      assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
      for (const response of responses) { const data = await response.json(); if (data.role) ownedRoles.add(data.role.id); }
    });
    await t.test('concurrent replace is atomic, never a union or partial assignment', async () => {
      const a = registry('dashboard').id, b = registry('profile').id;
      const responses = await Promise.all([assign(custom.id, [a]), assign(custom.id, [b])]);
      assert.deepEqual(responses.map((r) => r.status), [200, 200]);
      const ids = (await result(await call('GET', `/${custom.id}/menus`), 200)).menuIds;
      assert.equal(ids.length, 1); assert.ok([a, b].includes(ids[0]));
    });
    await t.test('assignment racing menu deletion leaves a valid grant or rejects the deleted ID', async () => {
      const menu = await createMenu({ menuName: 'Delete/Grant Race', menuPath: '/delete-grant-race' });
      const responses = await Promise.all([assign(custom.id, [menu.id]), http(`/api/menus/${menu.id}`, { method: 'DELETE', headers: { Cookie: cookies.get('ADMIN') } })]);
      const statuses = responses.map((r) => r.status);
      assert.ok((statuses[0] === 200 && statuses[1] === 409) || (statuses[0] === 400 && statuses[1] === 200));
      const exists = await prisma.menus.findUnique({ where: { id: menu.id } });
      assert.equal(await prisma.role_menus.count({ where: { role_id: custom.id, menu_id: menu.id } }), exists ? 1 : 0);
    });
    await t.test('service rechecks actor role and current management grant inside the write transaction', async () => {
      const before = await snapshot();
      await assert.rejects(mutateRole(users.get('USER'), 'create', randomUUID(), { code: 'DENIED', name: 'Denied' }), { status: 403 });
      const grant = { role_id: roles.get('ADMIN'), menu_id: registry('roles').id };
      await prisma.role_menus.delete({ where: { role_id_menu_id: grant } });
      await assert.rejects(mutateRole(users.get('ADMIN'), 'create', randomUUID(), { code: 'DENIED', name: 'Denied' }), { status: 403 });
      await prisma.role_menus.create({ data: grant }); assert.equal(await snapshot(), before);
    });
    await t.test('late assignment failure restores all old grants and returns safe 500', async () => {
      await result(await assign(custom.id, [registry('dashboard').id]), 200);
      await prisma.$executeRawUnsafe("CREATE FUNCTION role_grant_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.role_id = '" + custom.id + "'::uuid THEN RAISE EXCEPTION 'Synthetic grant insertion failure'; END IF; RETURN NEW; END; $$");
      try {
        await prisma.$executeRawUnsafe('CREATE TRIGGER role_grant_test_failure BEFORE INSERT ON role_menus FOR EACH ROW EXECUTE FUNCTION role_grant_test_failure()');
        const before = await snapshot(); const data = await result(await assign(custom.id, [registry('profile').id]), 500);
        assert.deepEqual(data, { success: false, message: 'Internal server error' }); assert.equal(await snapshot(), before);
      } finally {
        await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS role_grant_test_failure ON role_menus');
        await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS role_grant_test_failure()');
      }
    });
  } finally {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (owned) {
      await prisma.role_menus.deleteMany({ where: { role_id: { in: [...ownedRoles] } } });
      while (await prisma.menus.deleteMany({ where: { id: { in: [...ownedMenus] }, children: { none: {} } } }).then((r) => r.count)) { /* remove owned leaves first */ }
      await prisma.users.deleteMany({ where: { id: { in: [...users.values()] } } });
      await prisma.roles.deleteMany({ where: { id: { in: [...ownedRoles] } } });
    }
    await prisma.$disconnect();
  }
});
