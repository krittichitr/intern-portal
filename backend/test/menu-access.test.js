import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/menu_mock_only?connect_timeout=1';
process.env.JWT_SECRET = randomBytes(48).toString('hex');
process.env.NODE_ENV = 'test';
const { buildMenuAccess, getUserMenuAccess } = await import('../src/services/menu-access.service.js');
const { requireMenuAccess } = await import('../src/middleware/authorization.middleware.js');
const { prisma } = await import('../src/lib/prisma.js');
const menu = (id, parent_id = null, changes = {}) => ({ id, parent_id,
  menu_name: id, menu_path: `/${id}`, menu_icon: 'UserRound', sort_order: 0, is_active: true, ...changes });

test('direct menu grants, hierarchy and ordering', async (t) => {
  const parent = menu('parent');
  const child = menu('child', 'parent');
  const grandchild = menu('grandchild', 'child');
  await t.test('parent grant never gives child permissions', () => {
    const access = buildMenuAccess([parent, child, grandchild], ['parent']);
    assert.deepEqual(access.allowedPaths, ['/parent']); assert.deepEqual(access.tree[0].children, []);
  });
  await t.test('child grant displays ungranted ancestors only as non-clickable groups', () => {
    const access = buildMenuAccess([parent, child, grandchild], ['grandchild']);
    assert.deepEqual(access.allowedPaths, ['/grandchild']);
    assert.equal(access.tree[0].menuPath, null); assert.equal(access.tree[0].canAccess, false);
    assert.equal(access.tree[0].children[0].menuPath, null);
    assert.equal(access.tree[0].children[0].children[0].canAccess, true);
  });
  await t.test('inactive menu or ancestor blocks the whole branch without mutating inputs', () => {
    for (const id of ['parent', 'child', 'grandchild']) {
      const rows = [parent, child, grandchild].map((m) => ({ ...m, is_active: m.id !== id }));
      const before = structuredClone(rows);
      assert.deepEqual(buildMenuAccess(rows, ['grandchild']), { tree: [], allowedPaths: [] });
      assert.deepEqual(rows, before);
    }
  });
  await t.test('cycles and orphaned branches fail closed; healthy siblings still work', () => {
    const rows = [menu('a', 'b'), menu('b', 'a'), menu('c', 'a'), menu('orphan', 'missing'), menu('good')];
    assert.deepEqual(buildMenuAccess(rows, rows.map((m) => m.id)).allowedPaths, ['/good']);
  });
  await t.test('tree and allowed paths share stable sort order, including sibling ties', () => {
    const rows = [menu('z', null, { sort_order: 20 }), menu('b', 'z'), menu('a', 'z'), menu('first', null, { sort_order: 10 })];
    const grants = rows.map((m) => m.id);
    const access = buildMenuAccess(rows, grants);
    assert.deepEqual(access.allowedPaths, ['/first', '/z', '/a', '/b']);
    assert.deepEqual(buildMenuAccess([...rows].reverse(), [...grants].reverse()), access);
  });
  await t.test('empty, unknown and pathless-only grants give no allowed page', () => {
    for (const ids of [[], ['unknown'], ['group']]) {
      assert.deepEqual(buildMenuAccess([menu('group', null, { menu_path: null })], ids), { tree: [], allowedPaths: [] });
    }
  });
  await t.test('new children are not inherited, and reopening parent does not activate an inactive child', () => {
    const rows = [parent, child, menu('inactive', 'parent', { is_active: false })];
    assert.deepEqual(buildMenuAccess(rows, ['parent', 'inactive']).allowedPaths, ['/parent']);
  });
});

test('menu guard and consistent current-user snapshot with mocked Prisma', async (t) => {
  const original = prisma.$transaction;
  let user, menus, grants, fail, readOnly, roleQueries;
  const reset = () => {
    user = { is_active: true, role_record: { id: 'current-role', code: 'USER' } };
    menus = [menu('profile')]; grants = [{ menu_id: 'profile' }]; fail = null; readOnly = false; roleQueries = [];
  };
  prisma.$transaction = async (callback, options) => {
    assert.equal(options.isolationLevel, 'RepeatableRead');
    return callback({
      $executeRaw: async (sql) => { assert.equal(sql[0], 'SET TRANSACTION READ ONLY'); readOnly = true; },
      users: { findUnique: async ({ where }) => { assert.equal(readOnly, true); assert.equal(where.id, 'session-user'); if (fail) throw fail; return user; } },
      menus: { findMany: async () => menus },
      role_menus: { findMany: async ({ where }) => { roleQueries.push(where.role_id); return grants; } },
    });
  };
  const guard = requireMenuAccess('/profile');
  async function run(req = { user: { id: 'session-user', role: 'ADMIN' }, body: { path: '/profile', role: 'ADMIN' } }) {
    let status, body, nextCalled = false, nextError;
    const res = { status(value) { status = value; return this; }, json(value) { body = value; return this; } };
    await guard(req, res, (error) => { nextCalled = true; nextError = error; });
    return { status, body, nextCalled, nextError };
  }
  try {
    await t.test('active direct grant passes using current DB role, not req.user role', async () => {
      reset(); const result = await run(); assert.equal(result.nextCalled, true); assert.equal(result.nextError, undefined);
      assert.deepEqual(roleQueries, ['current-role']);
    });
    await t.test('revocation is observed on next request; ADMIN has no implicit bypass', async () => {
      reset(); assert.equal((await run()).nextCalled, true);
      user.role_record.code = 'ADMIN'; grants = [];
      const result = await run(); assert.equal(result.status, 403); assert.equal(result.nextCalled, false);
      assert.deepEqual(result.body, { success: false, message: 'Forbidden' });
    });
    await t.test('guard path comes from route constant, not request path claims', async () => {
      reset(); menus = [menu('other')]; grants = [{ menu_id: 'other' }];
      assert.equal((await run({ user: { id: 'session-user' }, query: { path: '/other' }, body: { path: '/other' } })).status, 403);
    });
    await t.test('missing session, missing user and inactive user are 401', async () => {
      reset(); assert.equal((await run({})).status, 401); assert.equal(roleQueries.length, 0);
      user = null; assert.equal((await run()).status, 401);
      user = { is_active: false }; assert.equal((await run()).status, 401);
    });
    await t.test('missing mapping is RBAC_NOT_READY; no grants is a successful empty snapshot', async () => {
      reset(); user.role_record = null;
      assert.equal((await run()).body.code, 'RBAC_NOT_READY');
      reset(); grants = [];
      assert.deepEqual(await getUserMenuAccess('session-user'), { tree: [], allowedPaths: [] });
    });
    await t.test('database failure propagates to error middleware instead of allowing access', async () => {
      reset(); fail = new Error('Synthetic unavailable DB'); const result = await run();
      assert.equal(result.nextError, fail); assert.equal(result.status, undefined);
    });
    await t.test('invalid guard configuration is rejected at route registration', () => {
      for (const path of [undefined, null, '', 'profile', '//host', '/profile?allow=true', '/profile#x', '/a\\b']) {
        assert.throws(() => requireMenuAccess(path), TypeError);
      }
    });
  } finally { prisma.$transaction = original; await prisma.$disconnect(); }
});
