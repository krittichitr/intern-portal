export class UserRoleError extends Error {
  constructor(status, code, message) { super(message); this.name = 'UserRoleError'; this.status = status; this.code = code; }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function userId(value) {
  if (typeof value !== 'string' || !uuid.test(value)) throw new UserRoleError(400, 'INVALID_USER_ID', 'A valid user UUID is required');
  return value.toLowerCase();
}
export function readUserRoleInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1
      || !Object.hasOwn(body, 'roleId') || typeof body.roleId !== 'string' || !uuid.test(body.roleId)) {
    throw new UserRoleError(400, 'INVALID_ROLE_ASSIGNMENT', 'Send only roleId containing a valid role UUID');
  }
  return body.roleId.toLowerCase();
}
