import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

const definitions = Object.freeze([
  { code: 'ADMIN', name: 'Admin' },
  { code: 'MANAGER', name: 'Manager' },
  { code: 'USER', name: 'User' },
]);

export class RoleBackfillError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RoleBackfillError';
    this.code = code;
  }
}

// Bootstrap only: unknown legacy codes require an explicitly reviewed mapping.
// Never normalize an unknown code into a more privileged role silently.
export async function backfillUserRoles(prisma, { apply = false } = {}) {
  const knownCodes = new Set(definitions.map(({ code }) => code));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        if (apply) {
          // Short bootstrap transaction; readers continue, competing writes wait.
          await tx.$executeRaw`LOCK TABLE "roles", "users" IN SHARE ROW EXCLUSIVE MODE`;
        } else {
          await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        }
        const roles = await tx.roles.findMany({ select: { id: true, code: true } });
        const byId = new Map(roles.map((role) => [role.id, role.code]));
        const byCode = new Map(roles.map((role) => [role.code, role.id]));
        // Raw reads keep this upgrade tool compatible with the pre-cutover DB,
        // where role_id can still be null despite the final Prisma model.
        const users = await tx.$queryRaw`SELECT "id", "role", "role_id" FROM "users"`;

        if (users.some(({ role }) => !knownCodes.has(role))) {
          throw new RoleBackfillError('UNKNOWN_LEGACY_ROLE', 'Unknown legacy role found. Review the role mapping before applying.');
        }
        if (users.some(({ role, role_id }) => role_id !== null && byId.get(role_id) !== role)) {
          throw new RoleBackfillError('ROLE_LINK_MISMATCH', 'A user role relation disagrees with the legacy role. Review it before applying.');
        }

        const missing = definitions.filter(({ code }) => !byCode.has(code));
        const usersToLink = users.filter(({ role_id }) => role_id === null).length;
        const summary = {
          mode: apply ? 'applied' : 'dry-run',
          roleCodes: definitions.map(({ code }) => code),
          rolesToCreate: missing.map(({ code }) => code),
          rolesCreated: [],
          totalUsers: users.length,
          usersToLink,
          usersLinked: 0,
          usersAlreadyLinked: users.length - usersToLink,
        };
        if (!apply) return summary;

        for (const data of missing) {
          const role = await tx.roles.create({ data, select: { id: true } });
          byCode.set(data.code, role.id);
          summary.rolesCreated.push(data.code);
        }
        for (const { code } of definitions) {
          // Preserve all legacy fields/timestamps; parameterize both values.
          summary.usersLinked += await tx.$executeRaw`
            UPDATE "users" SET "role_id" = ${byCode.get(code)}::uuid
            WHERE "role" = ${code} AND "role_id" IS NULL`;
        }
        const [unmapped] = await tx.$queryRaw`SELECT count(*)::int AS "count" FROM "users" WHERE "role_id" IS NULL`;
        if (summary.usersLinked !== usersToLink || unmapped.count) {
          throw new RoleBackfillError('INCOMPLETE_BACKFILL', 'Role mapping did not complete. The transaction was rolled back.');
        }
        summary.activeAdmins = await tx.users.count({
          where: { is_active: true, role_record: { is: { code: 'ADMIN' } } },
        });
        return summary;
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
    throw new RoleBackfillError('INVALID_ARGUMENT', 'Use --dry-run (default) or --apply.');
  }
  const backend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  dotenv.config({ path: resolve(backend, '.env'), quiet: true });
  let url;
  try { url = new URL(process.env.DATABASE_URL); } catch {
    throw new RoleBackfillError('INVALID_DATABASE_CONFIG', 'A valid local DATABASE_URL is required.');
  }
  if (process.env.NODE_ENV === 'production' || !['postgres:', 'postgresql:'].includes(url.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || !url.pathname.slice(1) || (url.searchParams.get('schema') || 'public') !== 'public') {
    throw new RoleBackfillError('DEV_DATABASE_REQUIRED', 'This bootstrap command supports a local public-schema development database only.');
  }
  const prisma = new PrismaClient({ log: [] });
  try {
    const result = await backfillUserRoles(prisma, { apply: args.includes('--apply') });
    console.log(JSON.stringify({ success: true, ...result }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    const controlled = error instanceof RoleBackfillError;
    console.error(JSON.stringify({ success: false,
      code: controlled ? error.code : 'BACKFILL_FAILED',
      message: controlled ? error.message : 'Role backfill failed; inspect configuration and database availability. No partial transaction was committed.',
    }));
    process.exitCode = 1;
  });
}
