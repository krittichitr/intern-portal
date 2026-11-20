import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireAdmin, requireMenuAccess } from '../middleware/authorization.middleware.js';
import { MENU_PATHS } from '../lib/menu-registry.js';
import { getMenus, createMenu, updateMenu, deleteMenu } from '../controllers/menu.controller.js';

const router = Router();
router.use(requireAuth, requireAdmin, requireMenuAccess(MENU_PATHS.menus));
router.get('/', getMenus);
router.post('/', createMenu);
router.put('/:id', updateMenu);
router.delete('/:id', deleteMenu);
export default router;
