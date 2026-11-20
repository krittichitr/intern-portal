import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright-core'

// Every API/image request is intercepted. No credentials or database writes.
const base = process.env.PROFILE_PREVIEW_URL || 'http://127.0.0.1:5175'
const output = new URL('../test-results/', import.meta.url)
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const account = {
  id: 'b5fb354c-ab6d-4479-9c23-c57a437fd372', username: 'profile_fixture',
  email: 'profile@example.invalid', role: 'USER', firstName: 'Somchai',
  lastName: 'Jaidee', phone: '0812345678', avatarUrl: '/uploads/avatars/fixture.png',
}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  const errors = []
  page.on('pageerror', () => errors.push('runtime error'))
  let authenticated = true
  let brokenImage = false
  let meRequests = 0
  let writes = 0
  let patchRequests = 0
  let duplicateEmail = false
  let uploadRequests = 0
  let uploadStatus = 200
  const cors = {
    'Access-Control-Allow-Origin': new URL(base).origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, accept',
  }
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (path.endsWith('/auth/me')) {
      meRequests++
      return route.fulfill({ status: authenticated ? 200 : 401, headers: cors, json: authenticated ? { success: true, user: account } : { success: false } })
    }
    if (path.endsWith('/profile/me') && request.method() === 'PATCH') {
      patchRequests++
      const changes = request.postDataJSON()
      assert.deepEqual(Object.keys(changes).sort(), ['email', 'firstName', 'phone'])
      await new Promise((resolve) => setTimeout(resolve, 150))
      if (duplicateEmail) return route.fulfill({ status: 409, headers: cors, json: { success: false } })
      Object.assign(account, changes)
      return route.fulfill({ status: 200, headers: cors, json: { success: true, user: account } })
    }
    if (path.endsWith('/profile/me/avatar') && request.method() === 'POST') {
      uploadRequests++
      assert.match(request.headers()['content-type'], /^multipart\/form-data; boundary=/)
      const parts = [...request.postDataBuffer().toString('latin1').matchAll(/Content-Disposition: form-data; name="([^"]+)"/g)]
      assert.deepEqual(parts.map((part) => part[1]), ['avatar'])
      await new Promise((resolve) => setTimeout(resolve, 150))
      if (uploadStatus !== 200) return route.fulfill({ status: uploadStatus, headers: cors, json: { success: false } })
      account.avatarUrl = '/uploads/avatars/new-photo.webp'
      return route.fulfill({ status: 200, headers: cors, json: { success: true, user: account } })
    }
    if (path.endsWith('/auth/logout')) {
      authenticated = false
      return route.fulfill({ status: 200, headers: cors, json: { success: true } })
    }
    writes++
    return route.fulfill({ status: 400, headers: cors, json: { success: false } })
  })
  await page.route('**/uploads/avatars/**', (route) => route.fulfill({
    status: brokenImage ? 404 : 200, headers: cors, contentType: 'image/png',
    body: brokenImage ? '' : Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'),
  }))
  const details = page.getByRole('region', { name: 'Your profile details' })
  await page.goto(`${base}/profile`)
  await page.getByRole('heading', { name: 'Your profile', exact: true }).waitFor()
  await details.getByRole('img').waitFor()
  assert.equal(await details.getByRole('img').evaluate((image) => image.complete && image.naturalWidth > 0), true)
  assert.equal(await details.getByText(account.firstName, { exact: true }).isVisible(), true)
  assert.equal(await page.getByRole('link', { name: 'Profile', exact: true }).getAttribute('aria-current'), 'page')
  assert.equal(meRequests, 1)
  console.log('PASS: protected profile displays mocked API data and a loaded backend image')
  for (const [width, height] of [[1440, 1000], [820, 1180], [390, 844], [320, 720]]) {
    await page.setViewportSize({ width, height })
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    if (width === 1440 || width === 390) await page.screenshot({ path: new URL(`profile-${width}.png`, output).pathname, fullPage: true })
  }
  console.log('PASS: desktop/tablet/mobile layouts have no horizontal overflow')
  await page.reload()
  await details.getByText(account.phone, { exact: true }).waitFor()
  assert.equal(meRequests, 2)
  console.log('PASS: refresh restores profile through one me request')
  await page.getByRole('button', { name: 'Open navigation' }).click()
  const drawer = page.getByRole('dialog', { name: 'Workspace navigation' })
  await drawer.getByRole('link', { name: 'Dashboard', exact: true }).click()
  await page.waitForURL('**/dashboard')
  await drawer.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await drawer.getByRole('link', { name: 'Profile', exact: true }).click()
  await page.waitForURL('**/profile')
  await drawer.waitFor({ state: 'hidden' })
  console.log('PASS: mobile drawer navigation works in both directions and closes')
  await page.getByRole('button', { name: 'Edit Profile', exact: true }).click()
  await page.getByRole('textbox', { name: /First Name/ }).fill('Discarded')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal(patchRequests, 0)
  await details.getByText(account.firstName, { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Edit Profile', exact: true }).click()
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('invalid')
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
  await page.getByText('Enter a valid email address.', { exact: true }).waitFor()
  assert.equal(patchRequests, 0)
  await page.getByRole('textbox', { name: /First Name/ }).fill('Updated')
  await page.getByRole('textbox', { name: /Phone Number/ }).fill('0812223333')
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('updated@example.invalid')
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    if (width !== 320) await page.screenshot({ path: new URL(`profile-edit-${width}.png`, output).pathname, fullPage: true })
  }
  duplicateEmail = true
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
  await page.getByText('This email address is already in use. Try another one.', { exact: true }).first().waitFor()
  assert.equal(await page.getByRole('textbox', { name: 'Email', exact: true }).getAttribute('aria-invalid'), 'true')
  assert.equal(await page.getByRole('textbox', { name: 'Email', exact: true }).inputValue(), 'updated@example.invalid')
  duplicateEmail = false
  await page.getByRole('button', { name: 'Save Changes', exact: true }).dblclick()
  await page.locator('[data-sonner-toast][data-type="success"]', { hasText: 'Profile updated successfully.' }).waitFor()
  assert.equal(patchRequests, 2)
  await details.getByText('Updated', { exact: true }).waitFor()
  await page.reload()
  await details.getByText('Updated', { exact: true }).waitFor()
  console.log('PASS: edit/cancel/validation/409/retry/single save/profile update/refresh with mocked PATCH')
  const photoPicker = page.getByLabel('Choose profile photo', { exact: true })
  const photoBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
  const photo = { name: 'avatar.png', mimeType: 'image/png', buffer: photoBytes }
  await photoPicker.setInputFiles(photo)
  await page.getByRole('img', { name: 'Selected photo preview' }).waitFor()
  await page.getByRole('button', { name: 'Cancel photo selection' }).click()
  assert.equal(uploadRequests, 0)
  assert.equal(await page.getByRole('img', { name: 'Selected photo preview' }).count(), 0)
  await photoPicker.setInputFiles({ name: 'avatar.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') })
  await page.getByRole('alert').filter({ hasText: 'Choose a JPG, PNG or WebP image.' }).waitFor()
  await photoPicker.setInputFiles({ name: 'too-large.png', mimeType: 'image/png', buffer: Buffer.alloc(2 * 1024 * 1024 + 1) })
  await page.getByRole('alert').filter({ hasText: 'Choose an image no larger than 2 MiB.' }).waitFor()
  assert.equal(uploadRequests, 0)
  await photoPicker.setInputFiles(photo)
  const preview = page.getByRole('img', { name: 'Selected photo preview' })
  await preview.waitFor()
  await page.waitForFunction(() => document.querySelector('img[alt="Selected photo preview"]')?.naturalWidth > 0)
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    if (width !== 320) await page.screenshot({ path: new URL(`profile-photo-${width}.png`, output).pathname, fullPage: true })
  }
  uploadStatus = 500
  await page.getByRole('button', { name: 'Upload Photo', exact: true }).click()
  await page.locator('[data-sonner-toast][data-type="error"]', { hasText: 'Couldn’t upload your photo.' }).waitFor()
  assert.equal(await preview.isVisible(), true)
  assert.notEqual(account.avatarUrl, '/uploads/avatars/new-photo.webp')
  uploadStatus = 200
  await page.getByRole('button', { name: 'Upload Photo', exact: true }).dblclick()
  await page.locator('[data-sonner-toast][data-type="success"]', { hasText: 'Profile photo updated successfully.' }).waitFor()
  await page.screenshot({ path: new URL('toast-photo-mobile.png', output).pathname, fullPage: true })
  assert.equal(uploadRequests, 2)
  assert.equal(await preview.count(), 0)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: new URL('toast-photo-desktop.png', output).pathname, fullPage: true })
  for (const selector of ['.profile-identity img', '.header-profile img', '.desktop-sidebar .sidebar-profile img']) {
    await page.locator(selector).waitFor()
    assert.equal(new URL(await page.locator(selector).getAttribute('src')).pathname, account.avatarUrl)
  }
  await page.getByRole('link', { name: 'Back to Dashboard', exact: true }).click()
  await page.locator('.profile-card img').waitFor()
  assert.equal(new URL(await page.locator('.profile-card img').getAttribute('src')).pathname, account.avatarUrl)
  await page.getByRole('link', { name: 'Profile', exact: true }).click()
  await page.reload()
  await details.getByRole('img').waitFor()
  assert.equal(new URL(await details.getByRole('img').getAttribute('src')).pathname, account.avatarUrl)
  await page.setViewportSize({ width: 320, height: 1000 })
  console.log('PASS: photo preview/cancel/type/size/500/retry, multipart boundary and single upload update every avatar and survive refresh (mocked API)')
  brokenImage = true
  await page.reload()
  await details.getByText('PF', { exact: true }).waitFor()
  assert.equal(await details.getByRole('img').count(), 0)
  account.avatarUrl = null
  account.firstName = null
  account.lastName = null
  account.phone = null
  await page.reload()
  await details.getByText('PF', { exact: true }).waitFor()
  assert.equal(await details.getByText('Not provided', { exact: true }).count(), 3)
  console.log('PASS: broken/missing images show fallback and null fields show Not provided')
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await drawer.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.waitForURL('**/login')
  await page.goto(`${base}/profile`)
  await page.waitForURL('**/login')
  assert.equal(writes, 0)
  assert.deepEqual(errors, [])
  console.log('PASS: logout blocks profile; no unexpected API calls or browser runtime errors')
} finally {
  await browser.close()
}
