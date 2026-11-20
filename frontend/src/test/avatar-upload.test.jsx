import { mockMenus } from './menu-fixtures'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import MockAdapter from 'axios-mock-adapter'
import api from '@/lib/api'
import App from '@/App'
import { AuthProvider } from '@/context/AuthContext'
import { useAuth } from '@/context/useAuth'

const account = {
  id: 'b5fb354c-ab6d-4479-9c23-c57a437fd372', username: 'photo_fixture',
  email: 'photo@example.invalid', role: 'USER', firstName: 'Photo',
  lastName: 'Fixture', phone: '0812345678', avatarUrl: '/uploads/avatars/old.webp',
}
const updated = { ...account, avatarUrl: '/uploads/avatars/new.webp' }
let mock
let urlCount
function UserState() { return <output data-testid="user-state">{JSON.stringify(useAuth().user)}</output> }
const state = () => JSON.parse(screen.getByTestId('user-state').textContent)
const picker = () => screen.getByLabelText('Choose profile photo')
const file = (type = 'image/png', size = 16) => new File([new Uint8Array(size)], 'photo.png', { type })
async function mount() {
  const view = render(<StrictMode><MemoryRouter initialEntries={['/profile']}><AuthProvider><App /><UserState /></AuthProvider></MemoryRouter></StrictMode>)
  await screen.findByRole('heading', { name: 'Your profile' })
  return view
}

beforeEach(() => {
  mock = new MockAdapter(api)
  mockMenus(mock)
  mock.onGet('/auth/me').reply(200, { success: true, user: account })
  urlCount = 0
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(() => `blob:photo-test-${++urlCount}`)
    static revokeObjectURL = vi.fn()
  })
})
afterEach(() => { cleanup(); mock.restore(); vi.unstubAllGlobals() })

describe('Profile photo selection and upload', () => {
  it('opens the file input from Change Photo', async () => {
    await mount()
    const click = vi.spyOn(picker(), 'click')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Change Photo' }))
    expect(click).toHaveBeenCalledOnce()
  })

  it.each(['image/jpeg', 'image/png', 'image/webp'])('previews %s locally and cancels without a request', async (type) => {
    await mount()
    const user = userEvent.setup()
    await user.upload(picker(), file(type))
    expect(screen.getByRole('img', { name: 'Selected photo preview' })).toHaveAttribute('src', 'blob:photo-test-1')
    expect(state()).toEqual(account)
    await user.click(screen.getByRole('button', { name: 'Cancel photo selection' }))
    expect(screen.queryByRole('img', { name: 'Selected photo preview' })).not.toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo-test-1')
    expect(mock.history.post).toHaveLength(0)
    expect(state()).toEqual(account)
  })

  it('revokes old previews on replacement and the last preview on unmount', async () => {
    const view = await mount()
    // Native file-picker selection dispatches to the hidden input even while a modal is open.
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await user.upload(picker(), file())
    await user.upload(picker(), file('image/jpeg'))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo-test-1')
    expect(screen.getByRole('img', { name: 'Selected photo preview' })).toHaveAttribute('src', 'blob:photo-test-2')
    view.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo-test-2')
  })

  it.each([
    ['image/svg+xml', 16, 'JPG, PNG or WebP'],
    ['image/gif', 16, 'JPG, PNG or WebP'],
    ['image/png', 0, 'JPG, PNG or WebP'],
    ['image/png', 2 * 1024 * 1024 + 1, '2 MiB'],
  ])('rejects %s with %s bytes before creating a preview', async (type, size, error) => {
    await mount()
    await userEvent.setup({ applyAccept: false }).upload(picker(), file(type, size))
    expect(screen.getByRole('alert')).toHaveTextContent(error)
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(mock.history.post).toHaveLength(0)
    expect(state()).toEqual(account)
  })

  it('accepts exactly 2 MiB and blocks an unreadable preview', async () => {
    await mount()
    await userEvent.setup().upload(picker(), file('image/png', 2 * 1024 * 1024))
    const preview = screen.getByRole('img', { name: 'Selected photo preview' })
    fireEvent.error(preview)
    expect(screen.getByRole('alert')).toHaveTextContent('could not be previewed')
    expect(screen.getByRole('button', { name: 'Upload Photo' })).toBeDisabled()
    expect(mock.history.post).toHaveLength(0)
  })

  it('posts only avatar in FormData, waits for confirmation and updates public state', async () => {
    let finish
    mock.onPost('/profile/me/avatar').reply(() => new Promise((resolve) => { finish = resolve }))
    await mount()
    const user = userEvent.setup()
    const photo = file()
    await user.upload(picker(), photo)
    await user.dblClick(screen.getByRole('button', { name: 'Upload Photo' }))
    expect(mock.history.post).toHaveLength(1)
    const request = mock.history.post[0]
    expect(request.withCredentials).toBe(true)
    expect(request.data).toBeInstanceOf(FormData)
    expect([...request.data.keys()]).toEqual(['avatar'])
    expect(request.data.get('avatar')).toBe(photo)
    expect(screen.getByRole('button', { name: 'Uploading…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel photo selection' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Edit Profile', hidden: true })).toBeDisabled()
    expect(state()).toEqual(account)
    expect(screen.queryByText('Profile photo updated successfully.', { selector: '[data-title]' })).not.toBeInTheDocument()
    await act(async () => finish([200, { success: true, user: updated }]))
    expect(await screen.findByText('Profile photo updated successfully.', { selector: '[data-title]' })).toHaveTextContent('updated successfully')
    expect(state()).toEqual(updated)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo-test-1')
    expect(screen.queryByRole('img', { name: 'Selected photo preview' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit Profile' })).not.toBeDisabled()
  })

  it.each([
    [400, 'could not be accepted'], [401, 'session could not be verified'],
    [413, 'too large'], [500, 'Couldn’t upload'], ['network', 'Couldn’t connect'],
    ['unconfirmed', 'Couldn’t upload'],
  ])('keeps the current user and selection after %s and allows retry', async (status, error) => {
    if (status === 'network') mock.onPost('/profile/me/avatar').networkError()
    else mock.onPost('/profile/me/avatar').reply(status === 'unconfirmed' ? 200 : status, { success: false })
    await mount()
    const user = userEvent.setup()
    await user.upload(picker(), file())
    await user.click(screen.getByRole('button', { name: 'Upload Photo' }))
    expect(await screen.findByText((text) => text.includes(error), { selector: '[data-title]' })).toBeInTheDocument()
    expect(state()).toEqual(account)
    expect(screen.getByRole('img', { name: 'Selected photo preview' })).toBeInTheDocument()
    expect(screen.queryByText('Profile photo updated successfully.', { selector: '[data-title]' })).not.toBeInTheDocument()
    mock.onPost('/profile/me/avatar').reply(200, { success: true, user: updated })
    await user.click(screen.getByRole('button', { name: 'Upload Photo' }))
    await screen.findByText('Profile photo updated successfully.', { selector: '[data-title]' })
    expect(state()).toEqual(updated)
  })

  it('disables photo changes while editing profile details', async () => {
    await mount()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Edit Profile' }))
    expect(screen.getByRole('button', { name: 'Change Photo', hidden: true })).toBeDisabled()
    expect(picker()).toBeDisabled()
  })
})
