import multer from "multer";

export const maxAvatarBytes = 2 * 1024 * 1024;
const parseAvatar = multer({
  storage: multer.memoryStorage(),
  limits: {
    // One extra byte allows the exact 2 MiB boundary; reject overflow below.
    fileSize: maxAvatarBytes + 1,
    files: 1,
    fields: 0,
    parts: 2,
  },
}).single("avatar");

export function uploadAvatar(req, res, next) {
  parseAvatar(req, res, (error) => {
    if (error) {
      const tooLarge = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE";
      return res.status(tooLarge ? 413 : 400).json({
        success: false,
        message: tooLarge ? "Image must not exceed 2 MiB" : "Invalid avatar upload; send one file in the avatar field",
      });
    }
    if (!req.file || !Buffer.isBuffer(req.file.buffer) || req.file.buffer.length === 0) {
      return res.status(400).json({ success: false, message: "An avatar image is required" });
    }
    if (req.file.buffer.length > maxAvatarBytes) {
      return res.status(413).json({ success: false, message: "Image must not exceed 2 MiB" });
    }
    // MIME type and original filename are untrusted. The controller validates
    // byte signatures and fully decodes/re-encodes the actual image with Sharp.
    next();
  });
}
