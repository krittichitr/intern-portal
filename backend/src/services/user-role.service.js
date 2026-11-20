import { prisma } from '../lib/prisma.js';
import { publicUserSelect } from '../config.js';
import { hasConfiguredRole, toPublicUser } from '../lib/public-user.js';
import { MENU_PATHS } from '../lib/menu-registry.js';
import { buildMenuAccess } from './menu-access.service.js';
import { managementMenuSelect, protectCriticalAccess } from './menu-management.service.js';
import { UserRoleError } from '../validators/user-role-input.js';

export async function assignUserRole(actorId, targetId, destinationId) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Serialize with Role/Grant/Menu mutations and bootstrap in one order.
        await tx.$executeRaw`LOCK TABLE "roles", "users", "menus", "role_menus" IN SHARE ROW EXCLUSIVE MODE`;
        const actor = await tx.users.findUnique({ where: { id: actorId },
          select: { is_active: true, role_record: { select: { id: true, code: true } } } });
        if (!actor?.is_active) throw new UserRoleError(401, 'UNAUTHORIZED', 'Unauthorized');
        if (!hasConfiguredRole(actor)) throw new UserRoleError(403, 'RBAC_NOT_READY', 'Your account role is not configured. Contact an administrator.');
        if (actor.role_record.code !== 'ADMIN') throw new UserRoleError(403, 'FORBIDDEN', 'Forbidden');
        const menus = await tx.menus.findMany({ select: managementMenuSelect });
        const adminGrants = (await tx.role_menus.findMany({ where: { role_id: actor.role_record.id }, select: { menu_id: true } })).map((g) => g.menu_id);
        if (!buildMenuAccess(menus, adminGrants).allowedPaths.includes(MENU_PATHS.users)) throw new UserRoleError(403, 'FORBIDDEN', 'Forbidden');
        const select = { ...publicUserSelect, role_id: true, is_active: true };
        const target = await tx.users.findUnique({ where: { id: targetId }, select });
        if (!target) throw new UserRoleError(404, 'USER_NOT_FOUND', 'User not found');
        const destination = await tx.roles.findUnique({ where: { id: destinationId }, select: { id: true, code: true } });
        if (!destination) throw new UserRoleError(404, 'ROLE_NOT_FOUND', 'Role not found');
        if (target.is_active && target.role_record?.code === 'ADMIN' && destination.code !== 'ADMIN') {
          const activeAdmins = await tx.users.count({ where: { is_active: true, role_record: { is: { code: 'ADMIN' } } } });
          if (activeAdmins <= 1) throw new UserRoleError(409, 'LAST_ACTIVE_ADMIN', 'Assign another active administrator before changing the last active ADMIN');
        }
        // Keep the transitional legacy column consistent, but authorization
        // always uses role_id -> roles.code, never the legacy string.
        const user = target.role_id === destination.id && target.role === destination.code ? target
          : await tx.users.update({ where: { id: targetId },
            data: { role_id: destination.id, role: destination.code, updated_at: new Date() }, select });
        if (user.role_id !== destination.id || !hasConfiguredRole(user) || user.role_record.code !== destination.code) {
          throw new UserRoleError(409, 'ROLE_ASSIGNMENT_CONFLICT', 'Role mapping changed; reload before retrying');
        }
        // Check actual persisted state before COMMIT, not only a pre-write count.
        if (!await tx.users.count({ where: { is_active: true, role_record: { is: { code: 'ADMIN' } } } })) {
          throw new UserRoleError(409, 'LAST_ACTIVE_ADMIN', 'At least one active ADMIN must remain');
        }
        const persistedMenus = await tx.menus.findMany({ select: managementMenuSelect });
        const persistedGrants = await tx.role_menus.findMany({ where: { role_id: actor.role_record.id }, select: { menu_id: true } });
        protectCriticalAccess(persistedMenus, persistedGrants.map((g) => g.menu_id));
        return toPublicUser(user);
      }, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 });
    } catch (error) {
      const retryable = error.code === 'P2034' || ['40001', '40P01'].includes(error.meta?.code);
      if (retryable && attempt < 2) continue;
      if (retryable) throw new UserRoleError(409, 'ROLE_ASSIGNMENT_CONFLICT', 'Concurrent changes detected; please retry');
      if (error.code === 'P2003') throw new UserRoleError(409, 'ROLE_ASSIGNMENT_CONFLICT', 'Role relationships changed; reload before retrying');
      if (error.code === 'P2025') throw new UserRoleError(404, 'USER_NOT_FOUND', 'User not found');
      throw error;
    }
  }
}
