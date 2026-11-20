import { mockMenus } from './menu-fixtures'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import MockAdapter from 'axios-mock-adapter'
import api, { resolveAvatarUrl } from '@/lib/api'
import { AuthProvider } from '@/context/AuthContext'
import App from '@/App'

const account = {
  id: 'b5fb354c-ab6d-4479-9c23-c57a437fd372', username: 'profile_fixture',
  email: 'profile@example.invalid', role: 'USER', firstName: 'Somchai',
  lastName: 'Jaidee', phone: '0812345678', avatarUrl: null,
}
let mock
const originalBaseURL = api.defaults.baseURL
function Location() { return <output data-testid="location">{useLocation().pathname}</output> }
function mount(path = '/profile') {
  return render(<StrictMode><MemoryRouter initialEntries={[path]}><AuthProvider><App /><Location /></AuthProvider></MemoryRouter></StrictMode>)
}
function profileDetails() { return screen.getByRole('region', { name: 'Your profile details', hidden: true }) }

beforeEach(() => {
  mock = new MockAdapter(api)
  mockMenus(mock)
  mock.onGet('/auth/me').reply(200, { success: true, user: account })
})
afterEach(() => { mock.restore(); api.defaults.baseURL = originalBaseURL })

describe('Protected read-only profile', () => {
  it('displays context data, marks Profile active and makes no profile write requests', async () => {
    mount()
    await screen.findByRole('heading', { name: 'Your profile' })
    const details = within(profileDetails())
    for (const value of [account.username, account.firstName, account.lastName, account.phone, account.email, account.role]) {
      expect(details.getAllByText(value).length).toBeGreaterThan(0)
    }
    expect(screen.getByRole('link', { name: 'Profile', exact: true })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Dashboard', exact: true })).not.toHaveAttribute('aria-current')
    expect(mock.history.get.filter((r) => r.url === '/auth/me')).toHaveLength(1)
    expect(mock.history.post).toHaveLength(0)
    expect(mock.history.patch).toHaveLength(0)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('uses Not provided for null fields and an initials avatar without an image', async () => {
    mock.onGet('/auth/me').reply(200, { success: true, user: { ...account, firstName: null, lastName: null, phone: null } })
    mount()
    await screen.findByRole('heading', { name: 'Your profile' })
    expect(within(profileDetails()).getAllByText('Not provided')).toHaveLength(3)
    expect(within(profileDetails()).getByText('PF')).toBeInTheDocument()
    expect(within(profileDetails()).queryByRole('img')).not.toBeInTheDocument()
  })

  it('restores the profile on a fresh mount through the existing me flow', async () => {
    const first = mount()
    await screen.findByRole('heading', { name: 'Your profile' })
    first.unmount()
    mount()
    await screen.findByRole('heading', { name: 'Your profile' })
    expect(within(profileDetails()).getByText(account.firstName)).toBeInTheDocument()
    expect(mock.history.get.filter((r) => r.url === '/auth/me')).toHaveLength(2)
  })

  it('redirects unauthenticated profile access to login', async () => {
    mock.onGet('/auth/me').reply(401)
    mount()
    await screen.findByRole('heading', { name: 'Welcome back.' })
    expect(screen.getByTestId('location')).toHaveTextContent('/login')
    expect(screen.queryByRole('heading', { name: 'Your profile' })).not.toBeInTheDocument()
  })

  it('supports Profile navigation in the mobile drawer and a return to Dashboard', async () => {
    mount('/dashboard')
    await screen.findByRole('heading', { name: 'Profile information' })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    const dialog = screen.getByRole('dialog', { name: 'Workspace navigation' })
    await user.click(within(dialog).getByRole('link', { name: 'Profile', exact: true }))
    await screen.findByRole('heading', { name: 'Your profile' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(screen.getByRole('link', { name: 'Back to Dashboard' }))
    await screen.findByRole('heading', { name: 'Welcome back, profile_fixture!' })
    expect(screen.getByRole('link', { name: 'Dashboard', exact: true })).toHaveAttribute('aria-current', 'page')
    expect(mock.history.get.filter((r) => r.url === '/auth/me')).toHaveLength(1)
  })

  it('logs out through the existing context and guards a later profile visit', async () => {
    mock.onPost('/auth/logout').reply(200, { success: true })
    const view = mount()
    await screen.findByRole('heading', { name: 'Your profile' })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out', exact: true }))
    await screen.findByRole('heading', { name: 'Welcome back.' })
    expect(mock.history.post).toHaveLength(1)
    view.unmount()
    mock.onGet('/auth/me').reply(401)
    mount()
    await screen.findByRole('heading', { name: 'Welcome back.' })
    expect(screen.getByTestId('location')).toHaveTextContent('/login')
  })

  it('preserves the profile when logout fails', async () => {
    mock.onPost('/auth/logout').reply(500)
    mount()
    await screen.findByRole('heading', { name: 'Your profile' })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out', exact: true }))
    expect(await screen.findByRole('alert')).toHaveTextContent('You’re still signed in.')
    expect(within(profileDetails()).getByText(account.phone)).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/profile')
  })
})

describe('Backend avatar URLs', () => {
  it('resolves root and relative paths from the configured API origin without /api', () => {
    api.defaults.baseURL = 'https://backend.example.invalid/v1/api'
    expect(resolveAvatarUrl('/uploads/avatars/example.webp')).toBe('https://backend.example.invalid/uploads/avatars/example.webp')
    expect(resolveAvatarUrl('uploads/avatars/example.webp')).toBe('https://backend.example.invalid/uploads/avatars/example.webp')
    expect(resolveAvatarUrl('https://images.example.invalid/avatar.webp')).toBe('https://images.example.invalid/avatar.webp')
  })
  it('supports a same-origin API base and falls back for absent or unsupported URLs', () => {
    api.defaults.baseURL = '/api'
    expect(resolveAvatarUrl('/uploads/avatar.webp')).toBe(`${window.location.origin}/uploads/avatar.webp`)
    for (const value of [null, undefined, '', '   ', 'javascript:alert(1)', 'data:image/svg+xml,test']) {
      expect(resolveAvatarUrl(value)).toBeUndefined()
    }
  })
})


async function editProfile() {
  const user = userEvent.setup()
  mount()
  await screen.findByRole('heading', { name: 'Your profile' })
  await user.click(screen.getByRole('button', { name: 'Edit Profile' }))
  return user
}
async function changeField(user, label, value) {
  const input = screen.getByRole('textbox', { name: label })
  await user.clear(input)
  if (value) await user.type(input, value)
}
const save = () => screen.getByRole('button', { name: 'Save Changes' })

describe('Edit profile', () => {
  it('prefills controlled fields and cancels without changing context or calling PATCH', async () => {
    const user = await editProfile()
    expect(screen.getByRole('textbox', { name: /First Name/ })).toHaveValue(account.firstName)
    expect(screen.getByRole('textbox', { name: /Last Name/ })).toHaveValue(account.lastName)
    expect(screen.getByRole('textbox', { name: /Phone Number/ })).toHaveValue(account.phone)
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue(account.email)
    await changeField(user, /First Name/, 'Unsaved')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(within(profileDetails()).getByText(account.firstName)).toBeInTheDocument()
    expect(screen.queryByText('Unsaved')).not.toBeInTheDocument()
    expect(mock.history.patch).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Edit Profile' }))
    expect(screen.getByRole('textbox', { name: /First Name/ })).toHaveValue(account.firstName)
  })

  it('skips a PATCH when no normalized value changed', async () => {
    const user = await editProfile()
    await changeField(user, /First Name/, `  ${account.firstName}  `)
    await user.click(save())
    expect(screen.getByText('No changes to save.', { selector: '[data-title]' })).toHaveTextContent('No changes to save.')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(mock.history.patch).toHaveLength(0)
  })

  it('sends only changed fields, applies the confirmed response everywhere and restores it on remount', async () => {
    const updated = { ...account, firstName: 'Changed', phone: '+66 81 222 3333', email: 'updated@example.invalid' }
    mock.onPatch('/profile/me').reply(200, { success: true, user: updated })
    const user = await editProfile()
    await changeField(user, /First Name/, ' Changed ')
    await changeField(user, /Phone Number/, updated.phone)
    await changeField(user, 'Email', 'UPDATED@example.invalid')
    await user.click(save())
    expect(await screen.findByText('Profile updated successfully.', { selector: '[data-title]' })).toHaveTextContent('Profile updated successfully.')
    expect(JSON.parse(mock.history.patch[0].data)).toEqual({ firstName: 'Changed', phone: updated.phone, email: updated.email })
    expect(mock.history.patch[0].withCredentials).toBe(true)
    expect(within(profileDetails()).getByText('Changed')).toBeInTheDocument()
    expect(within(document.querySelector('.sidebar-profile')).getByText(updated.email)).toBeInTheDocument()
    expect(mock.history.get.filter((r) => r.url === '/auth/me')).toHaveLength(1)
    await user.click(screen.getByRole('link', { name: 'Back to Dashboard' }))
    expect(within(document.querySelector('.profile-card')).getAllByText(updated.email)).toHaveLength(2)
    mock.onGet('/auth/me').reply(200, { success: true, user: updated })
    // A new provider simulates refresh using the persisted API response.
    cleanup()
    mount('/profile')
    expect(await screen.findByText('Changed')).toBeInTheDocument()
  })

  it('clears optional fields with explicit null values', async () => {
    mock.onPatch('/profile/me').reply(200, { success: true, user: { ...account, firstName: null, lastName: null, phone: null } })
    const user = await editProfile()
    for (const name of [/First Name/, /Last Name/, /Phone Number/]) await changeField(user, name, '')
    await user.click(save())
    await screen.findByText('Profile updated successfully.', { selector: '[data-title]' })
    expect(JSON.parse(mock.history.patch[0].data)).toEqual({ firstName: null, lastName: null, phone: null })
    expect(within(profileDetails()).getAllByText('Not provided')).toHaveLength(3)
  })

  it.each([
    [/First Name/, 'x'.repeat(101), '100 characters'],
    [/Last Name/, 'x'.repeat(101), '100 characters'],
    [/Phone Number/, '1'.repeat(21), '20 characters'],
    [/Phone Number/, '123456', '7–15 digits'],
    [/Phone Number/, '1234567890123456', '7–15 digits'],
    [/Phone Number/, '081abc1234', '7–15 digits'],
    ['Email', '', 'valid email'],
    ['Email', 'invalid', 'valid email'],
    ['Email', 'a'.repeat(244) + '@example.com', '255 characters'],
  ])('validates %s before sending a request', async (name, value, error) => {
    const user = await editProfile()
    await changeField(user, name, value)
    await user.click(save())
    expect(screen.getByRole('alert')).toHaveTextContent(error)
    expect(screen.getByRole('textbox', { name })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('textbox', { name })).toHaveFocus()
    expect(mock.history.patch).toHaveLength(0)
  })

  it('disables controls and prevents duplicate saves while waiting for confirmation', async () => {
    let finish
    mock.onPatch('/profile/me').reply(() => new Promise((resolve) => { finish = resolve }))
    const user = await editProfile()
    await changeField(user, /First Name/, 'Pending')
    await user.dblClick(save())
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: /First Name/ })).toBeDisabled()
    expect(screen.queryByText('Profile updated successfully.', { selector: '[data-title]' })).not.toBeInTheDocument()
    expect(mock.history.patch).toHaveLength(1)
    await act(async () => finish([200, { success: true, user: { ...account, firstName: 'Pending' } }]))
    expect(await screen.findByText('Profile updated successfully.', { selector: '[data-title]' })).toHaveTextContent('Profile updated successfully.')
  })

  it.each([
    [400, 'Some details were rejected'],
    [401, 'session could not be verified'],
    [409, 'already in use'],
    [500, 'Couldn’t save your profile'],
    ['network', 'Couldn’t connect to the server'],
    ['unconfirmed', 'Couldn’t save your profile'],
  ])('handles %s and retains the draft for retry', async (status, message) => {
    if (status === 'network') mock.onPatch('/profile/me').networkError()
    else mock.onPatch('/profile/me').reply(status === 'unconfirmed' ? 200 : status, { success: false })
    const user = await editProfile()
    await changeField(user, 'Email', 'retry@example.invalid')
    await user.click(save())
    expect(await screen.findByText((text) => text.includes(message), { selector: status === 409 ? 'p[role="alert"]' : '[data-title]' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('retry@example.invalid')
    expect(save()).not.toBeDisabled()
    expect(screen.queryByText('Profile updated successfully.', { selector: '[data-title]' })).not.toBeInTheDocument()
    expect(within(document.querySelector('.sidebar-profile')).getByText(account.email)).toBeInTheDocument()
    if (status === 409) expect(screen.getByRole('textbox', { name: 'Email' })).toHaveAttribute('aria-invalid', 'true')
    mock.onPatch('/profile/me').reply(200, { success: true, user: { ...account, email: 'retry@example.invalid' } })
    await user.click(save())
    expect(await screen.findByText('Profile updated successfully.', { selector: '[data-title]' })).toHaveTextContent('Profile updated successfully.')
  })
})
