import { NavLink } from 'react-router'
import { LayoutDashboard, LoaderCircle, LogOut, UserRound, Folder, FileText, ListTree, ShieldCheck, Users, Settings } from 'lucide-react'
import Brand from '@/components/Brand'
import UserAvatar from '@/components/UserAvatar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/context/useAuth'
import { cn } from '@/lib/utils'
import { useMenus } from '@/context/useMenus'
import { navigationMenus } from '@/lib/menu-navigation'

const icons = { LayoutDashboard, UserRound, FileText, ListTree, ShieldCheck, Users, Settings }
function MenuItem({ node, onNavigate }) {
  const Icon = icons[node.menuIcon] || Folder
  return <li>
    {node.canAccess ? <NavLink to={node.menuPath} end onClick={onNavigate} className={({ isActive }) => cn('sidebar-link', isActive && 'active')}><Icon size={19} strokeWidth={1.8} /><span>{node.menuName}</span></NavLink>
      : <div className="sidebar-group-label"><Icon size={18} /><span>{node.menuName}</span></div>}
    {node.children.length > 0 && <ul className="sidebar-submenu">{node.children.map((child) => <MenuItem key={child.id} node={child} onNavigate={onNavigate} />)}</ul>}
  </li>
}

export default function Sidebar({ onNavigate, onLogout, className }) {
  const { user, isLoggingOut } = useAuth()
  const { menus, allowedPaths } = useMenus()
  const navigation = navigationMenus(menus, user, allowedPaths)
  return (
    <div className={cn('sidebar-content', className)}>
      <div className="sidebar-brand"><Brand light /></div>
      <nav aria-label="Main navigation" className="sidebar-nav">
        <ul>{navigation.map((node) => <MenuItem key={node.id} node={node} onNavigate={onNavigate} />)}</ul>
      </nav>
      <div className="sidebar-bottom">
        <Separator />
        <div className="sidebar-profile">
          <UserAvatar username={user.username} avatarUrl={user.avatarUrl} />
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
