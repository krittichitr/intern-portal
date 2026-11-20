import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { pathToFileURL } from "node:url";
import { config } from "./config.js";
import { prisma } from "./lib/prisma.js";
import authRoutes from "./routes/auth.routes.js";
import profileRoutes from "./routes/profile.routes.js";
import meRoutes from "./routes/me.routes.js";
import menuRoutes from "./routes/menu.routes.js";
import roleRoutes from "./routes/role.routes.js";
import userRoutes from "./routes/user.routes.js";
import { serveAvatar } from "./controllers/profile.controller.js";

export const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: config.frontendUrl, credentials: true }));
// Include JSON parser errors in the management API's no-store policy.
app.use(["/api/menus", "/api/roles", "/api/users"], (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "16kb" }));
app.use(cookieParser());
app.use("/api/auth", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
}, authRoutes);
app.use("/api/profile", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
}, profileRoutes);
app.use("/api/me", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
}, meRoutes);
app.use("/api/menus", menuRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/users", userRoutes);
app.get("/uploads/avatars/:filename", serveAvatar);
app.get("/api/health", (req, res) => {
  res.status(200).json({ success: true, message: "Backend is running" });
});
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Not found" });
});
// Express 5 forwards rejected async controllers/middleware here.
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, message: "Invalid JSON body" });
  }
  if (error.type === "entity.too.large") {
    return res.status(413).json({ success: false, message: "Request body too large" });
  }
  // Error objects can contain queries or request data; do not print them.
  console.error("Request failed: internal server error");
  return res.status(500).json({ success: false, message: "Internal server error" });
});
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = app.listen(config.port, () => {
    console.log(`Server running on port ${server.address().port}`);
  });
  server.on("error", async () => {
    console.error("HTTP server could not start; check PORT and whether it is already in use");
    await prisma.$disconnect();
    process.exitCode = 1;
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      server.close(async () => {
        await prisma.$disconnect();
        process.exitCode = 0;
      });
    });
  }
}
