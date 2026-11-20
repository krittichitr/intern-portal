import { UserRoleError, userId, readUserRoleInput } from '../validators/user-role-input.js';
import { MenuError } from '../validators/menu-input.js';
import { assignUserRole } from '../services/user-role.service.js';

export async function updateUserRole(req, res, next) {
  try {
    const user = await assignUserRole(req.user.id, userId(req.params.id), readUserRoleInput(req.body));
    return res.json({ success: true, user });
  } catch (error) {
    if (!(error instanceof UserRoleError) && !(error instanceof MenuError)) return next(error);
    return res.status(error.status).json({ success: false, code: error.code, message: error.message });
  }
}
