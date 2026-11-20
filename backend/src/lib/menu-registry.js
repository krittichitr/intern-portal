// Stable identities shared by bootstrap and future management protection rules.
// Adding a row does not create a React page or give any role an implicit grant.
export const MENU_REGISTRY = Object.freeze([
  { id: '10100000-0000-4000-8000-000000000001', key: 'dashboard', path: '/dashboard', name: 'Dashboard', icon: 'LayoutDashboard', parent: null, order: 10 },
  { id: '10100000-0000-4000-8000-000000000002', key: 'profile', path: '/profile', name: 'Profile', icon: 'UserRound', parent: null, order: 20 },
  { id: '10100000-0000-4000-8000-000000000003', key: 'system', path: null, name: 'System Management', icon: 'Settings', parent: null, order: 30 },
  { id: '10100000-0000-4000-8000-000000000004', key: 'menus', path: '/admin/menus', name: 'Menu Management', icon: 'ListTree', parent: 'system', order: 10 },
  { id: '10100000-0000-4000-8000-000000000005', key: 'roles', path: '/admin/roles', name: 'Role Management', icon: 'ShieldCheck', parent: 'system', order: 20 },
  { id: '10100000-0000-4000-8000-000000000006', key: 'users', path: '/admin/users', name: 'User Role Assignment', icon: 'Users', parent: 'system', order: 30 },
].map(Object.freeze));

export const MENU_PATHS = Object.freeze(Object.fromEntries(MENU_REGISTRY.map((m) => [m.key, m.path])));
export const CRITICAL_MENU_IDS = Object.freeze(MENU_REGISTRY.filter((m) => ['menus', 'roles', 'users'].includes(m.key)).map((m) => m.id));
