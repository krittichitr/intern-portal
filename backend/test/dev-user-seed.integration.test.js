import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, stat, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { seedDevUsers } from '../scripts/seed-dev-users.mjs';
import { devUserPlan, localDevCredentials } from '../scripts/dev-seed-credentials.mjs';
import { backfillUserRoles } from '../scripts/backfill-user-roles.mjs';

test('Development credential files are private, stable and reject symlinks', async () => {
  const base = await mkdtemp(join(tmpdir(), 'login-seed-credentials-'));
  try {
    const directory = join(base, 'private');
    assert.equal(await localDevCredentials(directory), null);
    const manifest = await localDevCredentials(directory, { create: true });
    const file = join(directory, 'dev-seed-credentials.json');
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.equal(manifest.accounts.length, 18);
    assert.ok(manifest.accounts.every((a) => a.password === `password${a.username.match(/\d+$/)[0]}`));
    const before = await readFile(file, 'utf8');
    await localDevCredentials(directory, { create: true });
    assert.ok(before === await readFile(file, 'utf8'), 'Rerun changed local credentials');
    await symlink(directory, join(base, 'linked-directory'));
    await assert.rejects(localDevCredentials(join(base, 'linked-directory')), { code: 'UNSAFE_CREDENTIALS_DIRECTORY' });
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('Eighteen-user development seed on an explicitly configured empty disposable database', {
  skip: !process.env.RBAC_TEST_DATABASE_URL,
}, async (t) => {
  const url = new URL(process.env.RBAC_TEST_DATABASE_URL);
  const name = decodeURIComponent(url.pathname.slice(1));
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.match(name, /^login_rbac_test_[a-z0-9_]+$/);
  assert.equal(url.searchParams.get('schema') || 'public', 'public');
  if (process.env.DATABASE_URL) assert.notEqual(name, decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1)));
  const prisma = new PrismaClient({ datasourceUrl: url.toString(), log: [] });
  const directory = await mkdtemp(join(tmpdir(), 'login-seed-db-'));
  const manifest = await localDevCredentials(directory, { create: true });
  const seedIds = manifest.accounts.map(({ id }) => id);
  const legacyId = randomUUID(), collisionId = randomUUID();
  let started = false;
  try {
    assert.equal(await prisma.users.count(), 0, 'Test database must start empty');
    assert.equal(await prisma.roles.count(), 0);
    started = true;
    await prisma.users.create({ data: { id: legacyId, username: 'existing_admin', email: 'existing_admin@example.invalid',
      password_hash: 'fixture-not-a-login-hash', role: 'ADMIN', updated_at: new Date('2026-01-01T00:00:00Z'), first_name: 'Existing' } });
    await backfillUserRoles(prisma, { apply: true });
    const [legacyBefore] = await prisma.$queryRaw`SELECT md5(to_jsonb(u)::text) AS value FROM users u WHERE id=${legacyId}::uuid`;

    await t.test('plan has exactly 3 admins, 5 managers and 10 users; dry run writes nothing', async () => {
      assert.equal(devUserPlan.length, 18);
      for (const [role, count] of [['ADMIN', 3], ['MANAGER', 5], ['USER', 10]]) assert.equal(devUserPlan.filter((u) => u.role === role).length, count);
      const result = await seedDevUsers(prisma);
      assert.equal(result.usersToCreate, 18);
      assert.equal(await prisma.users.count(), 1);
    });

    await t.test('missing bootstrap role stops the seed without adding users', async () => {
      const userRole = await prisma.roles.findUnique({ where: { code: 'USER' } });
      await prisma.roles.delete({ where: { id: userRole.id } });
      try {
        await assert.rejects(seedDevUsers(prisma, { apply: true, manifest }), { code: 'ROLES_REQUIRED' });
        assert.equal(await prisma.users.count(), 1);
      } finally { await prisma.roles.create({ data: userRole }); }
    });

    await t.test('unowned username/email collisions are rejected without overwriting anyone', async () => {
      await prisma.users.create({ data: { id: collisionId, username: 'user01', email: 'collision@example.invalid',
        password_hash: 'fixture-not-a-login-hash', role: 'USER', updated_at: new Date() } });
      try {
        await assert.rejects(seedDevUsers(prisma, { apply: true, manifest }), { code: 'SEED_IDENTITY_CONFLICT' });
        assert.equal(await prisma.users.count(), 2);
      } finally { await prisma.users.delete({ where: { id: collisionId } }); }
    });

    await t.test('database failure rolls back the entire inserted user set', async () => {
      await prisma.$executeRawUnsafe("CREATE FUNCTION seed_fixture_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.username = 'user10' THEN RAISE EXCEPTION 'Injected seed fixture failure'; END IF; RETURN NEW; END; $$");
      try {
        await prisma.$executeRawUnsafe('CREATE TRIGGER seed_fixture_failure BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION seed_fixture_failure()');
        await assert.rejects(seedDevUsers(prisma, { apply: true, manifest }));
        assert.equal(await prisma.users.count(), 1);
      } finally {
        await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS seed_fixture_failure ON users');
        await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS seed_fixture_failure()');
      }
    });

    await t.test('creates eighteen linked accounts with bcrypt passwords while preserving the original user', async () => {
      const result = await seedDevUsers(prisma, { apply: true, manifest });
      assert.equal(result.usersCreated, 18);
      assert.equal(result.totalUsers, 19);
      const users = await prisma.users.findMany({ where: { id: { in: seedIds } }, select: { id: true, role: true, password_hash: true, role_record: { select: { code: true } } } });
      assert.equal(users.length, 18);
      assert.ok(users.every((u) => u.role === u.role_record.code && bcrypt.getRounds(u.password_hash) === 12));
      for (const role of ['ADMIN', 'MANAGER', 'USER']) {
        const account = manifest.accounts.find((a) => a.role === role);
        const user = users.find((u) => u.id === account.id);
        assert.ok(await bcrypt.compare(account.password, user.password_hash), 'Stored password did not verify');
      }
      const [after] = await prisma.$queryRaw`SELECT md5(to_jsonb(u)::text) AS value FROM users u WHERE id=${legacyId}::uuid`;
      assert.ok(after.value === legacyBefore.value, 'Original admin changed');
    });

    await t.test('rerun preserves edited identity, profile, role and password without duplicating users', async () => {
      const account = manifest.accounts.find((a) => a.username === 'manager01');
      const admin = await prisma.roles.findUnique({ where: { code: 'ADMIN' } });
      await prisma.users.update({ where: { id: account.id }, data: { username: 'edited_seed_user', email: 'edited_seed_user@example.invalid', first_name: 'Edited', role: 'ADMIN', role_id: admin.id, password_hash: await bcrypt.hash('test-only-replacement-not-a-real-password', 4) } });
      const [before] = await prisma.$queryRaw`SELECT md5(COALESCE(string_agg(to_jsonb(u)::text, '' ORDER BY id),'')) AS value FROM users u`;
      const result = await seedDevUsers(prisma, { apply: true, manifest });
      const [after] = await prisma.$queryRaw`SELECT md5(COALESCE(string_agg(to_jsonb(u)::text, '' ORDER BY id),'')) AS value FROM users u`;
      assert.equal(result.usersCreated, 0);
      assert.equal(result.usersPreserved, 18);
      assert.equal(await prisma.users.count(), 19);
      assert.ok(before.value === after.value, 'Rerun overwrote edited data');
    });

    await t.test('concurrent runs sharing recorded identities do not duplicate users', async () => {
      await prisma.users.deleteMany({ where: { id: { in: seedIds } } });
      const results = await Promise.all([seedDevUsers(prisma, { apply: true, manifest }), seedDevUsers(prisma, { apply: true, manifest })]);
      assert.equal(results.reduce((n, r) => n + r.usersCreated, 0), 18);
      assert.equal(await prisma.users.count(), 19);
      assert.equal(await prisma.users.count({ where: { role_id: null } }), 0);
    });

    await t.test('preserved accounts with unknown passwords are never reset or recreated', async () => {
      const preserved = structuredClone(manifest);
      const account = preserved.accounts.find((a) => a.username === 'admin01');
      account.existingOnly = true; account.password = null;
      const result = await seedDevUsers(prisma, { apply: true, manifest: preserved });
      assert.equal(result.usersCreated, 0);
      await prisma.users.delete({ where: { id: account.id } });
      await assert.rejects(seedDevUsers(prisma, { apply: true, manifest: preserved }), { code: 'EXISTING_ACCOUNT_REQUIRED' });
    });
  } finally {
    if (started) {
      await prisma.users.deleteMany({ where: { id: { in: [...seedIds, legacyId, collisionId] } } });
      await prisma.roles.deleteMany({ where: { code: { in: ['ADMIN', 'MANAGER', 'USER'] } } });
    }
    await prisma.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
});
