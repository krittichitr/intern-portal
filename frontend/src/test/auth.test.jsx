import { mockMenus } from './menu-fixtures'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import MockAdapter from 'axios-mock-adapter'
import api from '@/lib/api'
import { AuthProvider } from '@/context/AuthContext'
import { useAuth } from '@/context/useAuth'
import App from '@/App'

const account = { id: 'b5fb354c-ab6d-4479-9c23-c57a437fd372', username: 'fixture_user', email: 'fixture@example.invalid', role: 'USER' }
let mock
function Location() { return <output data-testid="location">{useLocation().pathname}</output> }
function mount(path = '/login') {
  return render(<StrictMode><MemoryRouter initialEntries={[path]}><AuthProvider><App /><Location /></AuthProvider></MemoryRouter></StrictMode>)
}
const loginButton = () => screen.getByRole('button', { name: 'Sign in to your workspace' })
async function fillLogin() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Username', { exact: true }), account.username)
  // Synthetic non-credential test input; never an actual account password.
  await user.type(screen.getByLabelText('Password', { exact: true }), crypto.randomUUID())
  return user
}

beforeEach(() => { mock = new MockAdapter(api); mockMenus(mock); mock.onGet('/auth/me').reply(401) })
afterEach(() => mock.restore())

describe('Authentication UI and routing', () => {
  it('deduplicates initial me in StrictMode and guards dashboard', async () => {
    mount('/dashboard')
    await screen.findByRole('heading', { name: 'Welcome back.' })
    expect(screen.getByTestId('location')).toHaveTextContent('/login')
    expect(mock.history.get.filter((r) => r.url === '/auth/me')).toHaveLength(1)
    expect(mock.history.get[0].withCredentials).toBe(true)
  })
  it('shows loading while me is unresolved', async () => {
    let finish
    mock.resetHandlers(); mockMenus(mock)
    mock.onGet('/auth/me').reply(() => new Promise((resolve) => { finish = resolve }))
    mount('/dashboard')
    expect(screen.getByRole('heading', { name: 'Opening your workspace…' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Welcome back.' })).not.toBeInTheDocument()
    await act(async () => finish([401, {}]))
    await screen.findByRole('heading', { name: 'Welcome back.' })
  })
  it('validates empty fields, focuses username, and makes no login request', async () => {
    mount()
    const user = userEvent.setup()
    await screen.findByRole('heading', { name: 'Welcome back.' })
    await user.click(loginButton())
    expect(screen.getByText('Enter your username.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
    expect(screen.getByLabelText('Username', { exact: true })).toHaveFocus()
    expect(mock.history.post).toHaveLength(0)
  })
  it('supports show/hide password without submitting the form', async () => {
    mount()
    await screen.findByRole('heading', { name: 'Welcome back.' })
    const user = userEvent.setup()
    const password = screen.getByLabelText('Password', { exact: true })
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')
    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(password).toHaveAttribute('type', 'password')
    expect(mock.history.post).toHaveLength(0)
  })
  it('uses login user immediately, supports Enter, and never writes browser storage', async () => {
    mock.onPost('/auth/login').reply(200, { success: true, user: account })
    mount()
    await screen.findByRole('heading', { name: 'Welcome back.' })
    const user = await fillLogin()
    await user.keyboard('{Enter}')
    await screen.findByRole('heading', { name: 'Profile information' })
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard')
    const profile = document.querySelector('.profile-card')
    expect(within(profile).getByText(account.id)).toBeInTheDocument()
    expect(within(profile).getAllByText(account.email)).toHaveLength(2)
    expect(mock.history.get.filter((r) => r.url === '/auth/me')).toHaveLength(1)
    expect(mock.history.post[0].withCredentials).toBe(true)
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })
  it('shows invalid-credentials errors and stays on login', async () => {
    mock.onPost('/auth/login').reply(401, { success: false })
    mount()
    await screen.findByRole('heading', { name: 'Welcome back.' })
    const user = await fillLogin()
    await user.click(loginButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('That username and password don’t match.')
    expect(screen.getByTestId('location')).toHaveTextContent('/login')
    expect(loginButton()).not.toBeDisabled()
  })
  it('explains an unconfigured account role on login without treating it as wrong credentials', async () => {
    mock.onPost('/auth/login').reply(403, { success: false, code: 'RBAC_NOT_READY' })
    mount()
    await screen.findByRole('heading', { name: 'Welcome back.' })
    const user = await fillLogin()
    await user.click(loginButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('Your account role isn’t configured.')
    expect(screen.getByTestId('location')).toHaveTextContent('/login')
  })
  it('disables submit and prevents duplicate login requests', async () => {
    let finish
    mock.onPost('/auth/login').reply(() => new Promise((resolve) => { finish = resolve }))
    mount()
    await screen.findByRole('heading', { name: 'Welcome back.' })
    const user = await fillLogin()
    await user.dblClick(loginButton())
    expect(screen.getByRole('button', { name: 'Signing you in…' })).toBeDisabled()
    expect(mock.history.post).toHaveLength(1)
    await act(async () => finish([200, { success: true, user: account }]))
    await screen.findByRole('heading', { name: 'Profile information' })
  })
  it('rejects oversized UTF-8 passwords before calling API', async () => {
    mount()
    await screen.findByRole('heading', { name: 'Welcome back.' })
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Username', { exact: true }), account.username)
    await user.type(screen.getByLabelText('Password', { exact: true }), 'ก'.repeat(25))
    await user.click(loginButton())
    expect(screen.getByText('Your password is too long. Use 72 bytes or fewer.')).toBeInTheDocument()
    expect(mock.history.post).toHaveLength(0)
  })
  it('restores a valid session from me and redirects signed-in login', async () => {
    mock.resetHandlers(); mockMenus(mock)
    mock.onGet('/auth/me').reply(200, { success: true, user: account })
    const view = mount('/login')
    await screen.findByRole('heading', { name: 'Profile information' })
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard')
    view.unmount()
    mount('/dashboard')
    await screen.findByRole('heading', { name: 'Profile information' })
    expect(mock.history.get.filter((r) => r.url === '/auth/me')).toHaveLength(2)
  })
  it('clears user only after confirmed logout and protects dashboard afterwards', async () => {
    mock.resetHandlers(); mockMenus(mock)
    mock.onGet('/auth/me').reply(200, { success: true, user: account })
    mock.onPost('/auth/logout').reply(200, { success: true })
    const view = mount('/dashboard')
    const user = userEvent.setup()
    await screen.findByRole('heading', { name: 'Profile information' })
    await user.click(screen.getByRole('button', { name: 'Sign out of workspace' }))
    await screen.findByRole('heading', { name: 'Welcome back.' })
    expect(screen.queryByText(account.id)).not.toBeInTheDocument()
    view.unmount()
    mock.resetHandlers(); mockMenus(mock)
    mock.onGet('/auth/me').reply(401)
    mount('/dashboard')
    await screen.findByRole('heading', { name: 'Welcome back.' })
    expect(screen.getByTestId('location')).toHaveTextContent('/login')
  })
  it('keeps the user signed in when logout fails', async () => {
    mock.resetHandlers(); mockMenus(mock)
    mock.onGet('/auth/me').reply(200, { success: true, user: account })
    mock.onPost('/auth/logout').reply(500)
    mount('/dashboard')
    await screen.findByRole('heading', { name: 'Profile information' })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Sign out of workspace' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('You’re still signed in.')
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard')
    expect(screen.getByText(account.id)).toBeInTheDocument()
  })
  it('distinguishes an unavailable backend from 401 and supports retry', async () => {
    mock.resetHandlers(); mockMenus(mock)
    mock.onGet('/auth/me').networkErrorOnce()
    mock.onGet('/auth/me').reply(401)
    mount('/dashboard')
    await screen.findByRole('heading', { name: 'Let’s get you connected.' })
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('heading', { name: 'Welcome back.' })
    expect(screen.getByTestId('location')).toHaveTextContent('/login')
  })
  it('redirects to login if an explicit session check returns 401', async () => {
    mock.resetHandlers(); mockMenus(mock)
    mock.onGet('/auth/me').replyOnce(200, { success: true, user: account })
    mock.onGet('/auth/me').reply(401)
    mount('/dashboard')
    await screen.findByRole('heading', { name: 'Profile information' })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Check session' }))
    await screen.findByRole('heading', { name: 'Welcome back.' })
    expect(mock.history.get.filter((r) => r.url === '/auth/me')).toHaveLength(2)
  })
  it('shows a role configuration error on refresh and can retry after the role is repaired', async () => {
    mock.resetHandlers(); mockMenus(mock)
    mock.onGet('/auth/me').replyOnce(403, { success: false, code: 'RBAC_NOT_READY' })
    mock.onGet('/auth/me').reply(200, { success: true, user: account })
    mount('/dashboard')
    await screen.findByRole('heading', { name: 'Your account needs attention.' })
    expect(screen.getByText('Your account role isn’t configured. Contact an administrator.')).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('heading', { name: 'Profile information' })
    expect(mock.history.post).toHaveLength(0)
  })
  it('removes stale user data when a session check reports an unconfigured role without calling logout', async () => {
    mock.resetHandlers(); mockMenus(mock)
    mock.onGet('/auth/me').replyOnce(200, { success: true, user: account })
    mock.onGet('/auth/me').reply(403, { success: false, code: 'RBAC_NOT_READY' })
    mount('/dashboard')
    await screen.findByRole('heading', { name: 'Profile information' })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Check session' }))
    await screen.findByRole('heading', { name: 'Your account needs attention.' })
    expect(screen.queryByText(account.id)).not.toBeInTheDocument()
    expect(mock.history.post).toHaveLength(0)
  })
  it('opens the mobile drawer and supports Escape', async () => {
    mock.resetHandlers(); mockMenus(mock)
    mock.onGet('/auth/me').reply(200, { success: true, user: account })
    mount('/dashboard')
    await screen.findByRole('heading', { name: 'Profile information' })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    expect(screen.getByRole('dialog', { name: 'Workspace navigation' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})


const emptyProfile = { firstName: null, lastName: null, phone: null, avatarUrl: null }
const profile = { firstName: 'Somchai', lastName: 'Jaidee', phone: '0812345678', avatarUrl: '/uploads/avatars/example.webp' }
function mountAuth() {
  return renderHook(() => useAuth(), {
    wrapper: ({ children }) => <StrictMode><AuthProvider>{children}</AuthProvider></StrictMode>,
  })
}

describe('Authentication profile state', () => {
  it.each([
    ['missing', {}],
    ['null', emptyProfile],
    ['present', profile],
  ])('restores %s optional fields from me and excludes private fields', async (_label, fields) => {
    mock.resetHandlers(); mockMenus(mock)
    mock.onGet('/auth/me').reply(200, {
      success: true,
      user: { ...account, ...fields, password: 'synthetic', password_hash: 'synthetic', token: 'synthetic', JWT: 'synthetic' },
    })
    const { result } = mountAuth()
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.user).toEqual({ ...account, ...emptyProfile, ...fields })
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.authError).toBeNull()
    expect(mock.history.get.filter((r) => r.url === '/auth/me')).toHaveLength(1)
  })

  it.each([
    ['legacy', {}],
    ['profile', profile],
  ])('accepts a %s login response without an extra me request', async (_label, fields) => {
    mock.onPost('/auth/login').reply(200, { success: true, user: { ...account, ...fields, password_hash: 'synthetic' } })
    const { result } = mountAuth()
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const expected = { ...account, ...emptyProfile, ...fields }
    let loggedIn
    await act(async () => { loggedIn = await result.current.login(account.username, crypto.randomUUID()) })
    expect(loggedIn).toEqual(expected)
    expect(result.current.user).toEqual(expected)
    expect(mock.history.get.filter((r) => r.url === '/auth/me')).toHaveLength(1)
  })

  it.each(['firstName', 'lastName', 'phone', 'avatarUrl'])('rejects invalid %s types through existing error handling', async (key) => {
    mock.resetHandlers(); mockMenus(mock)
    mock.onGet('/auth/me').reply(401)
    const { result } = mountAuth()
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Each non-string JSON type must be rejected, rather than entering state.
    for (const invalid of [42, false, {}, []]) {
      mock.onGet('/auth/me').reply(200, { success: true, user: { ...account, ...profile, [key]: invalid } })
      await act(async () => { await result.current.checkAuth() })
      expect(result.current.user).toBeNull()
      expect(result.current.authError).toBeTruthy()
    }
  })

  it.each(['id', 'username', 'email', 'role'])('preserves validation of required %s', async (key) => {
    mock.resetHandlers(); mockMenus(mock)
    mock.onGet('/auth/me').reply(200, { success: true, user: { ...account, ...profile, [key]: 42 } })
    const { result } = mountAuth()
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.user).toBeNull()
    expect(result.current.authError).toBeTruthy()
  })

  it('keeps the last valid profile on a malformed recheck or login response', async () => {
    mock.resetHandlers(); mockMenus(mock)
    mock.onGet('/auth/me').reply(200, { success: true, user: { ...account, ...profile } })
    const { result } = mountAuth()
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    mock.onGet('/auth/me').reply(200, { success: true, user: { ...account, phone: 42 } })
    await act(async () => { await result.current.checkAuth() })
    expect(result.current.user).toEqual({ ...account, ...profile })
    expect(result.current.authError).toBeTruthy()
    mock.onPost('/auth/login').reply(200, { success: true, user: { ...account, avatarUrl: {} } })
    await act(async () => {
      await expect(result.current.login(account.username, crypto.randomUUID())).rejects.toThrow('Unexpected account response')
    })
    expect(result.current.user).toEqual({ ...account, ...profile })
  })

  it('deduplicates rechecks and updates profile data from the latest me response', async () => {
    mock.resetHandlers(); mockMenus(mock)
    mock.onGet('/auth/me').reply(200, { success: true, user: account })
    const { result } = mountAuth()
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    let finish
    mock.onGet('/auth/me').reply(() => new Promise((resolve) => { finish = resolve }))
    let pending
    act(() => {
      pending = result.current.checkAuth()
      expect(result.current.checkAuth()).toBe(pending)
    })
    await act(async () => {
      finish([200, { success: true, user: { ...account, ...profile } }])
      await pending
    })
    expect(result.current.user).toEqual({ ...account, ...profile })
    expect(mock.history.get.filter((r) => r.url === '/auth/me')).toHaveLength(2)
    expect(result.current.lastCheckedAt).toBeInstanceOf(Date)
  })

  it('does not restore a profile from a stale recheck after confirmed logout', async () => {
    mock.resetHandlers(); mockMenus(mock)
    mock.onGet('/auth/me').reply(200, { success: true, user: { ...account, ...profile } })
    mock.onPost('/auth/logout').reply(200, { success: true })
    const { result } = mountAuth()
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    let finish
    mock.onGet('/auth/me').reply(() => new Promise((resolve) => { finish = resolve }))
    let pending
    act(() => { pending = result.current.checkAuth() })
    await act(async () => { await result.current.logout() })
    await act(async () => {
      finish([200, { success: true, user: { ...account, ...profile } }])
      await pending
    })
    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.lastCheckedAt).toBeNull()
  })
})


describe('Confirmed profile updates in AuthContext', () => {
  async function signedIn() {
    mock.resetHandlers(); mockMenus(mock)
    mock.onGet('/auth/me').reply(200, { success: true, user: { ...account, ...profile } })
    const view = mountAuth()
    await waitFor(() => expect(view.result.current.isLoading).toBe(false))
    return view
  }

  it.each([200, 401, 403, 500])('ignores a stale me response (%s) after a profile update', async (status) => {
    const { result } = await signedIn()
    let finishCheck
    mock.onGet('/auth/me').reply(() => new Promise((resolve) => { finishCheck = resolve }))
    let pending
    act(() => { pending = result.current.checkAuth() })
    const updated = { ...account, ...profile, email: 'updated@example.invalid' }
    mock.onPatch('/profile/me').reply(200, { success: true, user: { ...updated, password_hash: 'synthetic' } })
    await act(async () => { await result.current.updateProfile({ email: updated.email }) })
    await act(async () => {
      finishCheck([status, { success: status === 200, ...(status === 403 ? { code: 'RBAC_NOT_READY' } : {}), user: { ...account, ...profile } }])
      await pending
    })
    expect(result.current.user).toEqual(updated)
    expect(result.current.authError).toBeNull()
    expect(mock.history.get.filter((r) => r.url === '/auth/me')).toHaveLength(2)
  })

  it.each(['profile', 'avatar'])('does not restore user data from a pending %s update after role mapping is lost', async (kind) => {
    const { result } = await signedIn()
    let finish, pending, failure
    if (kind === 'profile') mock.onPatch('/profile/me').reply(() => new Promise((resolve) => { finish = resolve }))
    else mock.onPost('/profile/me/avatar').reply(() => new Promise((resolve) => { finish = resolve }))
    act(() => {
      const request = kind === 'profile'
        ? result.current.updateProfile({ firstName: 'Changed' })
        : result.current.uploadAvatar(new File(['fixture'], 'fixture.png', { type: 'image/png' }))
      pending = request.catch((error) => { failure = error })
    })
    mock.onGet('/auth/me').reply(403, { success: false, code: 'RBAC_NOT_READY' })
    await act(async () => { await result.current.checkAuth() })
    await act(async () => {
      finish([200, { success: true, user: { ...account, ...profile, avatarUrl: '/uploads/avatars/fixture.webp' } }])
      await pending
    })
    expect(failure.message).toContain('Your session changed')
    expect(result.current.user).toBeNull()
    expect(result.current.authErrorCode).toBe('RBAC_NOT_READY')
    expect(mock.history.post.filter((request) => request.url === '/auth/logout')).toHaveLength(0)
  })

  it('deduplicates pending profile updates', async () => {
    const { result } = await signedIn()
    let finish
    mock.onPatch('/profile/me').reply(() => new Promise((resolve) => { finish = resolve }))
    let pending
    act(() => {
      pending = result.current.updateProfile({ firstName: 'Changed' })
      expect(result.current.updateProfile({ firstName: 'Changed' })).toBe(pending)
    })
    await act(async () => {
      finish([200, { success: true, user: { ...account, ...profile, firstName: 'Changed' } }])
      await pending
    })
    expect(mock.history.patch).toHaveLength(1)
    expect(result.current.user.firstName).toBe('Changed')
  })

  it('does not restore user state from an update completed after logout', async () => {
    const { result } = await signedIn()
    let finish
    mock.onPatch('/profile/me').reply(() => new Promise((resolve) => { finish = resolve }))
    mock.onPost('/auth/logout').reply(200, { success: true })
    let pending
    act(() => { pending = result.current.updateProfile({ firstName: 'Changed' }) })
    await act(async () => { await result.current.logout() })
    await act(async () => {
      const rejected = expect(pending).rejects.toThrow('Your session changed')
      finish([200, { success: true, user: { ...account, ...profile, firstName: 'Changed' } }])
      await rejected
    })
    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
  })

  it.each([
    { success: false, user: { ...account, ...profile } },
    { success: 'false', user: { ...account, ...profile } },
    { success: true, user: { ...account, ...profile, phone: {} } },
    { success: true, user: { ...account, ...profile, id: 'another-user' } },
  ])('rejects unconfirmed or invalid response data without changing state', async (body) => {
    const { result } = await signedIn()
    mock.onPatch('/profile/me').reply(200, body)
    await act(async () => {
      await expect(result.current.updateProfile({ firstName: 'Changed' })).rejects.toThrow('Unexpected account response')
    })
    expect(result.current.user).toEqual({ ...account, ...profile })
  })

  it('does not send privileged fields through the profile helper', async () => {
    const { result } = await signedIn()
    await expect(result.current.updateProfile({ role: 'ADMIN' })).rejects.toThrow('Invalid profile update')
    expect(mock.history.patch).toHaveLength(0)
  })
})


describe('Confirmed avatar updates in AuthContext', () => {
  const photo = () => new File(['synthetic image'], 'avatar.png', { type: 'image/png' })
  const updated = { ...account, ...profile, avatarUrl: '/uploads/avatars/new.webp' }
  async function signedIn() {
    mock.resetHandlers(); mockMenus(mock)
    mock.onGet('/auth/me').reply(200, { success: true, user: { ...account, ...profile } })
    const view = mountAuth()
    await waitFor(() => expect(view.result.current.isLoading).toBe(false))
    return view
  }

  it('deduplicates uploads and prevents an older me response from replacing the new avatar', async () => {
    const { result } = await signedIn()
    let finishCheck, finishUpload
    mock.onGet('/auth/me').reply(() => new Promise((resolve) => { finishCheck = resolve }))
    mock.onPost('/profile/me/avatar').reply(() => new Promise((resolve) => { finishUpload = resolve }))
    let check, upload
    act(() => {
      check = result.current.checkAuth()
      upload = result.current.uploadAvatar(photo())
      expect(result.current.uploadAvatar(photo())).toBe(upload)
    })
    await act(async () => {
      finishUpload([200, { success: true, user: updated }])
      await upload
      finishCheck([200, { success: true, user: { ...account, ...profile } }])
      await check
    })
    expect(result.current.user).toEqual(updated)
    expect(mock.history.post).toHaveLength(1)
  })

  it('ignores an old upload response after newer profile data has been applied', async () => {
    const { result } = await signedIn()
    let finish
    mock.onPost('/profile/me/avatar').reply(() => new Promise((resolve) => { finish = resolve }))
    const newer = { ...account, ...profile, email: 'newer@example.invalid' }
    mock.onPatch('/profile/me').reply(200, { success: true, user: newer })
    let upload
    act(() => { upload = result.current.uploadAvatar(photo()) })
    await act(async () => { await result.current.updateProfile({ email: newer.email }) })
    await act(async () => {
      const rejected = expect(upload).rejects.toThrow('Your session changed')
      finish([200, { success: true, user: updated }])
      await rejected
    })
    expect(result.current.user).toEqual(newer)
  })

  it('does not restore user state when upload completes after logout', async () => {
    const { result } = await signedIn()
    let finish
    mock.onPost('/profile/me/avatar').reply(() => new Promise((resolve) => { finish = resolve }))
    mock.onPost('/auth/logout').reply(200, { success: true })
    let upload
    act(() => { upload = result.current.uploadAvatar(photo()) })
    await act(async () => { await result.current.logout() })
    await act(async () => {
      const rejected = expect(upload).rejects.toThrow('Your session changed')
      finish([200, { success: true, user: updated }])
      await rejected
    })
    expect(result.current.user).toBeNull()
  })

  it.each([
    { success: false, user: updated },
    { success: true, user: { ...updated, avatarUrl: null } },
    { success: true, user: { ...updated, id: 'another-user' } },
    { success: true, user: { ...updated, phone: {} } },
  ])('rejects an invalid upload response without changing public state', async (body) => {
    const { result } = await signedIn()
    mock.onPost('/profile/me/avatar').reply(200, body)
    await act(async () => {
      await expect(result.current.uploadAvatar(photo())).rejects.toThrow('Unexpected account response')
    })
    expect(result.current.user).toEqual({ ...account, ...profile })
  })
})
