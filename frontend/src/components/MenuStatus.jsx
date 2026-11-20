import { LoaderCircle, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import Brand from '@/components/Brand'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/useAuth'
import { useMenus } from '@/context/useMenus'

export default function MenuStatus() {
  const { status, error, refreshMenus, isRefreshing } = useMenus()
  const { logout, isLoggingOut } = useAuth()
  return <main className="auth-status-page"><Brand /><div className="auth-status-content" role="status">
    <div className="status-symbol">{status === 'error' ? <WifiOff /> : <LoaderCircle className="animate-spin" />}</div>
    <h1>{status === 'error' ? 'Navigation is unavailable.' : 'Loading your navigation…'}</h1>
    <p>{error || 'Checking the pages available to your account.'}</p>
    <div className="mt-6 flex justify-center gap-3">
      {status === 'error' && <Button onClick={() => void refreshMenus()} disabled={isRefreshing}>Retry navigation</Button>}
      <Button variant="outline" disabled={isLoggingOut} onClick={() => void logout().catch(() => toast.error('Sign out failed. Please try again.'))}>Sign out</Button>
    </div>
  </div></main>
}
