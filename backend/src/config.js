import "dotenv/config";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
if (Buffer.byteLength(process.env.JWT_SECRET || "", "utf8") < 32) {
  throw new Error("JWT_SECRET must contain at least 32 bytes");
}
export const config = {
  port: Number(process.env.PORT || 4000),
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  jwtSecret: process.env.JWT_SECRET,
};
if (!Number.isInteger(config.port) || config.port < 0 || config.port > 65535) {
  throw new Error("PORT must be a valid port number");
}
// Reuse these attributes when setting and clearing the cookie.
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};
export const tokenLifetimeMs = 60 * 60 * 1000;
export const publicUserSelect = { id: true, username: true, email: true, role: true };
