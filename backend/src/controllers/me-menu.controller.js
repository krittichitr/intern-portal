import { getUserMenuAccess, MenuAccessError } from '../services/menu-access.service.js';

export async function getMyMenus(req, res, next) {
  try {
    const { tree, allowedPaths } = await getUserMenuAccess(req.user.id);
    return res.status(200).json({ success: true, menus: tree, allowedPaths });
  } catch (error) {
    if (!(error instanceof MenuAccessError)) return next(error);
    return res.status(error.status).json({ success: false,
      ...(error.code === 'RBAC_NOT_READY' ? { code: error.code } : {}), message: error.message });
  }
}
