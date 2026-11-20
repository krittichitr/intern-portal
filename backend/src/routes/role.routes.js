import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireAdmin, requireMenuAccess } from '../middleware/authorization.middleware.js';
import { MENU_PATHS } from '../lib/menu-registry.js';
import { getRoles, createRole, updateRole, deleteRole, getAssignedMenus, assignMenus } from '../controllers/role.controller.js';

const router = Router();
router.use(requireAuth, requireAdmin, requireMenuAccess(MENU_PATHS.roles));
router.get('/', getRoles);
router.post('/', createRole);
router.put('/:id', updateRole);
router.delete('/:id', deleteRole);
router.get('/:id/menus', getAssignedMenus);
router.put('/:id/menus', assignMenus);
export default router;
