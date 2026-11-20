import { constants } from 'node:fs';
import { lstat, mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export class DevSeedError extends Error {
  constructor(code, message) { super(message); this.name = 'DevSeedError'; this.code = code; }
}

export const devUserPlan = Object.freeze([
  ...['ADMIN', 'MANAGER', 'USER'].flatMap((role) => {
    const count = { ADMIN: 3, MANAGER: 5, USER: 10 }[role];
    return Array.from({ length: count }, (_, offset) => {
      const number = offset + 1;
      const username = `${role.toLowerCase()}${String(number).padStart(2, '0')}`;
      return Object.freeze({ username, email: `${username}@example.invalid`, role,
        first_name: 'Dev', last_name: `${role} ${String(number).padStart(2, '0')}`,
        phone: number % 4 === 0 ? null : `0000000${String(({ ADMIN: 0, MANAGER: 100, USER: 200 }[role]) + number).padStart(3, '0')}` });
    });
  }),
]);

export function validateDevCredentials(manifest) {
  const fail = () => { throw new DevSeedError('INVALID_CREDENTIALS_FILE', 'Local seed credentials are invalid; no account passwords were changed.'); };
  if (manifest?.version !== 1 || !Array.isArray(manifest.accounts) || manifest.accounts.length !== devUserPlan.length) fail();
  const ids = new Set();
  for (const plan of devUserPlan) {
    const items = manifest.accounts.filter((item) => item?.username === plan.username);
    if (items.length !== 1) fail();
    const account = items[0];
    const preserved = account.existingOnly === true;
    const validPassword = preserved && account.password === null || typeof account.password === 'string' && Buffer.byteLength(account.password, 'utf8') >= 8 && Buffer.byteLength(account.password, 'utf8') <= 72;
    if (account.role !== plan.role || (preserved ? typeof account.email !== 'string' || !account.email.includes('@') : account.email !== plan.email) || typeof account.id !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(account.id)
      || ids.has(account.id) || !validPassword) fail();
    ids.add(account.id);
  }
  return manifest;
}

export async function localDevCredentials(directory, { create = false } = {}) {
  const path = join(directory, 'dev-seed-credentials.json');
  try {
    const folder = await lstat(directory);
    if (!folder.isDirectory() || folder.isSymbolicLink() || (folder.mode & 0o077)) {
      throw new DevSeedError('UNSAFE_CREDENTIALS_DIRECTORY', 'Seed credential directory must be private and must not be a symlink.');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (!create) return null;
    await mkdir(directory, { mode: 0o700 });
  }
  try {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || (stat.mode & 0o077)) throw new DevSeedError('UNSAFE_CREDENTIALS_FILE', 'Seed credential file must have private permissions.');
      return validateDevCredentials(JSON.parse(await handle.readFile('utf8')));
    } finally { await handle.close(); }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (!create) return null;
  }
  const manifest = { version: 1, accounts: devUserPlan.map(({ username, email, role }) => ({
    id: randomUUID(), username, email, role, password: `password${username.match(/\d+$/)[0]}`,
  })) };
  let handle;
  try {
    handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  } catch (error) {
    if (error.code === 'EEXIST') return localDevCredentials(directory);
    throw error;
  }
  try { await handle.writeFile(JSON.stringify(manifest, null, 2) + '\n'); } finally { await handle.close(); }
  return manifest;
}
