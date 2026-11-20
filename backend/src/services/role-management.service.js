import { prisma } from '../lib/prisma.js';
import { hasConfiguredRole } from '../lib/public-user.js';
import { MENU_PATHS } from '../lib/menu-registry.js';
import { buildMenuAccess } from './menu-access.service.js';
import { managementMenuSelect, protectCriticalAccess } from './menu-management.service.js';
import { RoleError } from '../validators/role-input.js';

export const roleSelect = { id: true, code: true, name: true, created_at: true, updated_at: true };
export function toRole(role) {
  return { id: role.id, code: role.code, name: role.name, createdAt: role.created_at, updatedAt: role.updated_at };
}
export async function listRoles() {
  return (await prisma.roles.findMany({ select: roleSelect, orderBy: [{ code: 'asc' }, { id: 'asc' }] })).map(toRole);
}
export async function getRoleMenus(id) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const role = await tx.roles.findUnique({ where: { id }, select: roleSelect });
    if (!role) throw new RoleError(404, 'ROLE_NOT_FOUND', 'Role not found');
    const grants = await tx.role_menus.findMany({ where: { role_id: id }, select: { menu_id: true }, orderBy: { menu_id: 'asc' } });
    return { role: toRole(role), menuIds: grants.map((g) => g.menu_id) };
  }, { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 10000 });
}

export async function mutateRole(actorId, operation, id, data) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Participate in the same locking order as Menu writes and bootstrap.
        await tx.$executeRaw`LOCK TABLE "roles", "users", "menus", "role_menus" IN SHARE ROW EXCLUSIVE MODE`;
        const actor = await tx.users.findUnique({ where: { id: actorId },
          select: { is_active: true, role_record: { select: { id: true, code: true } } } });
        if (!actor?.is_active) throw new RoleError(401, 'UNAUTHORIZED', 'Unauthorized');
        if (!hasConfiguredRole(actor)) throw new RoleError(403, 'RBAC_NOT_READY', 'Your account role is not configured. Contact an administrator.');
        if (actor.role_record.code !== 'ADMIN') throw new RoleError(403, 'FORBIDDEN', 'Forbidden');
        const menus = await tx.menus.findMany({ select: managementMenuSelect });
        const adminGrants = (await tx.role_menus.findMany({ where: { role_id: actor.role_record.id }, select: { menu_id: true } })).map((g) => g.menu_id);
        if (!buildMenuAccess(menus, adminGrants).allowedPaths.includes(MENU_PATHS.roles)) throw new RoleError(403, 'FORBIDDEN', 'Forbidden');
        const role = operation === 'create' ? null : await tx.roles.findUnique({ where: { id }, select: roleSelect });
        if (operation !== 'create' && !role) throw new RoleError(404, 'ROLE_NOT_FOUND', 'Role not found');

        let result;
        if (operation === 'delete') {
          if (role.code === 'ADMIN') throw new RoleError(409, 'ADMIN_ROLE_PROTECTED', 'The system ADMIN role cannot be deleted');
          if (await tx.users.count({ where: { role_id: id } })) throw new RoleError(409, 'ROLE_IN_USE', 'Move all users, including inactive users, to another role before deleting');
          // Only the deleted role's links are removed; menu records are preserved.
          await tx.role_menus.deleteMany({ where: { role_id: id } });
          await tx.roles.delete({ where: { id } }); result = null;
        } else if (operation === 'assign') {
          const existingIds = new Set(menus.map((m) => m.id));
          if (data.some((menuId) => !existingIds.has(menuId))) throw new RoleError(400, 'INVALID_MENU_IDS', 'One or more menus do not exist');
          if (role.code === 'ADMIN') protectCriticalAccess(menus, data);
          await tx.role_menus.deleteMany({ where: { role_id: id } });
          if (data.length) await tx.role_menus.createMany({ data: data.map((menuId) => ({ role_id: id, menu_id: menuId })) });
          result = { role: toRole(role), menuIds: [...data].sort() };
        } else {
          const updated = operation === 'create'
            ? await tx.roles.create({ data: { id, ...data }, select: roleSelect })
            : await tx.roles.update({ where: { id }, data, select: roleSelect });
          result = { role: toRole(updated) };
        }
        // Invariant shared with Menu management: check actual persisted state
        // before committing, even when the target is an ordinary custom role.
        const admin = await tx.roles.findUnique({ where: { code: 'ADMIN' }, select: { id: true } });
        if (!admin) throw new RoleError(409, 'ADMIN_ROLE_PROTECTED', 'The system ADMIN role must remain available');
        const persistedMenus = await tx.menus.findMany({ select: managementMenuSelect });
        const persistedGrants = await tx.role_menus.findMany({ where: { role_id: admin.id }, select: { menu_id: true } });
        protectCriticalAccess(persistedMenus, persistedGrants.map((g) => g.menu_id));
        return result;
      }, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 });
    } catch (error) {
      const retryable = error.code === 'P2034' || ['40001', '40P01'].includes(error.meta?.code);
      if (retryable && attempt < 2) continue;
      if (retryable) throw new RoleError(409, 'ROLE_WRITE_CONFLICT', 'Concurrent changes detected; please retry');
      if (error.code === 'P2002') throw new RoleError(409, 'ROLE_CODE_CONFLICT', 'Role code already exists');
      if (error.code === 'P2003') throw new RoleError(409, 'ROLE_IN_USE', 'Role relationships changed; reload before retrying');
      if (error.code === 'P2025') throw new RoleError(404, 'ROLE_NOT_FOUND', 'Role not found');
      throw error;
    }
  }
}
