import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { chromium } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(join(root, 'backend/package.json'))
require('dotenv').config({ path: join(root, 'backend/.env'), quiet: true })
const target = new URL(process.env.RBAC_TEST_DATABASE_URL || 'invalid:')
const name = decodeURIComponent(target.pathname.slice(1))
assert.ok(['postgres:', 'postgresql:'].includes(target.protocol))
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname))
assert.match(name, /^login_rbac_test_[a-z0-9_]+$/)
assert.equal(target.searchParams.get('schema') || 'public', 'public')
if (process.env.DATABASE_URL) assert.notEqual(name, decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1)))
const portServer = createServer(); await new Promise(r => portServer.listen(0, '127.0.0.1', r))
const vitePort = portServer.address().port; await new Promise(r => portServer.close(r))
const origin = `http://127.0.0.1:${vitePort}`
process.env.DATABASE_URL = target.toString(); process.env.JWT_SECRET = randomBytes(48).toString('hex')
process.env.FRONTEND_URL = origin; process.env.NODE_ENV = 'test'
const { app } = await import(join(root, 'backend/src/server.js'))
const { prisma } = await import(join(root, 'backend/src/lib/prisma.js'))
const { seedMenuAccess } = await import(join(root, 'backend/scripts/seed-menu-access.mjs'))
const { avatarStorage, createAvatarStorage } = await import(join(root, 'backend/src/lib/avatar-storage.js'))
const bcrypt = require('bcryptjs'), sharp = require('sharp')
const temporary = await mkdtemp(join(tmpdir(), 'login-rbac-browser-'))
const storage = { ...avatarStorage }; Object.assign(avatarStorage, createAvatarStorage(join(temporary, 'avatars')))
const password = randomBytes(24).toString('base64url')
const roles = new Map(), users = new Map(), checks = [], pageErrors = [], consoleErrors = [], requests = []
let server, vite, browser, owned = false, stage = 'empty database preflight'
function pass(label) { checks.push(label); console.log(JSON.stringify({ status: 'PASS', check: label })) }
const output = join(root, 'docs/rbac/screenshots'); await mkdir(output, { recursive: true })
try {
  assert.equal(await prisma.users.count(), 0); assert.equal(await prisma.roles.count(), 0); assert.equal(await prisma.menus.count(), 0); owned = true
  for (const code of ['ADMIN', 'MANAGER', 'USER']) { const row = await prisma.roles.create({ data: { code, name: code } }); roles.set(code, row.id) }
  const hash = await bcrypt.hash(password, 12)
  for (const [key, code] of [['admin', 'ADMIN'], ['admin2', 'ADMIN'], ['manager', 'MANAGER'], ['user', 'USER']]) {
    const id = randomUUID(); users.set(key, id)
    await prisma.users.create({ data: { id, username: `e2e_${key}`, email: `e2e_${key}@example.invalid`, role: code, role_id: roles.get(code), password_hash: hash, updated_at: new Date() } })
  }
  await seedMenuAccess(prisma, { apply: true })
  server = await new Promise((r, reject) => { const s = app.listen(0, '127.0.0.1', () => r(s)); s.once('error', reject) })
  const backend = `http://127.0.0.1:${server.address().port}`
  const viteEnv = { ...process.env, VITE_API_BASE_URL: `${backend}/api`, NODE_ENV: 'development' }
  for (const key of ['DATABASE_URL', 'JWT_SECRET', 'RBAC_TEST_DATABASE_URL']) delete viteEnv[key]
  vite = spawn(process.execPath, [join(root, 'frontend/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], { cwd: join(root, 'frontend'), env: viteEnv, stdio: 'ignore' })
  for (let n = 0; n < 100; n++) { try { if ((await fetch(origin)).ok) break } catch {} await new Promise(r => setTimeout(r, 100)); if (n === 99) throw new Error('Vite unavailable') }
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  async function newPage(viewport = { width: 1440, height: 1000 }) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' }), page = await context.newPage()
    page.setDefaultTimeout(12000)
    page.on('pageerror', () => pageErrors.push('runtime error'))
    page.on('console', m => { if (m.type() === 'error' && !/status of (401|403|409)/.test(m.text())) consoleErrors.push(m.text().replaceAll(password, '[private]').replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]')) })
    page.on('response', r => { const url = new URL(r.url()); if (url.origin === backend) requests.push({ method: r.request().method(), path: url.pathname, status: r.status() }) })
    return page
  }
  async function login(page, key) { await page.goto(origin + '/login'); await page.getByRole('heading', { name: 'Welcome back.', exact: true }).waitFor(); await page.getByLabel('Username', { exact: true }).fill(`e2e_${key}`); await page.getByLabel('Password', { exact: true }).fill(password); await page.getByRole('button', { name: 'Sign in to your workspace' }).click() }
  const heading = (p, text) => p.getByRole('heading', { name: text, exact: true }).waitFor()
  const goto = async (p, path, title) => { await p.goto(origin + path); await heading(p, title) }
  const saved = (p, text) => p.getByText(text, { exact: true }).last().waitFor()
  const admin = await newPage()
  stage = 'admin login/sidebar'; await login(admin, 'admin'); await heading(admin, 'Welcome back, e2e_admin!')
  assert.equal(await admin.getByRole('link', { name: 'Menu Management', exact: true }).count(), 1); pass('Admin login and Dynamic Sidebar')
  stage = 'menu create parent'; await admin.getByRole('link', { name: 'Menu Management', exact: true }).click(); await heading(admin, 'Menu Management')
  await admin.getByRole('button', { name: 'Add menu', exact: true }).click(); await admin.getByLabel('Menu name', { exact: true }).fill('Browser Parent'); await admin.getByRole('button', { name: 'Save menu' }).click(); await saved(admin, 'Menu saved.'); await admin.getByRole('button', { name: 'Edit Browser Parent' }).waitFor()
  const parent = await prisma.menus.findFirst({ where: { menu_name: 'Browser Parent' } }); assert.ok(parent)
  stage = 'menu create child'; await admin.getByRole('button', { name: 'Add menu', exact: true }).click(); await admin.getByLabel('Menu name', { exact: true }).fill('Browser Child'); await admin.getByLabel('Menu path (blank for group)').fill('/browser-child'); await admin.getByLabel('Parent menu').selectOption(parent.id); await admin.getByLabel('Active', { exact: true }).uncheck(); await admin.getByRole('button', { name: 'Save menu' }).click(); await admin.getByRole('button', { name: 'Edit Browser Child' }).waitFor(); pass('Create parent/child, inactive menu and explicit sort data')
  stage = 'menu edit'; await admin.getByRole('button', { name: 'Edit Browser Child' }).click(); await admin.getByRole('dialog').screenshot({ path: join(output, 'menu-edit-dialog-desktop.png') }); await admin.getByLabel('Sort order').fill('42'); await admin.getByLabel('Active', { exact: true }).check(); await admin.getByRole('button', { name: 'Save menu' }).click(); await admin.getByRole('button', { name: 'Edit Browser Child' }).waitFor(); const child = await prisma.menus.findFirst({ where: { menu_name: 'Browser Child' } }); assert.equal(child.sort_order, 42); assert.equal(child.is_active, true); pass('Edit menu persisted in PostgreSQL')
  stage = 'menu delete dependency'; await admin.getByRole('button', { name: 'Delete Browser Parent' }).click(); await admin.getByRole('alertdialog').getByRole('button', { name: 'Delete menu', exact: true }).click(); await admin.getByRole('alert').filter({ hasText: 'Move or remove child menus' }).waitFor(); pass('Parent delete dependency 409 shown to user'); await admin.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await admin.getByRole('button', { name: 'Delete Browser Child' }).click(); await admin.getByRole('alertdialog').getByRole('button', { name: 'Delete menu', exact: true }).click(); await admin.getByRole('button', { name: 'Delete Browser Child' }).waitFor({ state: 'detached' }); await admin.getByRole('button', { name: 'Delete Browser Parent' }).click(); await admin.getByRole('alertdialog').getByRole('button', { name: 'Delete menu', exact: true }).click(); await admin.getByRole('button', { name: 'Delete Browser Parent' }).waitFor({ state: 'detached' }); pass('Delete menus after dependencies removed')
  await admin.screenshot({ path: join(output, 'menu-management-desktop.png'), fullPage: true })
  stage = 'role create/edit'; await admin.getByRole('link', { name: 'Role Management', exact: true }).click(); await heading(admin, 'Role Management'); await admin.getByRole('button', { name: 'Add role', exact: true }).click(); await admin.getByLabel('Role code', { exact: true }).fill('E2E_AUDITOR'); await admin.getByLabel('Role name', { exact: true }).fill('Auditor demo'); await admin.getByRole('button', { name: 'Save role' }).click(); await admin.getByRole('button', { name: 'Edit E2E_AUDITOR' }).waitFor();
  await admin.getByRole('button', { name: 'Edit E2E_AUDITOR' }).click(); assert.equal(await admin.getByLabel('Role code', { exact: true }).isDisabled(), true); await admin.getByLabel('Role name', { exact: true }).fill('Auditor edited'); await admin.getByRole('button', { name: 'Save role' }).click(); await admin.getByRole('cell', { name: 'Auditor edited', exact: true }).waitFor(); const auditor = await prisma.roles.findUnique({ where: { code: 'E2E_AUDITOR' } }); pass('Create/edit Role; immutable code')
  stage = 'role assignment'; await admin.getByRole('button', { name: 'Assign menus to E2E_AUDITOR' }).click(); await admin.getByRole('checkbox', { name: 'Profile /profile', exact: true }).check(); await Promise.all([admin.waitForResponse(r => r.request().method() === 'PUT' && new URL(r.url()).pathname.endsWith('/menus') && r.status() === 200), admin.getByRole('button', { name: 'Save permissions' }).click()]); await saved(admin, 'Menu permissions saved.'); pass('Assign explicit Profile grant via checkbox')
  async function changeUser(page, key, destination, self = false) {
    await goto(page, '/admin/users', 'User Role Assignment')
    await page.getByRole('button', { name: `Edit role for e2e_${key}`, exact: true }).click()
    const form = page.getByRole('form', { name: `Change role for e2e_${key}`, exact: true })
    await form.getByRole('combobox').selectOption(destination)
    if (self) await form.getByRole('button', { name: 'Save role', exact: true }).click()
    await Promise.all([page.waitForResponse(r => r.request().method() === 'PUT' && new URL(r.url()).pathname.endsWith('/role') && r.status() === 200), self ? page.getByRole('alertdialog').getByRole('button', { name: 'Change my role', exact: true }).click() : form.getByRole('button', { name: 'Save role', exact: true }).click()])
  }
  stage = 'user assignment'; await changeUser(admin, 'user', auditor.id); await admin.getByRole('row').filter({ has: admin.getByRole('cell', { name: 'e2e_user', exact: true }) }).getByRole('cell', { name: 'E2E_AUDITOR', exact: true }).waitFor(); pass('User picker and role change; Admin identity preserved')
  stage = 'role delete in-use'; await goto(admin, '/admin/roles', 'Role Management'); await admin.getByRole('button', { name: 'Delete E2E_AUDITOR' }).click(); await admin.getByRole('alertdialog').getByRole('button', { name: 'Delete role', exact: true }).click(); await admin.getByRole('alert').filter({ hasText: 'Move all users' }).waitFor(); pass('Role in use cannot be deleted'); await admin.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  const member = await newPage({ width: 390, height: 844 })
  stage = 'profile-only landing'; await login(member, 'user'); await heading(member, 'Your profile'); assert.equal(new URL(member.url()).pathname, '/profile'); await member.reload(); await heading(member, 'Your profile'); pass('Profile-only landing and refresh session persistence')
  stage = 'mobile navigation'; await member.getByRole('button', { name: 'Open navigation' }).click(); const drawer = member.getByRole('dialog', { name: 'Workspace navigation' }); await drawer.waitFor(); assert.equal(await drawer.getByRole('link', { name: 'Dashboard', exact: true }).count(), 0); await drawer.getByRole('link', { name: 'Profile', exact: true }).click(); await drawer.waitFor({ state: 'hidden' }); pass('Mobile Dynamic Sidebar and navigation close')
  stage = 'direct forbidden'; await goto(member, '/dashboard', 'You don’t have access to this page.'); assert.equal(new URL(member.url()).pathname, '/403'); await goto(member, '/admin/menus', 'You don’t have access to this page.'); pass('Denied direct URLs show 403')
  stage = 'empty grants'; await goto(admin, '/admin/roles', 'Role Management'); await admin.getByRole('button', { name: 'Assign menus to E2E_AUDITOR' }).click(); await admin.getByRole('checkbox', { name: 'Profile /profile', exact: true }).uncheck(); await Promise.all([admin.waitForResponse(r => r.request().method() === 'PUT' && new URL(r.url()).pathname.endsWith('/menus') && r.status() === 200), admin.getByRole('button', { name: 'Save permissions' }).click()]); await saved(admin, 'Menu permissions saved.'); await member.getByRole('button', { name: 'Reload permissions' }).click(); await heading(member, 'You don’t have access to this page.'); await member.getByRole('link', { name: 'Back to workspace' }).waitFor({ state: 'detached' })
  const denied = await member.evaluate(async (base) => (await fetch(base + '/api/profile/me', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firstName: 'Must not change' }) })).status, backend); assert.equal(denied, 403); pass('Empty grants keep session but block page and Profile API')
  await member.getByRole('button', { name: 'Sign out', exact: true }).click(); await heading(member, 'Welcome back.'); await member.goto(origin + '/profile'); await heading(member, 'Welcome back.'); pass('Logout blocks Profile')
  stage = 'restore user/delete role'; await changeUser(admin, 'user', roles.get('USER')); await saved(admin, 'User role updated.'); await goto(admin, '/admin/roles', 'Role Management'); await admin.getByRole('button', { name: 'Delete E2E_AUDITOR' }).click(); await admin.getByRole('alertdialog').getByRole('button', { name: 'Delete role', exact: true }).click(); await admin.getByRole('button', { name: 'Delete E2E_AUDITOR' }).waitFor({ state: 'detached' }); pass('Delete unused Role without deleting menus')
  stage = 'self demotion'; await changeUser(admin, 'admin', roles.get('MANAGER'), true); await heading(admin, 'You don’t have access to this page.'); await admin.getByRole('link', { name: 'Back to workspace' }).click(); await heading(admin, 'Welcome back, e2e_admin!'); assert.equal(await admin.getByRole('link', { name: 'Menu Management', exact: true }).count(), 0); pass('Self-role change refreshes AuthContext and permissions')
  const admin2 = await newPage(); await login(admin2, 'admin2'); await heading(admin2, 'Welcome back, e2e_admin2!'); await changeUser(admin2, 'admin', roles.get('ADMIN')); await saved(admin2, 'User role updated.')
  stage = 'profile regression'; await login(member, 'user'); await heading(member, 'Welcome back, e2e_user!'); await member.getByRole('button', { name: 'Open navigation' }).click(); await member.getByRole('dialog').getByRole('link', { name: 'Profile', exact: true }).click(); await heading(member, 'Your profile'); await member.getByRole('button', { name: 'Edit Profile', exact: true }).click(); await member.getByLabel(/^First Name/).fill('Browser Verified'); await member.screenshot({ path: join(output, 'profile-edit-dialog-mobile.png') }); await member.getByRole('button', { name: 'Save Changes', exact: true }).click(); await saved(member, 'Profile updated successfully.'); pass('Existing Edit Profile still works with menu guard')
  stage = 'avatar regression'; const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#3563dc' } }).png().toBuffer(); const picker = member.getByLabel('Choose profile photo'); await picker.setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: png }); await member.getByRole('button', { name: 'Cancel photo selection' }).click(); assert.equal(await member.getByRole('button', { name: 'Upload Photo', exact: true }).count(), 0); await picker.setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: png }); await member.getByRole('button', { name: 'Upload Photo', exact: true }).click(); await saved(member, 'Profile photo updated successfully.'); await member.reload(); await heading(member, 'Your profile'); await member.locator('img[src*="/uploads/avatars/"]:visible').first().waitFor(); pass('Avatar preview/cancel/upload and refresh persistence')
  assert.equal(await member.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true); await member.screenshot({ path: join(output, 'profile-mobile.png'), fullPage: true }); pass('Mobile layout has no document overflow')
  stage = 'console/network checks'; assert.equal(pageErrors.length, 0); assert.equal(consoleErrors.length, 0); assert.equal(requests.some(r => r.status >= 500), false); pass('No JavaScript/console errors or unexpected 5xx requests')
  await writeFile(join(output, 'rbac-browser-results.json'), JSON.stringify({ success: true, checks, requests, pageErrors: 0, consoleErrors: 0 }, null, 2))
  console.log(JSON.stringify({ success: true, checks: checks.length, pageErrors: 0, consoleErrors: 0 }))
} catch (error) {
  console.log(JSON.stringify({ success: false, stage, type: error.name }))
  await writeFile(join(temporary, 'failure.private.txt'), String(error).replaceAll(password, '[private]').replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]'), { mode: 0o600 })
  console.log(JSON.stringify({ diagnostic: join(temporary, 'failure.private.txt') }))
  process.exitCode = 1
} finally {
  if (browser) await browser.close()
  if (vite) { vite.kill('SIGTERM'); await new Promise(r => vite.once('exit', r)) }
  if (server) await new Promise(r => server.close(r))
  Object.assign(avatarStorage, storage)
  if (owned) {
    await prisma.role_menus.deleteMany({})
    while ((await prisma.menus.deleteMany({ where: { children: { none: {} } } })).count) { /* only this empty-start disposable database */ }
    await prisma.users.deleteMany({ where: { id: { in: [...users.values()] } } })
    await prisma.roles.deleteMany({ where: { code: { in: ['ADMIN', 'MANAGER', 'USER', 'E2E_AUDITOR'] } } })
  }
  await prisma.$disconnect()
  if (!process.exitCode) await rm(temporary, { recursive: true, force: true })
}
