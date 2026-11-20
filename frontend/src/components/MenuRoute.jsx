import { Navigate } from 'react-router'
import { useAuth } from '@/context/useAuth'
import { useMenus } from '@/context/useMenus'
import { canOpenPage, landingPath } from '@/lib/menu-navigation'
import MenuStatus from './MenuStatus'

export default function MenuRoute({ path, children }) {
  const { user } = useAuth()
  const access = useMenus()
  if (access.status !== 'ready') return <MenuStatus />
  return canOpenPage(path, user, access.allowedPaths) ? children : <Navigate to="/403" replace />
}
export function MenuLanding() {
  const { user } = useAuth()
  const access = useMenus()
  if (access.status !== 'ready') return <MenuStatus />
  return <Navigate to={landingPath(access.menus, user, access.allowedPaths)} replace />
}
