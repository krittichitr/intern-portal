import { chromium } from 'playwright-core'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

// No credentials, cookies, HAR, traces, or browser storage are persisted.
// The existing account password is entered by the user in the headed browser.
const output = new URL('../test-results/', import.meta.url)
await mkdir(output, { recursive: true })
const results = []
const network = []
const consoleErrors = []
const pageErrors = []
async function record(name, pass, detail = '') {
  results.push({ name, status: pass ? 'PASS' : 'FAIL', detail })
  await save()
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`)
  if (!pass) throw new Error(`Check failed: ${name}`)
}
async function save() {
  await writeFile(new URL('e2e-results.json', output), JSON.stringify({
    results, network, consoleErrorCount: consoleErrors.length, pageErrorCount: pageErrors.length,
  }, null, 2))
}
const frontend = 'http://localhost:5173'
const backend = 'http://localhost:4000'
let browser
try {
  await record('Frontend is running', (await fetch(`${frontend}/login`)).status === 200)
  await record('Backend is running', (await fetch(`${backend}/api/health`)).status === 200)
  browser = await chromium.launch({ channel: 'chrome', headless: false })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  await page.bringToFront()
  page.setDefaultTimeout(12000)
  page.on('response', (response) => {
    const url = new URL(response.url())
    if (url.origin === backend && url.pathname.startsWith('/api/')) {
      network.push({ method: response.request().method(), path: url.pathname, status: response.status() })
    }
  })
  page.on('console', (message) => {
    // Chromium logs expected HTTP 401 responses as console errors. Track these
    // separately from application runtime errors without logging response data.
    if (message.type() === 'error') consoleErrors.push({ expected401: message.text().includes('401'), location: message.location().url.split('?')[0] })
  })
  page.on('pageerror', () => pageErrors.push('Browser runtime error'))
  await page.goto(`${frontend}/dashboard`)
  await page.waitForURL('**/login')
  await record('Unauthenticated dashboard redirects to login', new URL(page.url()).pathname === '/login')
  await page.getByRole('heading', { name: 'Welcome back.', exact: true }).waitFor()
  await record('Login page renders', true)
  await page.getByRole('button', { name: 'Sign in to your workspace' }).click()
  await record('Required-field validation', await page.getByText('Enter your username.', { exact: true }).isVisible() && await page.getByText('Enter your password.', { exact: true }).isVisible())
  await page.getByLabel('Username', { exact: true }).fill('admin')
  await page.getByLabel('Password', { exact: true }).fill(randomUUID())
  await page.getByRole('button', { name: 'Show password', exact: true }).click()
  await record('Show password', await page.getByLabel('Password', { exact: true }).getAttribute('type') === 'text')
  await page.getByRole('button', { name: 'Hide password', exact: true }).click()
  await record('Hide password', await page.getByLabel('Password', { exact: true }).getAttribute('type') === 'password')
  const rejectedLogin = page.waitForResponse((response) => response.url() === `${backend}/api/auth/login` && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Sign in to your workspace' }).click()
  await record('Incorrect login returns 401', (await rejectedLogin).status() === 401)
  await record('Incorrect login shows a clear error', await page.getByRole('alert').isVisible())
  await page.getByLabel('Password', { exact: true }).fill('')
  await page.getByLabel('Username', { exact: true }).fill('admin')
  for (const [name, width, height] of [['desktop', 1440, 1000], ['tablet', 820, 1180], ['mobile', 390, 844], ['small-mobile', 320, 720]]) {
    await page.setViewportSize({ width, height })
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await record(`Login ${name} has no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    if (name === 'desktop' || name === 'mobile') await page.screenshot({ path: new URL(`login-${name}.png`, output).pathname, fullPage: true })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByLabel('Password', { exact: true }).focus()
  console.log('WAITING_FOR_LOCAL_LOGIN: Enter the existing admin password in the open Chrome window and submit. Do not send the password in chat. The test will continue automatically after a successful login.')
  const accepted = await page.waitForResponse((response) => response.url() === `${backend}/api/auth/login` && response.request().method() === 'POST' && response.status() === 200, { timeout: 600000 })
  const data = await accepted.json()
  const realUser = data.user
  await page.waitForURL('**/dashboard')
  await record('Real admin login reaches dashboard', data.success === true && realUser.username === 'admin')
  const profile = page.locator('.profile-card')
  await record('Dashboard displays actual API user', await profile.getByRole('heading', { name: realUser.username, exact: true }).isVisible()
    && await profile.getByText(realUser.email, { exact: true }).count() > 0
    && await profile.getByText(realUser.id, { exact: true }).isVisible()
    && (await profile.locator('.role-badge').first().textContent()).trim() === realUser.role)
  await record('Browser storage contains no credentials or token', await page.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0))
  const meAfterRefresh = page.waitForResponse((response) => response.url() === `${backend}/api/auth/me` && response.status() === 200)
  await page.reload()
  await meAfterRefresh
  await page.getByRole('heading', { name: 'Profile information', exact: true }).waitFor()
  await record('Dashboard refresh preserves authentication through real me API', new URL(page.url()).pathname === '/dashboard')
  await page.goto(`${frontend}/login`)
  await page.waitForURL('**/dashboard')
  await record('Authenticated login route redirects to dashboard', true)
  await page.getByRole('heading', { name: 'Profile information', exact: true }).waitFor()
  await page.screenshot({ path: new URL('dashboard-desktop.png', output).pathname, fullPage: true })
  for (const [name, width, height] of [['desktop', 1440, 1000], ['tablet', 820, 1180], ['mobile', 390, 844], ['small-mobile', 320, 720]]) {
    await page.setViewportSize({ width, height })
    await record(`Dashboard ${name} has no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    if (name === 'mobile') {
      await page.screenshot({ path: new URL('dashboard-mobile.png', output).pathname, fullPage: true })
      await page.getByRole('button', { name: 'Open navigation' }).click()
      const dialog = page.getByRole('dialog')
      await record('Mobile navigation drawer opens', await dialog.isVisible())
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'hidden' })
      await record('Mobile navigation closes with Escape', !(await dialog.isVisible()))
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  const check = page.waitForResponse((response) => response.url() === `${backend}/api/auth/me` && response.status() === 200)
  await page.getByRole('button', { name: 'Check session', exact: true }).click()
  await check
  await record('Check session calls real me API', true)
  const out = page.waitForResponse((response) => response.url() === `${backend}/api/auth/logout` && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Sign out of workspace', exact: true }).click()
  await record('Real logout API confirms success', (await out).status() === 200)
  await page.waitForURL('**/login')
  await record('Logout returns to login', true)
  const unauthorized = page.waitForResponse((response) => response.url() === `${backend}/api/auth/me` && response.status() === 401)
  await page.goto(`${frontend}/dashboard`)
  await unauthorized
  await page.waitForURL('**/login')
  await record('Dashboard cannot be accessed after logout', true)
  await page.waitForLoadState('networkidle')
  const relevant = network.filter((request) => request.path.startsWith('/api/auth/'))
  await record('No infinite authentication requests', relevant.length < 30, `Observed ${relevant.length} auth requests across explicit navigation and checks`)
  await record('No browser JavaScript runtime errors', pageErrors.length === 0)
  await record('No unexpected console errors', consoleErrors.every((entry) => entry.expected401), `${consoleErrors.length} expected HTTP 401 messages; no unexpected errors`)
  console.log('E2E_COMPLETE: Results and screenshots saved under frontend/test-results. No credentials or cookie values were saved.')
} catch (error) {
  // Do not print exception objects or call logs: they may contain input values.
  console.error(`E2E_STOPPED: ${error.name || 'Error'}. Inspect the last reported check. No secrets were logged.`)
  await save()
  process.exitCode = 1
} finally {
  await browser?.close()
}
