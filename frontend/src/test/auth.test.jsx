import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import MockAdapter from 'axios-mock-adapter'
import api from '@/lib/api'
import { AuthProvider } from '@/context/AuthContext'
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

beforeEach(() => { mock = new MockAdapter(api); mock.onGet('/auth/me').reply(401) })
afterEach(() => mock.restore())

describe('Authentication UI and routing', () => {
  it('deduplicates initial me in StrictMode and guards dashboard', async () => {
    mount('/dashboard')
    await screen.findByRole('heading', { name: 'Welcome back.' })
    expect(screen.getByTestId('location')).toHaveTextContent('/login')
    expect(mock.history.get).toHaveLength(1)
    expect(mock.history.get[0].withCredentials).toBe(true)
  })
  it('shows loading while me is unresolved', async () => {
    let finish
    mock.resetHandlers()
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
    expect(mock.history.get).toHaveLength(1)
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
    mock.resetHandlers()
    mock.onGet('/auth/me').reply(200, { success: true, user: account })
    const view = mount('/login')
    await screen.findByRole('heading', { name: 'Profile information' })
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard')
    view.unmount()
    mount('/dashboard')
    await screen.findByRole('heading', { name: 'Profile information' })
    expect(mock.history.get).toHaveLength(2)
  })
  it('clears user only after confirmed logout and protects dashboard afterwards', async () => {
    mock.resetHandlers()
    mock.onGet('/auth/me').reply(200, { success: true, user: account })
    mock.onPost('/auth/logout').reply(200, { success: true })
    const view = mount('/dashboard')
    const user = userEvent.setup()
    await screen.findByRole('heading', { name: 'Profile information' })
    await user.click(screen.getByRole('button', { name: 'Sign out of workspace' }))
    await screen.findByRole('heading', { name: 'Welcome back.' })
    expect(screen.queryByText(account.id)).not.toBeInTheDocument()
    view.unmount()
    mock.resetHandlers()
    mock.onGet('/auth/me').reply(401)
    mount('/dashboard')
    await screen.findByRole('heading', { name: 'Welcome back.' })
    expect(screen.getByTestId('location')).toHaveTextContent('/login')
  })
  it('keeps the user signed in when logout fails', async () => {
    mock.resetHandlers()
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
    mock.resetHandlers()
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
    mock.resetHandlers()
    mock.onGet('/auth/me').replyOnce(200, { success: true, user: account })
    mock.onGet('/auth/me').reply(401)
    mount('/dashboard')
    await screen.findByRole('heading', { name: 'Profile information' })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Check session' }))
    await screen.findByRole('heading', { name: 'Welcome back.' })
    expect(mock.history.get).toHaveLength(2)
  })
  it('opens the mobile drawer and supports Escape', async () => {
    mock.resetHandlers()
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
