import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { MENU_REGISTRY, CRITICAL_MENU_IDS } from '../src/lib/menu-registry.js';
import { buildMenuAccess, menuSelect } from '../src/services/menu-access.service.js';

export class MenuSeedError extends Error {
  constructor(code, message) { super(message); this.name = 'MenuSeedError'; this.code = code; }
}

// Bootstrap, not a permission reset tool: once initialized, preserve edits and
// revoked ordinary grants. Partial/conflicting state needs an explicit review.
export async function seedMenuAccess(prisma, { apply = false } = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        if (apply) await tx.$executeRaw`LOCK TABLE "roles", "users", "menus", "role_menus" IN SHARE ROW EXCLUSIVE MODE`;
        else await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const roles = await tx.roles.findMany({ select: { id: true, code: true } });
        const byCode = new Map(roles.map((r) => [r.code, r.id]));
        if (['ADMIN', 'MANAGER', 'USER'].some((code) => !byCode.has(code))) {
          throw new MenuSeedError('ROLES_REQUIRED', 'Bootstrap the three initial roles first.');
        }
        if (!await tx.users.count({ where: { is_active: true, role_id: byCode.get('ADMIN') } })) {
          throw new MenuSeedError('ACTIVE_ADMIN_REQUIRED', 'An active ADMIN is required before menu bootstrap.');
        }
        const menus = await tx.menus.findMany({ select: menuSelect });
        const grants = await tx.role_menus.findMany({ select: { role_id: true, menu_id: true } });
        const existing = new Map(menus.map((m) => [m.id, m]));
        const initialized = MENU_REGISTRY.every((m) => existing.has(m.id));
        if (menus.length || grants.length) {
          if (!initialized || MENU_REGISTRY.some((m) => existing.get(m.id).menu_path !== m.path)) {
            throw new MenuSeedError('MENU_SEED_CONFLICT', 'Existing menus do not match bootstrap identities/paths. Review without resetting data.');
          }
          const admin = buildMenuAccess(menus, grants.filter((g) => g.role_id === byCode.get('ADMIN')).map((g) => g.menu_id));
          if (CRITICAL_MENU_IDS.some((id) => !admin.allowedPaths.includes(existing.get(id).menu_path))) {
            throw new MenuSeedError('CRITICAL_ACCESS_MISSING', 'Existing critical ADMIN access is unavailable. Review grants and active ancestors.');
          }
          return { mode: apply ? 'applied' : 'dry-run', initialized: true,
            menusToCreate: 0, grantsToCreate: 0, menusCreated: 0, grantsCreated: 0,
            existingMenusPreserved: menus.length, existingGrantsPreserved: grants.length };
        }
        const summary = { mode: apply ? 'applied' : 'dry-run', initialized: false,
          menusToCreate: 6, grantsToCreate: 9, menusCreated: 0, grantsCreated: 0 };
        if (!apply) return summary;
        const byKey = new Map(MENU_REGISTRY.map((m) => [m.key, m.id]));
        // Parent rows precede children, satisfying the immediate FK constraint.
        for (const menu of MENU_REGISTRY) {
          await tx.menus.create({ data: { id: menu.id, menu_name: menu.name, menu_path: menu.path,
            menu_icon: menu.icon, parent_id: menu.parent ? byKey.get(menu.parent) : null,
            sort_order: menu.order, is_active: true } });
        }
        const data = ['ADMIN', 'MANAGER', 'USER'].flatMap((code) => MENU_REGISTRY
          .filter((m) => m.path && (code === 'ADMIN' || ['dashboard', 'profile'].includes(m.key)))
          .map((m) => ({ role_id: byCode.get(code), menu_id: m.id })));
        const inserted = await tx.role_menus.createMany({ data });
        if (inserted.count !== 9) throw new MenuSeedError('INCOMPLETE_MENU_SEED', 'Menu bootstrap was incomplete and rolled back.');
        return { ...summary, menusCreated: 6, grantsCreated: inserted.count };
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
    throw new MenuSeedError('INVALID_ARGUMENT', 'Use --dry-run (default) or --apply.');
  }
  const backend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  dotenv.config({ path: resolve(backend, '.env'), quiet: true });
  let url;
  try { url = new URL(process.env.DATABASE_URL); } catch {
    throw new MenuSeedError('INVALID_DATABASE_CONFIG', 'A valid local DATABASE_URL is required.');
  }
  if (process.env.NODE_ENV === 'production' || !['postgres:', 'postgresql:'].includes(url.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || !url.pathname.slice(1) || (url.searchParams.get('schema') || 'public') !== 'public') {
    throw new MenuSeedError('DEV_DATABASE_REQUIRED', 'Menu bootstrap supports a local public-schema development database only.');
  }
  const prisma = new PrismaClient({ log: [] });
  try { console.log(JSON.stringify({ success: true, ...await seedMenuAccess(prisma, { apply: args.includes('--apply') }) }, null, 2)); }
  finally { await prisma.$disconnect(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(JSON.stringify({ success: false, code: error instanceof MenuSeedError ? error.code : 'MENU_SEED_FAILED',
      message: error instanceof MenuSeedError ? error.message : 'Menu bootstrap failed. No partial bootstrap was committed.' }));
    process.exitCode = 1;
  });
}
