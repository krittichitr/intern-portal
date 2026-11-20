import { Link } from 'react-router'
import { toast } from 'sonner'
import Brand from '@/components/Brand'
import MenuStatus from '@/components/MenuStatus'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/useAuth'
import { useMenus } from '@/context/useMenus'
import { landingPath } from '@/lib/menu-navigation'

export default function Forbidden() {
  const { user, logout, isLoggingOut } = useAuth()
  const access = useMenus()
  if (access.status !== 'ready') return <MenuStatus />
  const home = landingPath(access.menus, user, access.allowedPaths)
  return <main className="auth-status-page"><Brand /><div className="auth-status-content">
    <div>403 · ACCESS DENIED</div><h1>You don’t have access to this page.</h1>
    <p>Contact your administrator if you need access.</p>
    <div className="mt-6 flex flex-wrap justify-center gap-3">
      {home !== '/403' && <Button asChild><Link to={home}>Back to workspace</Link></Button>}
      <Button variant="outline" disabled={access.isRefreshing} onClick={() => void access.refreshMenus()}>Reload permissions</Button>
      <Button variant="outline" disabled={isLoggingOut} onClick={() => void logout().catch(() => toast.error('Sign out failed. Please try again.'))}>Sign out</Button>
    </div>
  </div></main>
}
