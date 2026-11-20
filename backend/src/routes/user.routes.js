import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireAdmin, requireMenuAccess } from '../middleware/authorization.middleware.js';
import { MENU_PATHS } from '../lib/menu-registry.js';
import { updateUserRole } from '../controllers/user-role.controller.js';
import { getUsers } from '../controllers/user-list.controller.js';

const router = Router();
router.get('/', requireAuth, requireAdmin, requireMenuAccess(MENU_PATHS.users), getUsers);
router.put('/:id/role', requireAuth, requireAdmin, requireMenuAccess(MENU_PATHS.users), updateUserRole);
export default router;
