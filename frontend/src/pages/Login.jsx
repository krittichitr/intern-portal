import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { AlertCircle, Eye, EyeOff, LoaderCircle, LockKeyhole, UserRound } from 'lucide-react'
import Brand from '@/components/Brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAuth } from '@/context/useAuth'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const pending = useRef(false)
  const usernameRef = useRef(null)
  const passwordRef = useRef(null)

  async function handleSubmit(event) {
    event.preventDefault()
    if (pending.current) return
    const nextErrors = {}
    if (!username.trim()) nextErrors.username = 'Enter your username.'
    else if (username.length > 50) nextErrors.username = 'Use 50 characters or fewer.'
    if (!password.trim()) nextErrors.password = 'Enter your password.'
    else if (new TextEncoder().encode(password).length > 72) nextErrors.password = 'Your password is too long. Use 72 bytes or fewer.'
    setErrors(nextErrors)
    setSubmitError('')
    if (Object.keys(nextErrors).length) {
      ;(nextErrors.username ? usernameRef : passwordRef).current?.focus()
      return
    }
    pending.current = true
    setIsSubmitting(true)
    try {
      await login(username, password)
      setPassword('')
      navigate('/dashboard', { replace: true })
    } catch (error) {
      const status = error.response?.status
      setSubmitError(status === 401
        ? 'That username and password don’t match. Please try again.'
        : status === 400
          ? 'Check your username and password, then try again.'
          : status === 429
            ? 'Too many attempts. Please wait a moment and try again.'
            : 'We couldn’t sign you in right now. Please try again in a moment.')
    } finally {
      pending.current = false
      setIsSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-form-panel" aria-labelledby="login-title">
        <Brand />
        <div className="login-form-wrap">
          <h1 id="login-title">Welcome back.</h1>
          <p className="login-subtitle">Sign in to your account.</p>
          <form onSubmit={handleSubmit} noValidate className="login-form" aria-busy={isSubmitting}>
            {submitError && (
              <Alert variant="destructive" role="alert" className="login-error">
                <AlertCircle /><AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}
            <div className="form-field">
              <Label htmlFor="username">Username</Label>
              <div className="input-wrap">
                <UserRound className="input-icon" size={18} />
                <Input id="username" name="username" ref={usernameRef} value={username}
                  onChange={(event) => { setUsername(event.target.value); setErrors((old) => ({ ...old, username: undefined })); setSubmitError('') }}
                  required placeholder="Enter your username" autoComplete="username" autoCapitalize="none" spellCheck={false}
                  disabled={isSubmitting} aria-invalid={Boolean(errors.username)}
                  aria-describedby={errors.username ? 'username-error' : undefined} className="login-input" />
              </div>
              {errors.username && <p id="username-error" className="field-error" role="alert">{errors.username}</p>}
            </div>
            <div className="form-field">
              <Label htmlFor="password">Password</Label>
              <div className="input-wrap">
                <LockKeyhole className="input-icon" size={18} />
                <Input id="password" name="password" ref={passwordRef} type={showPassword ? 'text' : 'password'} value={password}
                  onChange={(event) => { setPassword(event.target.value); setErrors((old) => ({ ...old, password: undefined })); setSubmitError('') }}
                  required placeholder="Enter your password" autoComplete="current-password" disabled={isSubmitting}
                  aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'password-error' : undefined}
                  className="login-input password-input" />
                <Button type="button" variant="ghost" size="icon" className="password-toggle" disabled={isSubmitting}
                  aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}
                  onClick={() => setShowPassword((value) => !value)}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </Button>
              </div>
              {errors.password && <p id="password-error" className="field-error" role="alert">{errors.password}</p>}
            </div>
            <Button type="submit" className="login-submit" disabled={isSubmitting}>
              {isSubmitting ? <><LoaderCircle className="animate-spin" /> Signing you in…</> : <>Sign in to your workspace</>}
            </Button>
          </form>
        </div>
      </section>
    </main>
  )
}
