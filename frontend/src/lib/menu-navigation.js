export const pageRegistry = {
  '/dashboard': { title: 'Dashboard' }, '/profile': { title: 'Profile' },
  '/admin/menus': { title: 'Menu Management', adminOnly: true },
  '/admin/roles': { title: 'Role Management', adminOnly: true },
  '/admin/users': { title: 'User Role Assignment', adminOnly: true },
}
const pathPattern = /^\/(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/
export function readMenus(data) {
  if (data?.success !== true || !Array.isArray(data.menus) || !Array.isArray(data.allowedPaths)) throw new Error('Invalid menus')
  const ids = new Set(), paths = new Set(), menus = []
  const pending = data.menus.map((node) => ({ node, parent: null, output: menus }))
  while (pending.length) {
    const { node, parent, output } = pending.pop()
    if (!node || typeof node.id !== 'string' || !node.id || ids.has(node.id) || node.parentId !== parent ||
        typeof node.menuName !== 'string' || !node.menuName.trim() || !Array.isArray(node.children) ||
        !Number.isInteger(node.sortOrder) || node.sortOrder < 0 || typeof node.canAccess !== 'boolean' ||
        (node.menuIcon !== null && typeof node.menuIcon !== 'string') ||
        (node.canAccess ? typeof node.menuPath !== 'string' || !pathPattern.test(node.menuPath) || paths.has(node.menuPath) : node.menuPath !== null)) throw new Error('Invalid menus')
    ids.add(node.id)
    if (node.canAccess) paths.add(node.menuPath)
    const next = { id: node.id, menuName: node.menuName, menuPath: node.menuPath, menuIcon: node.menuIcon,
      parentId: node.parentId, sortOrder: node.sortOrder, canAccess: node.canAccess, children: [] }
    output.push(next)
    pending.push(...node.children.map((child) => ({ node: child, parent: node.id, output: next.children })))
  }
  if (new Set(data.allowedPaths).size !== data.allowedPaths.length || data.allowedPaths.length !== paths.size || data.allowedPaths.some((path) => !paths.has(path))) throw new Error('Invalid menus')
  const sort = (nodes) => { nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)); nodes.forEach((n) => sort(n.children)) }
  sort(menus)
  return { menus, allowedPaths: [...data.allowedPaths] }
}
export function canOpenPage(path, user, allowedPaths) {
  const page = Object.hasOwn(pageRegistry, path) ? pageRegistry[path] : null
  return Boolean(page && allowedPaths.includes(path) && (!page.adminOnly || user?.role === 'ADMIN'))
}
export function navigationMenus(nodes, user, paths) {
  return nodes.flatMap((node) => {
    const children = navigationMenus(node.children, user, paths)
    const canAccess = node.canAccess && canOpenPage(node.menuPath, user, paths)
    return canAccess || children.length ? [{ ...node, children, canAccess, menuPath: canAccess ? node.menuPath : null }] : []
  })
}
export function landingPath(menus, user, paths) {
  if (canOpenPage('/dashboard', user, paths)) return '/dashboard'
  const pending = [...navigationMenus(menus, user, paths)].reverse()
  while (pending.length) { const node = pending.pop(); if (node.canAccess) return node.menuPath; pending.push(...[...node.children].reverse()) }
  return '/403'
}
