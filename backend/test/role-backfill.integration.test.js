import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { backfillUserRoles } from '../scripts/backfill-user-roles.mjs';

test('Role backfill on an explicitly configured empty disposable database', {
  skip: !process.env.RBAC_TEST_DATABASE_URL,
}, async (t) => {
  const url = new URL(process.env.RBAC_TEST_DATABASE_URL);
  const name = decodeURIComponent(url.pathname.slice(1));
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.match(name, /^login_rbac_test_[a-z0-9_]+$/);
  assert.equal(url.searchParams.get('schema') || 'public', 'public');
  if (process.env.DATABASE_URL) {
    const configured = new URL(process.env.DATABASE_URL);
    assert.notEqual(name, decodeURIComponent(configured.pathname.slice(1)), 'Refuse the configured application database');
  }
  // Validate the target before constructing a connected client or writing data.
  const prisma = new PrismaClient({ datasourceUrl: url.toString(), log: [] });
  const ids = [];
  const codes = ['ADMIN', 'MANAGER', 'USER'];
  const fingerprint = async (includeRelation = false) => {
    const [row] = includeRelation
      ? await prisma.$queryRaw`SELECT md5(COALESCE(string_agg(to_jsonb(u)::text, '' ORDER BY id), '')) AS value FROM users u`
      : await prisma.$queryRaw`SELECT md5(COALESCE(string_agg((to_jsonb(u)-'role_id')::text, '' ORDER BY id), '')) AS value FROM users u`;
    return row.value;
  };
  const roleFingerprint = async () => {
    const [row] = await prisma.$queryRaw`SELECT md5(COALESCE(string_agg(to_jsonb(r)::text, '' ORDER BY id), '')) AS value FROM roles r`;
    return row.value;
  };
  const fixture = (code) => {
    const id = randomUUID(); ids.push(id);
    return { id, username: `fixture_${code.toLowerCase()}`, email: `${code.toLowerCase()}@example.invalid`,
      password_hash: 'fixture-not-a-login-hash', role: code, is_active: code !== 'MANAGER',
      updated_at: new Date('2026-01-01T00:00:00Z'), first_name: 'Fixture', last_name: code,
      phone: '0000000000', avatar_url: '/uploads/avatars/fixture.webp' };
  };
  let started = false;
  try {
    assert.equal(await prisma.users.count(), 0, 'Database must be empty before this suite');
    assert.equal(await prisma.roles.count(), 0, 'Role table must be empty before this suite');
    assert.equal(await prisma.menus.count(), 0);
    assert.equal(await prisma.role_menus.count(), 0);
    started = true;
    await prisma.users.createMany({ data: codes.map(fixture) });
    const legacyBefore = await fingerprint();

    await t.test('dry run proposes changes without writing roles or users', async () => {
      const result = await backfillUserRoles(prisma);
      assert.equal(result.mode, 'dry-run');
      assert.equal(result.usersToLink, 3);
      assert.deepEqual(result.rolesToCreate, codes);
      assert.equal(await prisma.roles.count(), 0);
      assert.equal(await prisma.users.count({ where: { role_id: null } }), 3);
      assert.ok(legacyBefore === await fingerprint(), 'Legacy data changed');
    });

    await t.test('unknown legacy role aborts before creating roles or linking anyone', async () => {
      const row = await prisma.users.create({ data: fixture('UNMAPPED') });
      const before = await fingerprint(true);
      await assert.rejects(backfillUserRoles(prisma, { apply: true }), { code: 'UNKNOWN_LEGACY_ROLE' });
      assert.equal(await prisma.roles.count(), 0);
      assert.equal(await prisma.users.count({ where: { role_id: null } }), 4);
      assert.ok(before === await fingerprint(true), 'Failure changed user data');
      await prisma.users.delete({ where: { id: row.id } });
    });

    await t.test('a late database failure rolls back role creation and earlier user updates', async () => {
      await prisma.$executeRawUnsafe("CREATE FUNCTION backfill_fixture_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.role = 'USER' AND OLD.role_id IS NULL AND NEW.role_id IS NOT NULL THEN RAISE EXCEPTION 'Injected backfill fixture failure'; END IF; RETURN NEW; END; $$");
      try {
        await prisma.$executeRawUnsafe('CREATE TRIGGER backfill_fixture_failure BEFORE UPDATE OF role_id ON users FOR EACH ROW EXECUTE FUNCTION backfill_fixture_failure()');
        await assert.rejects(backfillUserRoles(prisma, { apply: true }));
        assert.equal(await prisma.roles.count(), 0);
        assert.equal(await prisma.users.count({ where: { role_id: null } }), 3);
        assert.ok(legacyBefore === await fingerprint(), 'Rollback changed legacy data');
      } finally {
        await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS backfill_fixture_failure ON users');
        await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS backfill_fixture_failure()');
      }
    });

    await t.test('creates the three roles and links active and inactive users', async () => {
      const result = await backfillUserRoles(prisma, { apply: true });
      assert.deepEqual(result.rolesCreated, codes);
      assert.equal(result.usersLinked, 3);
      assert.equal(result.activeAdmins, 1);
      const users = await prisma.users.findMany({ select: { role: true, role_record: { select: { code: true } } } });
      assert.ok(users.every((user) => user.role_record?.code === user.role));
      assert.ok(legacyBefore === await fingerprint(), 'Legacy fields/timestamps changed');
    });

    await t.test('rerun preserves role IDs, edited names, timestamps and existing user links', async () => {
      await prisma.roles.update({ where: { code: 'ADMIN' }, data: { name: 'Edited display name' } });
      const beforeUsers = await fingerprint(true), beforeRoles = await roleFingerprint();
      const result = await backfillUserRoles(prisma, { apply: true });
      assert.deepEqual(result.rolesCreated, []);
      assert.equal(result.usersLinked, 0);
      assert.equal(result.usersAlreadyLinked, 3);
      assert.ok(beforeUsers === await fingerprint(true), 'Rerun changed users');
      assert.ok(beforeRoles === await roleFingerprint(), 'Rerun overwrote roles');
    });

    await t.test('conflicting existing relation is rejected rather than reassigned silently', async () => {
      const target = await prisma.users.findUnique({ where: { username: 'fixture_user' } });
      const admin = await prisma.roles.findUnique({ where: { code: 'ADMIN' } });
      await prisma.users.update({ where: { id: target.id }, data: { role_id: admin.id } });
      try {
        const before = await fingerprint(true);
        await assert.rejects(backfillUserRoles(prisma, { apply: true }), { code: 'ROLE_LINK_MISMATCH' });
        assert.ok(before === await fingerprint(true), 'Mismatch was overwritten');
      } finally {
        await prisma.users.update({ where: { id: target.id }, data: { role_id: target.role_id } });
      }
    });

    await t.test('concurrent runs finish with one mapping per user and no duplicate roles', async () => {
      await prisma.users.updateMany({ where: { id: { in: ids } }, data: { role_id: null } });
      const results = await Promise.all([backfillUserRoles(prisma, { apply: true }), backfillUserRoles(prisma, { apply: true })]);
      assert.equal(results.reduce((sum, result) => sum + result.usersLinked, 0), 3);
      assert.equal(await prisma.roles.count(), 3);
      assert.equal(await prisma.users.count({ where: { role_id: null } }), 0);
      assert.ok(legacyBefore === await fingerprint(), 'Concurrency changed legacy fields');
    });
  } finally {
    if (started) {
      await prisma.users.deleteMany({ where: { id: { in: ids } } });
      await prisma.roles.deleteMany({ where: { code: { in: codes } } });
    }
    await prisma.$disconnect();
  }
});
