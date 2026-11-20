import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Link, useNavigate } from 'react-router'
import { AlertCircle, ArrowLeft, LoaderCircle, Pencil, UserRound } from 'lucide-react'
import Header from '@/components/layout/Header'
import Sidebar from '@/components/layout/Sidebar'
import UserAvatar from '@/components/UserAvatar'
import FormDialog from '@/components/FormDialog'
import AvatarUpload from '@/components/AvatarUpload'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useMenus } from '@/context/useMenus'
import { useAuth } from '@/context/useAuth'

const editableFields = [
  { key: 'firstName', label: 'First Name', limit: 100, autoComplete: 'given-name' },
  { key: 'lastName', label: 'Last Name', limit: 100, autoComplete: 'family-name' },
  { key: 'phone', label: 'Phone Number', limit: 20, type: 'tel', autoComplete: 'tel' },
  { key: 'email', label: 'Email', limit: 255, type: 'email', autoComplete: 'email' },
]

export default function Profile() {
  const { user, logout, isLoggingOut, updateProfile } = useAuth()
  const { allowedPaths } = useMenus()
  const navigate = useNavigate()
  const [logoutError, setLogoutError] = useState('')
  const [form, setForm] = useState(null)
  const [original, setOriginal] = useState(null)
  const [errors, setErrors] = useState({})
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const pending = useRef(false)

  function startEditing() {
    setForm(Object.fromEntries(editableFields.map(({ key }) => [key, user[key] ?? ''])))
    setOriginal(Object.fromEntries(editableFields.map(({ key }) => [key, user[key] ?? null])))
    setErrors({})
  }

  function cancelEditing() {
    if (pending.current) return
    setForm(null)
    setOriginal(null)
    setErrors({})
  }

  function handleChange(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (pending.current || !form) return
    const nextErrors = {}
    const values = {}
    for (const { key, label, limit } of editableFields) {
      const cleaned = form[key].trim()
      values[key] = key === 'email' ? cleaned.toLowerCase() : cleaned || null
      const hasControlCharacter = [...cleaned].some((character) => {
        const code = character.codePointAt(0)
        return code < 32 || code === 127
      })
      if ([...cleaned].length > limit) nextErrors[key] = `${label} must be ${limit} characters or fewer.`
      else if (hasControlCharacter) nextErrors[key] = `${label} contains unsupported characters.`
      else if (key === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) nextErrors[key] = 'Enter a valid email address.'
      else if (key === 'phone' && cleaned) {
        const digits = cleaned.replace(/\D/g, '')
        if (!/^\+?[0-9 ()-]+$/.test(cleaned) || digits.length < 7 || digits.length > 15) {
          nextErrors[key] = 'Use 7–15 digits with an optional leading +, spaces, hyphens or parentheses.'
        }
      }
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      event.currentTarget.elements.namedItem(Object.keys(nextErrors)[0])?.focus()
      return
    }
    const changes = Object.fromEntries(Object.entries(values).filter(([key, value]) =>
      value !== (key === 'email' ? original.email.trim().toLowerCase() : original[key] ?? null)))
    if (Object.keys(changes).length === 0) {
      setForm(null)
      setOriginal(null)
      toast.info('No changes to save.', { id: 'profile-update' })
      return
    }
    pending.current = true
    setIsSaving(true)
    try {
      await updateProfile(changes)
      setForm(null)
      setOriginal(null)
      toast.success('Profile updated successfully.', { id: 'profile-update' })
    } catch (error) {
      const status = error.response?.status
      if (status === 409) {
        setErrors({ email: 'This email address is already in use. Try another one.' })
      } else toast.error(status === 400 ? 'Some details were rejected. Check your entries and try again.'
        : status === 401 ? 'Your session could not be verified. Sign in again before saving.'
          : !error.response && error.isAxiosError ? 'Couldn’t connect to the server. Check your connection and try again.'
            : 'Couldn’t save your profile. Your entries are kept below; please try again.', { id: 'profile-update' })
    } finally {
      pending.current = false
      setIsSaving(false)
    }
  }

  async function handleLogout() {
    if (isLoggingOut) return
    setLogoutError('')
    try {
      await logout()
      navigate('/login', { replace: true })
    } catch {
      setLogoutError('We couldn’t sign you out. You’re still signed in. Please try again.')
    }
  }

  const details = [
    ['Username', user.username],
    ['First Name', user.firstName],
    ['Last Name', user.lastName],
    ['Phone Number', user.phone],
    ['Email', user.email],
    ['Role', user.role],
  ]

  return (
    <div className="dashboard-shell">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <aside className="desktop-sidebar"><Sidebar onLogout={handleLogout} /></aside>
      <div className="dashboard-body">
        <Header title="Profile" onLogout={handleLogout} />
        <main id="main-content" className="dashboard-main" tabIndex={-1}>
          <div className="page-heading">
            <div><h1>Your profile</h1><p>Your personal and account information.</p></div>
          </div>
          {logoutError && <Alert variant="destructive" className="logout-error"><AlertCircle /><AlertDescription>{logoutError}</AlertDescription></Alert>}
          <section aria-label="Your profile details" className="max-w-3xl">
            <Card className="profile-card">
              <CardHeader className="detail-card-heading">
                <div className="card-heading-icon"><UserRound size={19} /></div>
                <div><CardTitle className="card-heading-title"><h2>Profile information</h2></CardTitle><CardDescription>Your current profile details.</CardDescription></div>
              </CardHeader>
              <Separator />
              <CardContent className="profile-card-content">
                <div className="profile-identity">
                  <UserAvatar username={user.username} avatarUrl={user.avatarUrl} className="size-16 rounded-2xl text-xl" />
                  <div className="min-w-0"><h3>{user.username}</h3><p>{user.email}</p><Badge variant="secondary" className="role-badge">{user.role}</Badge></div>
                </div>
                <AvatarUpload disabled={isSaving || Boolean(form)} onUploadingChange={setIsUploadingPhoto} />
                    <dl className="profile-details">
                      {details.map(([label, value]) => (
                        <div key={label}><dt>{label}</dt><dd>{value ?? 'Not provided'}</dd></div>
                      ))}
                    </dl>
                    <Button variant="outline" className="mt-6" onClick={startEditing} disabled={isLoggingOut || isUploadingPhoto}><Pencil /> Edit Profile</Button>
                {form && <FormDialog open onOpenChange={(open) => { if (!open) cancelEditing() }} title="Edit Profile" description="Update your name, phone number and email." busy={isSaving || isLoggingOut}>
<form onSubmit={handleSubmit} noValidate aria-label="Edit profile" aria-busy={isSaving}>
                    <fieldset disabled={isSaving || isLoggingOut} className="min-w-0 space-y-5">
                      <legend className="sr-only">Edit profile details</legend>
                      <p className="text-sm text-muted-foreground">Leave optional fields blank to clear them. Email is required.</p>
                      <div className="grid gap-5 sm:grid-cols-2">
                        {editableFields.map(({ key, label, type, autoComplete }) => (
                          <div key={key} className="flex min-w-0 flex-col gap-2">
                            <Label htmlFor={`profile-${key}`}>{label}{key !== 'email' && <span className="font-normal text-muted-foreground">(optional)</span>}</Label>
                            <Input id={`profile-${key}`} name={key} type={type || 'text'} autoComplete={autoComplete}
                              value={form[key]} onChange={handleChange} required={key === 'email'}
                              aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `profile-${key}-error` : undefined}
                              className="h-11 shadow-none" />
                            {errors[key] && <p id={`profile-${key}-error`} className="field-error" role="alert">{errors[key]}</p>}
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Button type="submit">{isSaving && <LoaderCircle className="animate-spin" />}{isSaving ? 'Saving…' : 'Save Changes'}</Button>
                        <Button type="button" variant="outline" onClick={cancelEditing}>Cancel</Button>
                      </div>
                    </fieldset>
                  </form>
                </FormDialog>}
              </CardContent>
            </Card>
            {allowedPaths.includes('/dashboard') && <Button asChild variant="outline" className="mt-5"><Link to="/dashboard"><ArrowLeft /> Back to Dashboard</Link></Button>}
          </section>
        </main>
      </div>
    </div>
  )
}
