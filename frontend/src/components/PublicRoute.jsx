import { Outlet } from 'react-router'
import { useAuth } from '@/context/useAuth'
import { MenuLanding } from '@/components/MenuRoute'
import AuthStatus from '@/components/AuthStatus'

export default function PublicRoute() {
  const { isLoading, authError, isAuthenticated } = useAuth()
  if (isLoading || authError) return <AuthStatus />
  return isAuthenticated ? <MenuLanding /> : <Outlet />
}
