import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';

test('Menu CRUD HTTP API on an explicitly configured empty disposable PostgreSQL database', {
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
  const { MENU_REGISTRY } = await import('../src/lib/menu-registry.js');
  const { mutateMenu } = await import('../src/services/menu-management.service.js');
  const password = randomBytes(24).toString('base64url'), hash = await bcrypt.hash(password, 12);
  const roles = new Map(), users = new Map(), cookies = new Map(), ownedIds = new Set(MENU_REGISTRY.map((m) => m.id));
  const registry = (key) => MENU_REGISTRY.find((m) => m.key === key);
  const snapshot = async () => JSON.stringify(await prisma.$transaction([
    prisma.users.findMany({ orderBy: { id: 'asc' } }), prisma.roles.findMany({ orderBy: { id: 'asc' } }),
    prisma.menus.findMany({ orderBy: { id: 'asc' } }), prisma.role_menus.findMany({ orderBy: [{ role_id: 'asc' }, { menu_id: 'asc' }] }),
  ]));
  let server, owned = false;
  try {
    assert.equal(await prisma.users.count(), 0); assert.equal(await prisma.roles.count(), 0); assert.equal(await prisma.menus.count(), 0); owned = true;
    for (const code of ['ADMIN', 'MANAGER', 'USER']) {
      const role = await prisma.roles.create({ data: { code, name: code } }); roles.set(code, role.id);
      const id = randomUUID(); users.set(code, id);
      await prisma.users.create({ data: { id, username: `crud_${code}`, email: `crud_${code}@example.invalid`,
        password_hash: hash, role: code, role_id: role.id, is_active: true, updated_at: new Date() } });
    }
    await seedMenuAccess(prisma, { apply: true });
    server = await new Promise((resolve, reject) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); s.once('error', reject); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const http = (path, options = {}) => fetch(base + path, { signal: AbortSignal.timeout(20000), ...options });
    for (const code of ['ADMIN', 'MANAGER', 'USER']) {
      const response = await http('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: `crud_${code}`, password }) });
      assert.equal(response.status, 200); cookies.set(code, response.headers.get('set-cookie').split(';')[0]);
    }
    const call = (method, id = '', body, role = 'ADMIN') => http('/api/menus' + (id ? `/${id}` : ''), {
      method, headers: { ...(role ? { Cookie: cookies.get(role) } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const result = async (response, status, code) => {
      assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'no-store');
      const data = await response.json(); if (code) assert.equal(data.code, code); return data;
    };
    const create = async (body) => {
      const data = await result(await call('POST', '', body), 201); ownedIds.add(data.menu.id); return data.menu;
    };
    await t.test('all four routes require JWT, ADMIN and the current menu grant', async () => {
      const before = await snapshot();
      // A menu grant alone must not elevate non-admin roles to management APIs.
      await prisma.role_menus.createMany({ data: ['USER', 'MANAGER'].map((code) => ({ role_id: roles.get(code), menu_id: registry('menus').id })) });
      for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
        const id = ['PUT', 'DELETE'].includes(method) ? randomUUID() : '';
        for (const role of [null, 'USER', 'MANAGER']) await result(await call(method, id, method === 'POST' || method === 'PUT' ? { menuName: 'Denied' } : undefined, role), role ? 403 : 401);
      }
      await prisma.role_menus.deleteMany({ where: { role_id: { in: [roles.get('USER'), roles.get('MANAGER')] }, menu_id: registry('menus').id } });
      const grant = { role_id: roles.get('ADMIN'), menu_id: registry('menus').id };
      await prisma.role_menus.delete({ where: { role_id_menu_id: grant } });
      await result(await call('GET'), 403); await result(await call('POST', '', { menuName: 'Denied' }), 403);
      await prisma.role_menus.create({ data: grant });
      assert.equal(await snapshot(), before);
    });
    let parent, child;
    await t.test('create defaults and camelCase nine-field DTO; PUT preserves omitted fields', async () => {
      parent = await create({ menuName: '  Test Group  ' });
      assert.equal(parent.menuName, 'Test Group'); assert.equal(parent.menuPath, null); assert.equal(parent.isActive, true); assert.equal(parent.sortOrder, 0);
      assert.deepEqual(Object.keys(parent).sort(), ['createdAt', 'id', 'isActive', 'menuIcon', 'menuName', 'menuPath', 'parentId', 'sortOrder', 'updatedAt']);
      child = await create({ menuName: 'Test Child', menuPath: '/test-child', parentId: parent.id, menuIcon: 'ListTree', sortOrder: 7, isActive: false });
      const updated = (await result(await call('PUT', child.id.toUpperCase(), { menuName: 'Edited Child' }), 200)).menu;
      assert.equal(updated.parentId, parent.id); assert.equal(updated.menuPath, '/test-child'); assert.equal(updated.sortOrder, 7); assert.equal(updated.isActive, false);
      assert.ok(!Number.isNaN(Date.parse(updated.updatedAt)));
    });
    await t.test('invalid types, fields and unsafe paths return 400 without writes', async () => {
      const before = await snapshot();
      for (const body of [null, [], {}, { menuPath: '/missing-name' }, { menuName: '' }, { menuName: 'x'.repeat(101) },
        { menuName: 'x', isActive: 'true' }, { menuName: 'x', sortOrder: -1 }, { menuName: 'x', sortOrder: 1.5 },
        { menuName: 'x', sortOrder: 2147483648 }, { menuName: 'x', parentId: 'bad' }, { menuName: 'x', isCritical: true },
        { menuName: 'x', id: randomUUID() }, { menuName: 'x', menuIcon: '<svg>' }, { menuName: 'x', menuPath: 7 },
        ...['https://evil.invalid', '//evil', '/a/../b', '/a%2fb', '/a?x=1', '/a#x', '/a\\b', '/a/', '/a b'].map((menuPath) => ({ menuName: 'x', menuPath }))]) {
        await result(await call('POST', '', body), 400);
      }
      await result(await call('PUT', 'bad', { menuName: 'x' }), 400);
      await result(await call('DELETE', 'bad'), 400);
      await result(await call('PUT', child.id, {}), 400);
      assert.equal(await snapshot(), before);
    });
    await t.test('missing menu is 404; missing parent/self-parent/ancestor cycles are rejected', async () => {
      const before = await snapshot();
      await result(await call('PUT', randomUUID(), { menuName: 'Missing' }), 404, 'MENU_NOT_FOUND');
      await result(await call('DELETE', randomUUID()), 404, 'MENU_NOT_FOUND');
      await result(await call('PUT', child.id, { parentId: randomUUID() }), 400, 'INVALID_PARENT');
      await result(await call('PUT', child.id, { parentId: child.id }), 400, 'MENU_CYCLE');
      await result(await call('PUT', parent.id, { parentId: child.id }), 400, 'MENU_CYCLE');
      assert.equal(await snapshot(), before);
    });
    await t.test('path conflicts are 409; multiple pathless groups and explicit null values are allowed', async () => {
      const before = await snapshot(); await result(await call('POST', '', { menuName: 'Duplicate', menuPath: '/profile' }), 409, 'MENU_PATH_CONFLICT');
      await result(await call('PUT', child.id, { menuPath: '/dashboard' }), 409, 'MENU_PATH_CONFLICT'); assert.equal(await snapshot(), before);
      const group = await create({ menuName: 'Second Group', menuPath: null });
      const updated = (await result(await call('PUT', child.id, { menuIcon: null, menuPath: null, parentId: null }), 200)).menu;
      assert.equal(updated.parentId, null); assert.equal(updated.menuIcon, null);
      await result(await call('PUT', child.id, { parentId: parent.id, menuPath: '/test-child' }), 200);
      await result(await call('DELETE', group.id), 200);
    });
    await t.test('GET includes inactive rows, deterministic sorting and no writes', async () => {
      const before = await snapshot(), response = await call('GET'), data = await result(response, 200);
      assert.equal(data.menus.find((m) => m.id === child.id).isActive, false);
      assert.deepEqual(data.menus.map((m) => m.id), [...data.menus].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)).map((m) => m.id));
      assert.equal(await snapshot(), before);
    });
    await t.test('critical paths/status/delete and inactive ancestors are protected, harmless edits allowed', async () => {
      const critical = registry('roles'), before = await snapshot();
      for (const body of [{ isActive: false }, { menuPath: null }, { menuPath: '/renamed-critical' }]) await result(await call('PUT', critical.id, body), 409, 'CRITICAL_MENU_PROTECTED');
      await result(await call('DELETE', critical.id), 409, 'CRITICAL_MENU_PROTECTED');
      await result(await call('PUT', registry('system').id, { isActive: false }), 409, 'CRITICAL_MENU_PROTECTED');
      await result(await call('PUT', critical.id, { parentId: child.id }), 409, 'CRITICAL_MENU_PROTECTED');
      assert.equal(await snapshot(), before);
      await result(await call('PUT', critical.id, { menuName: 'Roles (edited)', menuIcon: 'Shield', sortOrder: 25 }), 200);
    });
    await t.test('delete restrictions include inactive children and assigned inactive menus', async () => {
      await result(await call('DELETE', parent.id), 409, 'MENU_HAS_CHILDREN');
      const grant = { role_id: roles.get('USER'), menu_id: child.id };
      await prisma.role_menus.create({ data: grant });
      await result(await call('DELETE', child.id), 409, 'MENU_ASSIGNED');
      assert.ok(await prisma.menus.findUnique({ where: { id: child.id } }));
      await prisma.role_menus.delete({ where: { role_id_menu_id: grant } });
      await result(await call('DELETE', child.id), 200); await result(await call('DELETE', parent.id), 200);
    });
    await t.test('new menus receive no role grants automatically', async () => {
      const menu = await create({ menuName: 'No Implicit Grant', menuPath: '/no-auto-grant', parentId: registry('system').id });
      assert.equal(await prisma.role_menus.count({ where: { menu_id: menu.id } }), 0);
      const mine = await http('/api/me/menus', { headers: { Cookie: cookies.get('ADMIN') } });
      assert.equal((await mine.json()).allowedPaths.includes('/no-auto-grant'), false);
    });
    await t.test('concurrent duplicate paths insert once', async () => {
      const responses = await Promise.all([call('POST', '', { menuName: 'Race A', menuPath: '/race-unique' }), call('POST', '', { menuName: 'Race B', menuPath: '/race-unique' })]);
      assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
      for (const response of responses) { const data = await response.json(); if (data.menu) ownedIds.add(data.menu.id); }
      assert.equal(await prisma.menus.count({ where: { menu_path: '/race-unique' } }), 1);
    });
    await t.test('concurrent reciprocal moves cannot create a cycle', async () => {
      const a = await create({ menuName: 'Race Parent A' }), b = await create({ menuName: 'Race Parent B' });
      const responses = await Promise.all([call('PUT', a.id, { parentId: b.id }), call('PUT', b.id, { parentId: a.id })]);
      const statuses = responses.map((r) => r.status); assert.equal(statuses.filter((s) => s === 200).length, 1);
      assert.ok(statuses.some((s) => s === 400 || s === 409));
      const rows = await prisma.menus.findMany({ where: { id: { in: [a.id, b.id] } } });
      assert.ok(!rows.every((m) => m.parent_id === (m.id === a.id ? b.id : a.id)));
    });
    await t.test('concurrent critical move and ancestor deactivation cannot lock out ADMIN', async () => {
      const group = await create({ menuName: 'Race Critical Ancestor' }), critical = registry('roles');
      const responses = await Promise.all([call('PUT', critical.id, { parentId: group.id }), call('PUT', group.id, { isActive: false })]);
      assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
      const mine = await http('/api/me/menus', { headers: { Cookie: cookies.get('ADMIN') } });
      assert.equal((await mine.json()).allowedPaths.includes(critical.path), true);
      await result(await call('PUT', critical.id, { parentId: registry('system').id }), 200);
    });
    await t.test('service rechecks current actor rather than trusting earlier middleware authorization', async () => {
      const before = await snapshot();
      await assert.rejects(mutateMenu(users.get('USER'), 'create', randomUUID(), { menu_name: 'Denied' }), { status: 403 });
      assert.equal(await snapshot(), before);
    });
    await t.test('late database failure rolls back, returns safe 500 and hides internal details', async () => {
      await prisma.$executeRawUnsafe("CREATE FUNCTION menu_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.menu_name = 'Trigger failure' THEN RAISE EXCEPTION 'Synthetic test failure'; END IF; RETURN NEW; END; $$");
      try {
        await prisma.$executeRawUnsafe('CREATE TRIGGER menu_test_failure BEFORE INSERT ON menus FOR EACH ROW EXECUTE FUNCTION menu_test_failure()');
        const before = await snapshot(); const data = await result(await call('POST', '', { menuName: 'Trigger failure' }), 500);
        assert.deepEqual(data, { success: false, message: 'Internal server error' }); assert.equal(await snapshot(), before);
      } finally {
        await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS menu_test_failure ON menus');
        await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS menu_test_failure()');
      }
    });
  } finally {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (owned) {
      await prisma.role_menus.deleteMany({ where: { role_id: { in: [...roles.values()] } } });
      while (await prisma.menus.deleteMany({ where: { id: { in: [...ownedIds] }, children: { none: {} } } }).then((r) => r.count)) { /* delete leaves before ancestors */ }
      await prisma.users.deleteMany({ where: { id: { in: [...users.values()] } } });
      await prisma.roles.deleteMany({ where: { id: { in: [...roles.values()] } } });
    }
    await prisma.$disconnect();
  }
});
