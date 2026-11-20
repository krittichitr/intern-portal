import { constants } from "node:fs";
import { lstat, mkdir, open, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const avatarUrlPrefix = "/uploads/avatars/";
const generatedFilename = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/;
const defaultDirectory = fileURLToPath(new URL("../../uploads/avatars/", import.meta.url));

export function avatarFilenameFromUrl(url) {
  if (typeof url !== "string" || !url.startsWith(avatarUrlPrefix)) return null;
  const filename = url.slice(avatarUrlPrefix.length);
  return generatedFilename.test(filename) ? filename : null;
}

// A factory lets safe tests use an isolated temporary directory, without changing
// the production directory through request input or environment configuration.
export function createAvatarStorage(directory) {
  const root = resolve(directory);

  async function checkDirectory(create = false) {
    if (create) await mkdir(dirname(root), { recursive: true });
    const parent = await lstat(dirname(root));
    if (!parent.isDirectory() || parent.isSymbolicLink()) throw new Error("Unsafe avatar directory");
    if (create) await mkdir(root, { recursive: true });
    const folder = await lstat(root);
    if (!folder.isDirectory() || folder.isSymbolicLink()) throw new Error("Unsafe avatar directory");
  }

  return {
    async write(filename, buffer) {
      if (!generatedFilename.test(filename)) throw new Error("Invalid generated avatar filename");
      await checkDirectory(true);
      const path = join(root, filename);
      let handle;
      let created = false;
      try {
        // Exclusive creation prevents overwriting an existing file or symlink.
        handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644);
        created = true;
        await handle.writeFile(buffer);
        await handle.close();
        handle = undefined;
      } catch (error) {
        try { await handle?.close(); } catch { /* Preserve the original write error. */ }
        if (created) {
          try { await unlink(path); } catch { console.error("New avatar file cleanup failed"); }
        }
        throw error;
      }
    },

    async read(filename) {
      if (!generatedFilename.test(filename)) return null;
      try {
        await checkDirectory();
        const handle = await open(join(root, filename), constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const stat = await handle.stat();
          if (!stat.isFile() || stat.size > 2 * 1024 * 1024) return null;
          return await handle.readFile();
        } finally {
          await handle.close();
        }
      } catch (error) {
        if (["ENOENT", "ENOTDIR", "ELOOP"].includes(error.code)) return null;
        throw error;
      }
    },

    async remove(url) {
      const filename = avatarFilenameFromUrl(url);
      if (!filename) return false;
      try {
        await checkDirectory();
        // unlink removes a symlink itself; it never follows it to delete a target.
        await unlink(join(root, filename));
        return true;
      } catch (error) {
        if (error.code === "ENOENT") return false;
        throw error;
      }
    },
  };
}

export const avatarStorage = createAvatarStorage(defaultDirectory);
