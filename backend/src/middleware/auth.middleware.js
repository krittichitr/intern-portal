import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { config, publicUserSelect } from "../config.js";

const unauthorized = (res) => res.status(401).json({ success: false, message: "Unauthorized" });
export async function requireAuth(req, res, next) {
  const token = req.cookies.auth_token;
  if (typeof token !== "string" || !token) return unauthorized(res);
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
  } catch {
    return unauthorized(res);
  }
  if (
    typeof payload !== "object" || typeof payload.exp !== "number" ||
    typeof payload.sub !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.sub)
  ) return unauthorized(res);
  const user = await prisma.users.findUnique({
    where: { id: payload.sub },
    select: { ...publicUserSelect, is_active: true },
  });
  if (!user || !user.is_active) return unauthorized(res);
  const { is_active, ...publicUser } = user;
  req.user = publicUser;
  next();
}
