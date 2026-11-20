export class RoleError extends Error {
  constructor(status, code, message) { super(message); this.name = 'RoleError'; this.status = status; this.code = code; }
}

export function roleId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new RoleError(400, 'INVALID_ROLE_ID', 'A valid role UUID is required');
  }
  return value.toLowerCase();
}

function validBody(body, allowed, required) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some((key) => !allowed.includes(key))
      || required.some((key) => !Object.hasOwn(body, key))) {
    throw new RoleError(400, 'INVALID_ROLE_INPUT', 'Use only the supported role fields');
  }
}

export function readRoleInput(body, { create = false } = {}) {
  validBody(body, create ? ['code', 'name'] : ['name'], create ? ['code', 'name'] : ['name']);
  if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100
      || /[\u0000-\u001f\u007f]/.test(body.name)) {
    throw new RoleError(400, 'INVALID_ROLE_INPUT', 'Role name must contain 1–100 characters');
  }
  const data = { name: body.name.trim() };
  if (create) {
    if (typeof body.code !== 'string' || !/^[A-Z][A-Z0-9_]{0,19}$/.test(body.code.trim().toUpperCase())) {
      throw new RoleError(400, 'INVALID_ROLE_INPUT', 'Role code must contain 1–20 letters, digits or underscores and start with a letter');
    }
    data.code = body.code.trim().toUpperCase();
  }
  return data;
}

export function readMenuAssignment(body) {
  validBody(body, ['menuIds'], ['menuIds']);
  if (!Array.isArray(body.menuIds) || body.menuIds.some((id) => typeof id !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    throw new RoleError(400, 'INVALID_MENU_IDS', 'menuIds must be an array of menu UUIDs');
  }
  const ids = body.menuIds.map((id) => id.toLowerCase());
  if (new Set(ids).size !== ids.length) throw new RoleError(400, 'INVALID_MENU_IDS', 'Duplicate menu IDs are not allowed');
  return ids;
}
