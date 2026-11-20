import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { getMyMenus } from '../controllers/me-menu.controller.js';

const router = Router();
// Bootstrap endpoint: every authenticated, mapped role may read its own menus.
// No requireAdmin or menu grant is needed to discover the current permissions.
router.get('/menus', requireAuth, getMyMenus);
export default router;
