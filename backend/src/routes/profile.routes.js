import { Router } from "express";
import { updateProfile, uploadProfileAvatar } from "../controllers/profile.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { uploadAvatar } from "../middleware/upload.middleware.js";
import { requireMenuAccess } from "../middleware/authorization.middleware.js";
import { MENU_PATHS } from "../lib/menu-registry.js";

const router = Router();
router.patch("/me", requireAuth, requireMenuAccess(MENU_PATHS.profile), updateProfile);
router.post("/me/avatar", requireAuth, requireMenuAccess(MENU_PATHS.profile), uploadAvatar, uploadProfileAvatar);
export default router;
