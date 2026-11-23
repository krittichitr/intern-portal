import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const steps = [
  ['Roles', 'backfill-user-roles.mjs'],
  ['Users', 'seed-dev-users.mjs'],
  ['Menus and grants', 'seed-menu-access.mjs'],
];

export function runSeed({ run = spawnSync, report = console.log } = {}) {
  for (const [label, filename] of steps) {
    report(`Seeding ${label}...`);
    // Reuse each CLI's database/credential guards and preserve its safe output.
    const result = run(process.execPath, [join(directory, filename), '--apply'], {
      cwd: resolve(directory, '..'), stdio: 'inherit', shell: false,
    });
    if (result.error || result.status !== 0) {
      report(`Seed stopped at ${label}. Earlier completed steps remain; fix the error before retrying.`);
      return 1;
    }
  }
  report('Seed completed: Roles, Users, Menus and grants.');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 2) {
    console.error('Use npm run seed without extra arguments.');
    process.exitCode = 1;
  } else process.exitCode = runSeed();
}
