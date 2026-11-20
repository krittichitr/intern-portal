import { prisma } from '../lib/prisma.js';
import { hasConfiguredRole } from '../lib/public-user.js';
import { MENU_REGISTRY, MENU_PATHS, CRITICAL_MENU_IDS } from '../lib/menu-registry.js';
import { buildMenuAccess } from './menu-access.service.js';
import { MenuError } from '../validators/menu-input.js';

export const managementMenuSelect = {
  id: true, menu_name: true, menu_path: true, menu_icon: true, parent_id: true,
  sort_order: true, is_active: true, created_at: true, updated_at: true,
};
export function toMenu(menu) {
  return { id: menu.id, menuName: menu.menu_name, menuPath: menu.menu_path, menuIcon: menu.menu_icon,
    parentId: menu.parent_id, sortOrder: menu.sort_order, isActive: menu.is_active,
    createdAt: menu.created_at, updatedAt: menu.updated_at };
}

function validateHierarchy(menus) {
  const byId = new Map(menus.map((m) => [m.id, m]));
  const complete = new Set();
  for (const menu of menus) {
    const trail = new Set(); let id = menu.id;
    while (id !== null && !complete.has(id)) {
      if (trail.has(id)) throw new MenuError(400, 'MENU_CYCLE', 'A menu cannot be its own ancestor');
      const current = byId.get(id);
      if (!current) throw new MenuError(400, 'INVALID_PARENT', 'Parent menu does not exist');
      trail.add(id); id = current.parent_id;
    }
    for (const item of trail) complete.add(item);
  }
}

export function protectCriticalAccess(menus, adminGrants) {
  const access = buildMenuAccess(menus, adminGrants);
  for (const id of CRITICAL_MENU_IDS) {
    const expected = MENU_REGISTRY.find((m) => m.id === id);
    const menu = menus.find((m) => m.id === id);
    if (!menu || menu.menu_path !== expected.path || !adminGrants.includes(id)
        || !access.allowedPaths.includes(expected.path)) {
      throw new MenuError(409, 'CRITICAL_MENU_PROTECTED', 'Critical ADMIN menus, paths and active ancestors must remain accessible');
    }
  }
}

export async function listMenus() {
  return (await prisma.menus.findMany({ select: managementMenuSelect,
    orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] })).map(toMenu);
}

export async function mutateMenu(actorId, operation, id, data) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Same order as bootstrap; future Role/Grant mutations must participate
        // in this protocol. Small management writes serialize across all RBAC
        // tables, preventing concurrent moves/grant changes from breaking checks.
        await tx.$executeRaw`LOCK TABLE "roles", "users", "menus", "role_menus" IN SHARE ROW EXCLUSIVE MODE`;
        const actor = await tx.users.findUnique({ where: { id: actorId },
          select: { is_active: true, role_record: { select: { id: true, code: true } } } });
        if (!actor?.is_active) throw new MenuError(401, 'UNAUTHORIZED', 'Unauthorized');
        if (!hasConfiguredRole(actor)) throw new MenuError(403, 'RBAC_NOT_READY', 'Your account role is not configured. Contact an administrator.');
        if (actor.role_record.code !== 'ADMIN') throw new MenuError(403, 'FORBIDDEN', 'Forbidden');
        const menus = await tx.menus.findMany({ select: managementMenuSelect });
        const grants = await tx.role_menus.findMany({ where: { role_id: actor.role_record.id }, select: { menu_id: true } });
        const adminGrants = grants.map((g) => g.menu_id);
        if (!buildMenuAccess(menus, adminGrants).allowedPaths.includes(MENU_PATHS.menus)) {
          throw new MenuError(403, 'FORBIDDEN', 'Forbidden');
        }
        const current = menus.find((m) => m.id === id);
        if (operation !== 'create' && !current) throw new MenuError(404, 'MENU_NOT_FOUND', 'Menu not found');
        let projected;
        if (operation === 'delete') {
          if (CRITICAL_MENU_IDS.includes(id)) throw new MenuError(409, 'CRITICAL_MENU_PROTECTED', 'Critical menus cannot be deleted');
          if (menus.some((m) => m.parent_id === id)) throw new MenuError(409, 'MENU_HAS_CHILDREN', 'Move or remove child menus before deleting this menu');
          if (await tx.role_menus.count({ where: { menu_id: id } })) {
            throw new MenuError(409, 'MENU_ASSIGNED', 'Remove all role assignments before deleting this menu');
          }
          projected = menus.filter((m) => m.id !== id);
        } else {
          const candidate = operation === 'create' ? { id, ...data } : { ...current, ...data };
          projected = operation === 'create' ? [...menus, candidate] : menus.map((m) => m.id === id ? candidate : m);
          if (candidate.menu_path !== null && menus.some((m) => m.id !== id && m.menu_path === candidate.menu_path)) {
            throw new MenuError(409, 'MENU_PATH_CONFLICT', 'Menu path already exists');
          }
        }
        validateHierarchy(projected);
        protectCriticalAccess(projected, adminGrants);
        let result = null;
        if (operation === 'delete') await tx.menus.delete({ where: { id } });
        else result = operation === 'create'
          ? await tx.menus.create({ data: { id, ...data }, select: managementMenuSelect })
          : await tx.menus.update({ where: { id }, data, select: managementMenuSelect });
        // Validate persisted state before COMMIT as well as the proposed change.
        const persisted = await tx.menus.findMany({ select: managementMenuSelect });
        const persistedGrants = await tx.role_menus.findMany({ where: { role_id: actor.role_record.id }, select: { menu_id: true } });
        validateHierarchy(persisted);
        protectCriticalAccess(persisted, persistedGrants.map((g) => g.menu_id));
        return result ? toMenu(result) : null;
      }, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 });
    } catch (error) {
      const retryable = error.code === 'P2034' || ['40001', '40P01'].includes(error.meta?.code);
      if (retryable && attempt < 2) continue;
      if (retryable) throw new MenuError(409, 'MENU_WRITE_CONFLICT', 'Concurrent changes detected; please retry');
      if (error.code === 'P2002') throw new MenuError(409, 'MENU_PATH_CONFLICT', 'Menu path already exists');
      if (error.code === 'P2003') throw new MenuError(409, 'MENU_DEPENDENCY_CONFLICT', 'Menu relationships changed; reload before retrying');
      if (error.code === 'P2025') throw new MenuError(404, 'MENU_NOT_FOUND', 'Menu not found');
      throw error;
    }
  }
}
