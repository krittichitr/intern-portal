export const menuNode = (path, name, extra = {}) => ({ id: ({ '/dashboard': '11111111-1111-4111-8111-000000000001', '/profile': '11111111-1111-4111-8111-000000000002' })[path] || path, menuName: name, menuPath: path, menuIcon: 'UserRound', parentId: null, sortOrder: 10, canAccess: true, children: [], ...extra })
export const baseMenus = { success: true, menus: [menuNode('/dashboard', 'Dashboard', { sortOrder: 10 }), menuNode('/profile', 'Profile', { sortOrder: 20 })], allowedPaths: ['/dashboard', '/profile'] }
export function mockMenus(mock) { mock.onGet('/me/menus').reply(200, baseMenus) }
