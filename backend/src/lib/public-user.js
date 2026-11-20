export class RoleNotReadyError extends Error {
  constructor() {
    super('Account role is not configured');
    this.name = 'RoleNotReadyError';
  }
}

export function hasConfiguredRole(user) {
  return typeof user?.role_record?.id === 'string'
    && typeof user.role_record.code === 'string'
    && user.role_record.code.trim().length > 0;
}

export function roleNotReady(res) {
  return res.status(403).json({ success: false, code: 'RBAC_NOT_READY',
    message: 'Your account role is not configured. Contact an administrator.' });
}

// Shared by Login, Me, Profile PATCH and Avatar. Never expose the relation/hash.
export function toPublicUser(user) {
  if (!hasConfiguredRole(user)) throw new RoleNotReadyError();
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role_record.code,
    firstName: user.first_name ?? null,
    lastName: user.last_name ?? null,
    phone: user.phone ?? null,
    avatarUrl: user.avatar_url ?? null,
  };
}
