import Header from './Header'
import Sidebar from './Sidebar'
import { useAuth } from '@/context/useAuth'
import { toast } from 'sonner'

export default function ManagementLayout({ title, description, children }) {
  const { logout } = useAuth()
  const onLogout = () => void logout().catch(() => toast.error('Sign out failed. Please try again.'))
  return <div className="dashboard-shell"><a href="#main-content" className="skip-link">Skip to content</a>
    <aside className="desktop-sidebar"><Sidebar onLogout={onLogout} /></aside>
    <div className="dashboard-body"><Header title={title} onLogout={onLogout} />
      <main id="main-content" className="dashboard-main" tabIndex={-1}><div className="page-heading"><div><h1>{title}</h1><p>{description}</p></div></div>{children}</main>
    </div></div>
}
