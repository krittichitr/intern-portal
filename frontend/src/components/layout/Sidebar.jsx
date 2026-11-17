import { NavLink } from 'react-router'
import { LayoutDashboard, LoaderCircle, LogOut } from 'lucide-react'
import Brand from '@/components/Brand'
import UserAvatar from '@/components/UserAvatar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/context/useAuth'
import { cn } from '@/lib/utils'

export default function Sidebar({ onNavigate, onLogout, className }) {
  const { user, isLoggingOut } = useAuth()
  return (
    <div className={cn('sidebar-content', className)}>
      <div className="sidebar-brand"><Brand light /></div>
      <nav aria-label="Main navigation" className="sidebar-nav">
        <NavLink to="/dashboard" onClick={onNavigate} className={({ isActive }) => cn('sidebar-link', isActive && 'active')}>
          <LayoutDashboard size={19} strokeWidth={1.8} /><span>Dashboard</span>
        </NavLink>
      </nav>
      <div className="sidebar-bottom">
        <Separator />
        <div className="sidebar-profile">
          <UserAvatar username={user.username} />
          <div className="min-w-0"><p className="truncate">{user.username}</p><span className="block truncate" title={user.email}>{user.email}</span></div>
        </div>
        <Button variant="ghost" onClick={onLogout} disabled={isLoggingOut} className="sidebar-logout">
          {isLoggingOut ? <LoaderCircle className="animate-spin" /> : <LogOut />}
          {isLoggingOut ? 'Signing out…' : 'Sign out'}
        </Button>
      </div>
    </div>
  )
}
