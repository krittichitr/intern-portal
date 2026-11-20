import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

// Intercept every API/image request. Never use real credentials or a database.
const base = process.env.PROFILE_PREVIEW_URL || 'http://127.0.0.1:5175'
const account = {
  id: 'b5fb354c-ab6d-4479-9c23-c57a437fd372', username: 'avatar_fixture',
  email: 'avatar@example.invalid', role: 'USER', firstName: 'Somchai',
  lastName: 'Jaidee', phone: '0812345678', avatarUrl: '/uploads/avatars/login-fixture.webp',
}
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', () => errors.push('runtime error'))
  let signedIn = false
  let meRequests = 0
  let logins = 0
  const headers = {
    'Access-Control-Allow-Origin': new URL(base).origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, accept',
  }
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (path.endsWith('/auth/me')) {
      meRequests++
      return route.fulfill({ status: signedIn ? 200 : 401, headers, json: signedIn ? { success: true, user: account } : { success: false } })
    }
    assert.equal(path.endsWith('/auth/login'), true, 'Unexpected API request')
    logins++
    signedIn = true
    return route.fulfill({ status: 200, headers, json: { success: true, message: 'Login successful', user: account } })
  })
  await page.route('**/uploads/avatars/**', (route) => route.fulfill({
    status: 200, headers, contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'),
  }))
  await page.goto(`${base}/login`)
  await page.getByRole('heading', { name: 'Welcome back.', exact: true }).waitFor()
  await page.getByLabel('Username', { exact: true }).fill(account.username)
  await page.getByLabel('Password', { exact: true }).fill('synthetic-browser-fixture')
  await page.getByRole('button', { name: 'Sign in to your workspace' }).click()
  await page.waitForURL('**/dashboard')
  for (const selector of ['.profile-card img', '.header-profile img', '.desktop-sidebar .sidebar-profile img']) {
    await page.locator(selector).waitFor()
    assert.equal(new URL(await page.locator(selector).getAttribute('src')).pathname, account.avatarUrl)
    assert.equal(await page.locator(selector).evaluate((image) => image.complete && image.naturalWidth > 0), true)
  }
  assert.equal(logins, 1)
  assert.equal(meRequests, 1, 'Avatar must appear from login response without a follow-up me request or refresh')
  await page.getByRole('link', { name: 'Profile', exact: true }).click()
  await page.getByText(account.firstName, { exact: true }).waitFor()
  await page.getByText(account.lastName, { exact: true }).waitFor()
  await page.getByText(account.phone, { exact: true }).waitFor()
  assert.equal(meRequests, 1)
  await page.reload()
  await page.getByRole('region', { name: 'Your profile details' }).getByRole('img').waitFor()
  assert.equal(meRequests, 2)
  assert.deepEqual(errors, [])
  console.log('PASS: mocked login immediately displays avatar in Dashboard/Header/Sidebar and full Profile data; refresh restores it through me; no runtime errors')
} finally {
  await browser.close()
}
