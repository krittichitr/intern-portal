const pick = (row, keys) => Object.fromEntries(keys.map((key) => [key, row[key]]))
function rows(value, fields, nullable = []) {
  if (!Array.isArray(value) || value.some((row) => !row || fields.some((key) => {
    if (nullable.includes(key) && row[key] === null) return false
    return typeof row[key] !== 'string'
  }))) throw new Error('Unexpected list response')
}
export function readAdminResponse(path, data) {
  if (data?.success !== true) throw new Error('Unexpected response')
  if (path === '/menus') {
    const strings = ['id', 'menuName', 'menuPath', 'menuIcon', 'parentId', 'createdAt', 'updatedAt']
    rows(data.menus, strings, ['menuPath', 'menuIcon', 'parentId'])
    if (data.menus.some((m) => !Number.isInteger(m.sortOrder) || typeof m.isActive !== 'boolean')) throw new Error('Unexpected menu response')
    return { menus: data.menus.map((m) => pick(m, [...strings, 'sortOrder', 'isActive'])) }
  }
  if (path === '/roles') {
    const fields = ['id', 'code', 'name', 'createdAt', 'updatedAt']
    rows(data.roles, fields)
    return { roles: data.roles.map((r) => pick(r, fields)) }
  }
  if (/^\/roles\/[^/]+\/menus$/.test(path)) {
    rows([data.role], ['id', 'code', 'name'])
    if (!Array.isArray(data.menuIds) || data.menuIds.some((id) => typeof id !== 'string')) throw new Error('Unexpected assignment response')
    return { role: pick(data.role, ['id', 'code', 'name']), menuIds: [...data.menuIds] }
  }
  if (path.startsWith('/users?')) {
    rows(data.users, ['id', 'username', 'email', 'role', 'roleId'], ['role', 'roleId'])
    if (data.users.some((u) => typeof u.isActive !== 'boolean') || !Number.isInteger(data.total) || data.total < 0
        || !Number.isInteger(data.pageSize) || data.pageSize <= 0) throw new Error('Unexpected user response')
    return { users: data.users.map((u) => pick(u, ['id', 'username', 'email', 'role', 'roleId', 'isActive'])), total: data.total, pageSize: data.pageSize }
  }
  throw new Error('Unexpected resource')
}
