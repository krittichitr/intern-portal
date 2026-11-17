import { LoaderCircle, WifiOff, ArrowRight } from 'lucide-react'
import Brand from '@/components/Brand'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/useAuth'

export default function AuthStatus() {
  const { authError, checkAuth, isChecking } = useAuth()
  return (
    <main className="auth-status-page">
      <Brand />
      <div className="auth-status-content" role="status" aria-live="polite">
        <div className="status-symbol">
          {authError ? <WifiOff size={26} /> : <LoaderCircle size={26} className="animate-spin" />}
        </div>
        <h1>{authError ? 'Let’s get you connected.' : 'Opening your workspace…'}</h1>
        <p>{authError || 'Just a moment while we check your account.'}</p>
        {authError && (
          <Button onClick={() => void checkAuth()} disabled={isChecking} className="mt-7">
            {isChecking ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}
            Try again
          </Button>
        )}
      </div>
      <p className="auth-status-footer">Intern Portal</p>
    </main>
  )
}
