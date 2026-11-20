import { hasConfiguredRole, roleNotReady } from "../lib/public-user.js";
import { getUserMenuAccess, MenuAccessError } from "../services/menu-access.service.js";

// Always mount after requireAuth, which loads the current role from PostgreSQL.
// This checks role identity only; menu grants are a separate authorization step.
export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  if (!hasConfiguredRole(req.user)) return roleNotReady(res);
  if (req.user.role_record.code !== "ADMIN") {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  return next();
}

// The required path is supplied by the server route, never req.body/query.
export function requireMenuAccess(menuPath) {
  if (typeof menuPath !== "string" || !menuPath.startsWith("/") || menuPath.startsWith("//")
      || /[?#\\]/.test(menuPath)) throw new TypeError("A fixed application menu path is required");
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" });
    try {
      const access = await getUserMenuAccess(req.user.id);
      if (!access.allowedPaths.includes(menuPath)) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }
      return next();
    } catch (error) {
      if (!(error instanceof MenuAccessError)) return next(error);
      return res.status(error.status).json({ success: false,
        ...(error.code === "RBAC_NOT_READY" ? { code: error.code } : {}), message: error.message });
    }
  };
}
