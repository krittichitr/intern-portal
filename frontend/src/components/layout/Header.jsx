import { useState } from 'react'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar'
import UserAvatar from '@/components/UserAvatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet'
import { useAuth } from '@/context/useAuth'

export default function Header({ onLogout }) {
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <header className="dashboard-header">
      <div className="flex min-w-0 items-center gap-3">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation"><Menu size={21} /></Button>
          </SheetTrigger>
          <SheetContent side="left" className="mobile-sidebar w-[290px] max-w-[90vw] gap-0 p-0">
            <SheetTitle className="sr-only">Workspace navigation</SheetTitle>
            <SheetDescription className="sr-only">Your dashboard, profile overview, and sign out.</SheetDescription>
            <Sidebar onNavigate={() => setMenuOpen(false)} onLogout={onLogout} />
          </SheetContent>
        </Sheet>
        <span className="header-title">Dashboard</span>
      </div>
      <div className="header-profile">
        <div className="header-user-text"><p title={user.username}>{user.username}</p></div>
        <Badge variant="secondary" className="role-badge header-role">{user.role}</Badge>
        <UserAvatar username={user.username} className="size-9" />
      </div>
    </header>
  )
}
