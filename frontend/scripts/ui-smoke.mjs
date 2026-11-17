import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'

// Browser regression checks use an intercepted API fixture only. They never
// create accounts, write to PostgreSQL, or claim a successful real login.
const output = new URL('../test-results/', import.meta.url)
await mkdir(output, { recursive: true })
const results = []
const user = { id: 'c477d132-32d2-43cf-9202-c7544175a1af', username: 'preview_user', email: 'preview@example.invalid', role: 'USER' }
const browser = await chromium.launch({ channel: 'chrome', headless: true })
async function record(name, pass) {
  results.push({ name, status: pass ? 'PASS' : 'FAIL' })
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}`)
  if (!pass) throw new Error(name)
}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  const runtimeErrors = []
  let authenticated = true
  let failLogout = false
  let meRequests = 0
  page.on('pageerror', () => runtimeErrors.push('runtime error'))
  const headers = { 'Access-Control-Allow-Origin': 'http://localhost:5173', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, accept' }
  await page.route('http://localhost:4000/api/auth/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    let status = 200
    let body = { success: true }
    if (path.endsWith('/me')) {
      meRequests++
      if (authenticated) body.user = user
      else { status = 401; body = { success: false, message: 'Unauthorized' } }
    } else if (path.endsWith('/logout')) {
      if (failLogout) { status = 500; body = { success: false } }
      else authenticated = false
    }
    return route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.goto('http://localhost:5173/dashboard')
  await page.getByRole('heading', { name: 'Profile information', exact: true }).waitFor()
  await record('Mocked dashboard renders account data', await page.locator('.profile-card').getByText(user.id, { exact: true }).isVisible())
  for (const [name, width, height] of [['desktop', 1440, 1000], ['small-desktop', 1024, 900], ['tablet', 820, 1180], ['small-tablet', 768, 1024], ['mobile', 390, 844], ['small-mobile', 320, 720]]) {
    await page.setViewportSize({ width, height })
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await record(`Mocked dashboard ${name}: no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    if (name === 'desktop' || name === 'mobile') await page.screenshot({ path: new URL(`dashboard-design-${name}.png`, output).pathname, fullPage: true })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Open navigation' }).click()
  const dialog = page.getByRole('dialog', { name: 'Workspace navigation' })
  await record('Mobile drawer opens with accessible dialog', await dialog.isVisible())
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  await record('Escape closes mobile drawer and restores focus', await page.getByRole('button', { name: 'Open navigation' }).evaluate((node) => document.activeElement === node))
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await dialog.getByRole('link', { name: 'Dashboard' }).click()
  await dialog.waitFor({ state: 'hidden' })
  await record('Mobile dashboard navigation closes drawer', true)
  const beforeCheck = meRequests
  await page.getByRole('button', { name: 'Check session', exact: true }).click()
  await page.getByRole('button', { name: 'Check session', exact: true }).waitFor()
  await record('Session check issues exactly one me request', meRequests === beforeCheck + 1)
  failLogout = true
  await page.getByRole('button', { name: 'Sign out of workspace', exact: true }).click()
  await page.getByRole('alert').waitFor()
  await record('Failed logout retains user and shows error', new URL(page.url()).pathname === '/dashboard' && await page.locator('.profile-card').getByText(user.id).isVisible())
  failLogout = false
  await page.getByRole('button', { name: 'Sign out of workspace', exact: true }).click()
  await page.waitForURL('**/login')
  await record('Confirmed mocked logout returns to login', true)
  await page.goto('http://localhost:5173/dashboard')
  await page.waitForURL('**/login')
  await record('Mocked logged-out dashboard is protected', true)
  await record('No browser runtime errors', runtimeErrors.length === 0)
  await record('No repeated me request loop', meRequests < 10)
} catch {
  process.exitCode = 1
} finally {
  await writeFile(new URL('ui-smoke-results.json', output), JSON.stringify({ mode: 'mocked API, no database writes', results }, null, 2))
  await browser.close()
}
