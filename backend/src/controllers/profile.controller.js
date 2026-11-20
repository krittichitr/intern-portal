import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { avatarStorage, avatarUrlPrefix } from "../lib/avatar-storage.js";
import { prisma } from "../lib/prisma.js";
import { publicUserSelect } from "../config.js";
import { hasConfiguredRole, roleNotReady, RoleNotReadyError, toPublicUser } from "../lib/public-user.js";

async function updatePublicProfile(userId, data) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.users.update({ where: { id: userId }, data, select: publicUserSelect });
    // Mapping may change after requireAuth. Roll back writes if it disappears.
    if (!hasConfiguredRole(user)) throw new RoleNotReadyError();
    return user;
  });
}

const fields = {
  firstName: ["first_name", 100],
  lastName: ["last_name", 100],
  phone: ["phone", 20],
  email: ["email", 255],
};

export async function updateProfile(req, res) {
  const body = req.body;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({
      success: false,
      message: "Invalid profile data",
    });
  }

  const keys = Object.keys(body);

  if (keys.length === 0 || keys.some((key) => !Object.hasOwn(fields, key))) {
    return res.status(400).json({
      success: false,
      message: "Invalid profile fields",
    });
  }

  const data = {};

  for (const key of keys) {
    const [column, maxLength] = fields[key];
    const value = body[key];

    if (value === null && key !== "email") {
      data[column] = null;
      continue;
    }

    if (typeof value !== "string") {
      return res.status(400).json({
        success: false,
        message: `Invalid ${key}`,
      });
    }

    const cleaned = value.trim();

    if (
      !cleaned || [...cleaned].length > maxLength ||
      /[\u0000-\u001f\u007f]/.test(cleaned)
    ) {
      return res.status(400).json({
        success: false,
        message: `Invalid ${key}`,
      });
    }

    if (
      key === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    // Allow common formatting, but require an actual 7–15 digit number.
    const phoneDigits = key === "phone" ? cleaned.replace(/\D/g, "") : "";
    if (key === "phone" && (
      !/^\+?[0-9 ()-]+$/.test(cleaned) ||
      phoneDigits.length < 7 || phoneDigits.length > 15
    )) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number",
      });
    }

    data[column] = key === "email"
      ? cleaned.toLowerCase()
      : cleaned;
  }

  try {
    const user = await updatePublicProfile(req.user.id, { ...data, updated_at: new Date() });

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: toProfileUser(user),
    });
  } catch (error) {
    if (error instanceof RoleNotReadyError) return roleNotReady(res);
    if (error?.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "Email already in use",
      });
    }

    throw error;
  }
}

// Shared by PATCH profile and avatar upload to keep their public JSON identical.
function toProfileUser(user) {
  return toPublicUser(user);
}

const avatarUpdates = new Map();

// Serialize replacement for one user in this local Node process. Read the
// current URL inside the queue; req.user may predate another upload's update.
async function withAvatarUpdate(userId, update) {
  const previous = avatarUpdates.get(userId) || Promise.resolve();
  const current = previous.catch(() => {}).then(update);
  avatarUpdates.set(userId, current);
  try {
    return await current;
  } finally {
    if (avatarUpdates.get(userId) === current) avatarUpdates.delete(userId);
  }
}

export async function uploadProfileAvatar(req, res) {
  const buffer = req.file?.buffer;
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return res.status(400).json({ success: false, message: "An avatar image is required" });
  }

  // Reject other formats before invoking their decoders, including SVG/GIF.
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isWebp = buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  if (!isJpeg && !isPng && !isWebp) {
    return res.status(400).json({ success: false, message: "Only JPG, PNG and WebP images are supported" });
  }

  let imageBuffer;
  try {
    const image = sharp(buffer, { failOn: "warning", limitInputPixels: 4096 * 4096, autoOrient: true });
    const metadata = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format) ||
        !metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096 ||
        (metadata.pages || 1) > 1) {
      return res.status(400).json({ success: false, message: "Use a static image no larger than 4096 x 4096 pixels" });
    }
    // toBuffer fully decodes pixels; metadata/header validation alone is not enough.
    // No withMetadata/keepMetadata: original EXIF and embedded data are discarded.
    imageBuffer = await image.resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 }).toBuffer();
  } catch {
    return res.status(400).json({ success: false, message: "Invalid image or image dimensions exceed the limit" });
  }

  return withAvatarUpdate(req.user.id, async () => {
    const previous = await prisma.users.findUnique({
      where: { id: req.user.id },
      select: { avatar_url: true, is_active: true, role_record: publicUserSelect.role_record },
    });
    if (!previous || !previous.is_active) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (!hasConfiguredRole(previous)) return roleNotReady(res);
    const filename = `${randomUUID()}.webp`;
    const avatarUrl = avatarUrlPrefix + filename;
    await avatarStorage.write(filename, imageBuffer);
    let user;
    try {
      user = await updatePublicProfile(req.user.id, { avatar_url: avatarUrl, updated_at: new Date() });
    } catch (error) {
      try { await avatarStorage.remove(avatarUrl); } catch { console.error("New avatar file cleanup failed"); }
      if (error instanceof RoleNotReadyError) return roleNotReady(res);
      throw error;
    }
    // Only an exact generated avatar URL is removable; external/legacy paths
    // are left alone. Failure here must not undo an already committed update.
    try { await avatarStorage.remove(previous.avatar_url); } catch { console.error("Previous avatar file cleanup failed"); }
    return res.status(200).json({
      success: true,
      message: "Profile image updated successfully",
      user: toProfileUser(user),
    });
  });
}

export async function serveAvatar(req, res) {
  const image = await avatarStorage.read(req.params.filename);
  if (!image) return res.status(404).json({ success: false, message: "Not found" });
  res.set({
    "Content-Type": "image/webp",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Cache-Control": "public, max-age=31536000, immutable",
  });
  return res.send(image);
}
