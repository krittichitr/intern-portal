import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { DevSeedError, devUserPlan, localDevCredentials, validateDevCredentials } from './dev-seed-credentials.mjs';

async function planChanges(tx, manifest) {
  const credentials = new Map((manifest?.accounts || []).map((account) => [account.username, account]));
  const roles = await tx.roles.findMany({ select: { id: true, code: true } });
  const roleIds = new Map(roles.map(({ id, code }) => [code, id]));
  if (['ADMIN', 'MANAGER', 'USER'].some((code) => !roleIds.has(code))) {
    throw new DevSeedError('ROLES_REQUIRED', 'Run the role bootstrap/backfill before seeding users.');
  }
  const existing = await tx.users.findMany({
    where: { OR: [{ username: { in: devUserPlan.map((u) => u.username) } },
      { email: { in: devUserPlan.map((u) => u.email) } },
      { id: { in: [...credentials.values()].map((u) => u.id) } }] },
    select: { id: true, username: true, email: true },
  });
  const pending = [];
  for (const row of devUserPlan) {
    const account = credentials.get(row.username);
    // Stable IDs preserve users even if their name, email or role was edited.
    if (account && existing.some((user) => user.id === account.id)) continue;
    if (existing.some((user) => user.username === row.username || user.email === row.email)) {
      throw new DevSeedError('SEED_IDENTITY_CONFLICT', 'A planned seed username/email already exists without its recorded seed identity. No users were overwritten.');
    }
    pending.push(row);
  }
  return { pending, roleIds, existingCount: devUserPlan.length - pending.length };
}

export async function seedDevUsers(prisma, { apply = false, manifest = null } = {}) {
  if (manifest) validateDevCredentials(manifest);
  const preview = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    return planChanges(tx, manifest);
  });
  const summary = { mode: apply ? 'applied' : 'dry-run', plannedUsers: devUserPlan.length,
    usersToCreate: preview.pending.length, usersCreated: 0, usersPreserved: preview.existingCount };
  if (!apply) return summary;
  if (!manifest) throw new DevSeedError('CREDENTIALS_REQUIRED', 'Create local seed credentials before applying.');
  const accounts = new Map(manifest.accounts.map((account) => [account.username, account]));
  // Hash outside the locked transaction. Never log plaintext or password hashes.
  const hashes = new Map();
  for (const row of preview.pending) {
    const account = accounts.get(row.username);
    if (account.existingOnly) throw new DevSeedError('EXISTING_ACCOUNT_REQUIRED', 'A preserved account is missing. Restore its identity explicitly; its password will not be reset.');
    hashes.set(row.username, await bcrypt.hash(account.password, 12));
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`LOCK TABLE "roles", "users" IN SHARE ROW EXCLUSIVE MODE`;
        const current = await planChanges(tx, manifest);
        if (current.pending.some(({ username }) => !hashes.has(username))) {
          throw new DevSeedError('SEED_PLAN_CHANGED', 'Seed data changed during preparation. Rerun the command.');
        }
        if (current.pending.length) {
          const inserted = await tx.users.createMany({ data: current.pending.map((row) => ({
            ...row, id: accounts.get(row.username).id, role_id: current.roleIds.get(row.role),
            password_hash: hashes.get(row.username), is_active: true, updated_at: new Date(),
          })) });
          if (inserted.count !== current.pending.length) throw new DevSeedError('INCOMPLETE_SEED', 'User insertion was incomplete. The transaction was rolled back.');
        }
        return { ...summary, usersToCreate: current.pending.length, usersCreated: current.pending.length,
          usersPreserved: current.existingCount, totalUsers: await tx.users.count() };
      }, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 });
    } catch (error) {
      const retryable = error.code === 'P2034' || ['40001', '40P01'].includes(error.meta?.code);
      if (!retryable || attempt === 2) throw error;
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some((arg) => !['--apply', '--dry-run'].includes(arg))) {
    throw new DevSeedError('INVALID_ARGUMENT', 'Use --dry-run (default) or --apply.');
  }
  const backend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  dotenv.config({ path: resolve(backend, '.env'), quiet: true });
  let url;
  try { url = new URL(process.env.DATABASE_URL); } catch {
    throw new DevSeedError('INVALID_DATABASE_CONFIG', 'A valid local development DATABASE_URL is required.');
  }
  if (process.env.NODE_ENV === 'production' || !['postgres:', 'postgresql:'].includes(url.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || !url.pathname.slice(1) || (url.searchParams.get('schema') || 'public') !== 'public') {
    throw new DevSeedError('DEV_DATABASE_REQUIRED', 'This seed command supports a local public-schema development database only.');
  }
  const directory = resolve(backend, '.local');
  const credentialsPath = resolve(directory, 'dev-seed-credentials.json');
  const ignored = spawnSync('git', ['check-ignore', '--no-index', '--quiet', '--', credentialsPath], { cwd: backend, stdio: 'ignore' });
  const tracked = spawnSync('git', ['ls-files', '--error-unmatch', '--', credentialsPath], { cwd: backend, stdio: 'ignore' });
  if (ignored.status !== 0) throw new DevSeedError('CREDENTIALS_NOT_IGNORED', 'Configure the local seed credential path to be ignored by Git first.');
  if (tracked.status !== 1) throw new DevSeedError('TRACKED_CREDENTIALS_FILE', 'Seed credentials must not be tracked by Git.');
  const prisma = new PrismaClient({ log: [] });
  try {
    let manifest = await localDevCredentials(directory);
    // Check conflicts before generating credentials for any new accounts.
    await seedDevUsers(prisma, { manifest });
    if (args.includes('--apply')) manifest = await localDevCredentials(directory, { create: true });
    const result = await seedDevUsers(prisma, { manifest, apply: args.includes('--apply') });
    console.log(JSON.stringify({ success: true, ...result,
      ...(args.includes('--apply') ? { credentialsFile: credentialsPath } : {}),
    }, null, 2));
  } finally { await prisma.$disconnect(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(JSON.stringify({ success: false,
      code: error instanceof DevSeedError ? error.code : 'DEV_SEED_FAILED',
      message: error instanceof DevSeedError ? error.message : 'Development seed failed. No existing users were reset. Inspect configuration and local credential file permissions.',
    }));
    process.exitCode = 1;
  });
}
