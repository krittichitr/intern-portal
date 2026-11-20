import { prisma } from '../lib/prisma.js';
import { hasConfiguredRole } from '../lib/public-user.js';

export class MenuAccessError extends Error {
  constructor(status, code, message) {
    super(message); this.name = 'MenuAccessError'; this.status = status; this.code = code;
  }
}

export const menuSelect = {
  id: true, menu_name: true, menu_path: true, menu_icon: true,
  parent_id: true, sort_order: true, is_active: true,
};

// One policy for the future Sidebar response and backend route guards.
// Missing parents, cycles and inactive ancestors fail closed for that branch.
export function buildMenuAccess(menus, grantedIds) {
  const byId = new Map(menus.map((menu) => [menu.id, menu]));
  const effective = new Map();
  function activeBranch(id) {
    const trail = [], seen = new Set();
    let current = id, valid = true;
    while (current !== null) {
      if (effective.has(current)) { valid = effective.get(current); break; }
      const menu = byId.get(current);
      if (!menu || !menu.is_active || seen.has(current)) { valid = false; break; }
      seen.add(current); trail.push(current); current = menu.parent_id;
    }
    for (const item of trail) effective.set(item, valid);
    return valid;
  }
  const granted = new Set(grantedIds);
  const visible = new Set();
  for (const id of granted) {
    const menu = byId.get(id);
    if (!menu?.menu_path || !activeBranch(id)) continue;
    let current = id;
    while (current !== null && !visible.has(current)) {
      visible.add(current); current = byId.get(current).parent_id;
    }
  }
  const nodes = new Map([...visible].map((id) => {
    const menu = byId.get(id);
    const canAccess = granted.has(id) && Boolean(menu.menu_path);
    return [id, { id, menuName: menu.menu_name, menuPath: canAccess ? menu.menu_path : null,
      menuIcon: menu.menu_icon, parentId: menu.parent_id, sortOrder: menu.sort_order, canAccess, children: [] }];
  }));
  const tree = [];
  for (const node of nodes.values()) {
    if (node.parentId === null) tree.push(node);
    else nodes.get(node.parentId).children.push(node);
  }
  const compare = (a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  tree.sort(compare);
  for (const node of nodes.values()) node.children.sort(compare);
  const allowedPaths = [], pending = [...tree].reverse();
  while (pending.length) {
    const node = pending.pop();
    if (node.canAccess) allowedPaths.push(node.menuPath);
    pending.push(...[...node.children].reverse());
  }
  return { tree, allowedPaths };
}

// Re-read user and grants in one consistent, read-only snapshot. Never accept
// roleId/path/grant lists from the browser as authorization evidence.
export async function getUserMenuAccess(userId, client = prisma) {
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const user = await tx.users.findUnique({ where: { id: userId },
      select: { is_active: true, role_record: { select: { id: true, code: true } } } });
    if (!user?.is_active) throw new MenuAccessError(401, 'UNAUTHORIZED', 'Unauthorized');
    if (!hasConfiguredRole(user)) throw new MenuAccessError(403, 'RBAC_NOT_READY', 'Your account role is not configured. Contact an administrator.');
    const menus = await tx.menus.findMany({ select: menuSelect });
    const grants = await tx.role_menus.findMany({ where: { role_id: user.role_record.id }, select: { menu_id: true } });
    return buildMenuAccess(menus, grants.map((grant) => grant.menu_id));
  }, { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 10000 });
}
