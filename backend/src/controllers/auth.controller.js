import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { config, cookieOptions, publicUserSelect, tokenLifetimeMs } from "../config.js";

export async function login(req, res) {
  const { username, password } = req.body || {};
  if (
    typeof username !== "string" || !username.trim() || username.length > 50 ||
    typeof password !== "string" || !password.trim() ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    return res.status(400).json({ success: false, message: "Invalid username or password format" });
  }
  const user = await prisma.users.findUnique({
    where: { username },
    select: { ...publicUserSelect, password_hash: true, is_active: true },
  });
  if (!user || !user.is_active || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ success: false, message: "Invalid username or password" });
  }
  const token = jwt.sign({}, config.jwtSecret, {
    subject: user.id, expiresIn: "1h", algorithm: "HS256",
  });
  res.cookie("auth_token", token, { ...cookieOptions, maxAge: tokenLifetimeMs });
  const { id, username: name, email, role } = user;
  return res.status(200).json({
    success: true, message: "Login successful",
    user: { id, username: name, email, role },
  });
}
export function getMe(req, res) {
  return res.status(200).json({ success: true, user: req.user });
}
export function logout(req, res) {
  res.clearCookie("auth_token", cookieOptions);
  return res.status(200).json({ success: true, message: "Logout successful" });
}
