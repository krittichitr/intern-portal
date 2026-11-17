import { Navigate, Outlet } from 'react-router'
import { useAuth } from '@/context/useAuth'
import AuthStatus from '@/components/AuthStatus'

export default function PublicRoute() {
  const { isLoading, authError, isAuthenticated } = useAuth()
  if (isLoading || authError) return <AuthStatus />
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <Outlet />
}
