import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { seedMenuAccess } from '../scripts/seed-menu-access.mjs';
import { MENU_REGISTRY, CRITICAL_MENU_IDS, MENU_PATHS } from '../src/lib/menu-registry.js';
import { getUserMenuAccess } from '../src/services/menu-access.service.js';

test('Menu bootstrap and policy on an explicitly configured empty disposable PostgreSQL database', {
  skip: !process.env.RBAC_TEST_DATABASE_URL,
}, async (t) => {
  const target = new URL(process.env.RBAC_TEST_DATABASE_URL);
  const name = decodeURIComponent(target.pathname.slice(1));
  assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname));
  assert.match(name, /^login_rbac_test_[a-z0-9_]+$/);
  assert.equal(target.searchParams.get('schema') || 'public', 'public');
  if (process.env.DATABASE_URL) assert.notEqual(name, decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1)));
  const prisma = new PrismaClient({ datasources: { db: { url: target.toString() } }, log: [] });
  const users = ['ADMIN', 'MANAGER', 'USER'].map(() => randomUUID());
  const roleIds = new Map();
  const strayId = randomUUID();
  const group = MENU_REGISTRY.find((m) => m.key === 'system');
  const profile = MENU_REGISTRY.find((m) => m.key === 'profile');
  let owned = false;
  const snapshot = async () => JSON.stringify({
    menus: await prisma.menus.findMany({ orderBy: { id: 'asc' } }),
    grants: await prisma.role_menus.findMany({ orderBy: [{ role_id: 'asc' }, { menu_id: 'asc' }] }),
  });
  try {
    assert.equal(await prisma.users.count(), 0); assert.equal(await prisma.roles.count(), 0);
    assert.equal(await prisma.menus.count(), 0); owned = true;
    await t.test('requires initial roles before writing', async () => {
      await assert.rejects(seedMenuAccess(prisma, { apply: true }), { code: 'ROLES_REQUIRED' });
      assert.equal(await prisma.menus.count(), 0);
    });
    for (const [index, code] of ['ADMIN', 'MANAGER', 'USER'].entries()) {
      const role = await prisma.roles.create({ data: { code, name: code } }); roleIds.set(code, role.id);
      await prisma.users.create({ data: { id: users[index], username: `menu_fixture_${code}`,
        email: `menu_${code}@example.invalid`, password_hash: 'unusable-test-fixture-hash', role: code,
        role_id: role.id, is_active: code !== 'ADMIN', updated_at: new Date() } });
    }
    const userFingerprint = () => prisma.users.findMany({ orderBy: { id: 'asc' } });
    await t.test('requires an active mapped admin, not a legacy ADMIN label', async () => {
      await assert.rejects(seedMenuAccess(prisma, { apply: true }), { code: 'ACTIVE_ADMIN_REQUIRED' });
      assert.equal(await prisma.menus.count(), 0);
      await prisma.users.update({ where: { id: users[0] }, data: { is_active: true } });
    });
    const beforeUsers = await userFingerprint();
    await t.test('dry run plans six menus and nine explicit grants with no writes', async () => {
      const before = await snapshot(); const result = await seedMenuAccess(prisma);
      assert.equal(result.menusToCreate, 6); assert.equal(result.grantsToCreate, 9);
      assert.equal(result.menusCreated, 0); assert.equal(await snapshot(), before);
    });
    await t.test('conflicting pre-existing menu identity is refused without overwrites', async () => {
      await prisma.menus.create({ data: { id: strayId, menu_name: 'Existing', menu_path: '/dashboard' } });
      const before = await snapshot();
      await assert.rejects(seedMenuAccess(prisma, { apply: true }), { code: 'MENU_SEED_CONFLICT' });
      assert.equal(await snapshot(), before); await prisma.menus.delete({ where: { id: strayId } });
    });
    await t.test('a late grant failure rolls back the inserted menus as one transaction', async () => {
      const client = { $transaction: (callback, options) => prisma.$transaction(async (tx) => {
        return callback({ ...tx, role_menus: { ...tx.role_menus,
          createMany: async () => { throw new Error('Synthetic grant insertion failure'); } } });
      }, options) };
      await assert.rejects(seedMenuAccess(client, { apply: true }), /Synthetic grant insertion failure/);
      assert.equal(await prisma.menus.count(), 0); assert.equal(await prisma.role_menus.count(), 0);
    });
    await t.test('concurrent bootstraps insert once and preserve all users', async () => {
      const results = await Promise.all([seedMenuAccess(prisma, { apply: true }), seedMenuAccess(prisma, { apply: true })]);
      assert.deepEqual(results.map((r) => r.menusCreated).sort(), [0, 6]);
      assert.equal(await prisma.menus.count(), 6); assert.equal(await prisma.role_menus.count(), 9);
      assert.deepEqual(await userFingerprint(), beforeUsers);
      for (const code of ['ADMIN', 'MANAGER', 'USER']) {
        const grants = await prisma.role_menus.count({ where: { role_id: roleIds.get(code) } });
        assert.equal(grants, code === 'ADMIN' ? 5 : 2);
      }
    });
    await t.test('real DB policy has no admin bypass, groups do not become allowed paths', async () => {
      const admin = await getUserMenuAccess(users[0], prisma);
      assert.equal(admin.allowedPaths.length, 5); assert.equal(admin.tree[2].menuPath, null);
      assert.equal(admin.tree[2].children.length, 3);
      assert.deepEqual((await getUserMenuAccess(users[1], prisma)).allowedPaths, ['/dashboard', '/profile']);
      assert.deepEqual((await getUserMenuAccess(users[2], prisma)).allowedPaths, ['/dashboard', '/profile']);
      await prisma.role_menus.delete({ where: { role_id_menu_id: { role_id: roleIds.get('ADMIN'), menu_id: profile.id } } });
      assert.equal((await getUserMenuAccess(users[0], prisma)).allowedPaths.includes('/profile'), false);
    });
    await t.test('rerun preserves edited menu fields and revoked ordinary grants', async () => {
      await prisma.menus.update({ where: { id: profile.id }, data: { menu_name: 'Edited Profile', sort_order: 99, is_active: false } });
      const before = await snapshot();
      const result = await seedMenuAccess(prisma, { apply: true });
      assert.equal(result.menusCreated, 0); assert.equal(result.grantsCreated, 0);
      assert.equal(await snapshot(), before); assert.deepEqual(await userFingerprint(), beforeUsers);
    });
    await t.test('inactive ancestor blocks management access; bootstrap refuses to reset it', async () => {
      await prisma.menus.update({ where: { id: group.id }, data: { is_active: false } });
      const before = await snapshot(); const access = await getUserMenuAccess(users[0], prisma);
      assert.equal(access.allowedPaths.includes(MENU_PATHS.menus), false);
      await assert.rejects(seedMenuAccess(prisma, { apply: true }), { code: 'CRITICAL_ACCESS_MISSING' });
      assert.equal(await snapshot(), before);
      await prisma.menus.update({ where: { id: group.id }, data: { is_active: true } });
    });
    await t.test('missing critical direct grant is reported instead of silently re-granted', async () => {
      await prisma.role_menus.delete({ where: { role_id_menu_id: { role_id: roleIds.get('ADMIN'), menu_id: CRITICAL_MENU_IDS[0] } } });
      const before = await snapshot();
      await assert.rejects(seedMenuAccess(prisma, { apply: true }), { code: 'CRITICAL_ACCESS_MISSING' });
      assert.equal(await snapshot(), before);
    });
  } finally {
    if (owned) {
      await prisma.role_menus.deleteMany({ where: { role_id: { in: [...roleIds.values()] } } });
      await prisma.menus.deleteMany({ where: { id: { in: [...CRITICAL_MENU_IDS, strayId] } } });
      await prisma.menus.deleteMany({ where: { id: { in: MENU_REGISTRY.map((m) => m.id) } } });
      await prisma.users.deleteMany({ where: { id: { in: users } } });
      await prisma.roles.deleteMany({ where: { id: { in: [...roleIds.values()] } } });
    }
    await prisma.$disconnect();
  }
});
