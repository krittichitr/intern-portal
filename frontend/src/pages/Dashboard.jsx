import { useState } from 'react'
import { useNavigate } from 'react-router'
import { AlertCircle, CircleCheck, Fingerprint, KeyRound, LoaderCircle, Mail, RefreshCw, ShieldCheck, UserRound } from 'lucide-react'
import Header from '@/components/layout/Header'
import Sidebar from '@/components/layout/Sidebar'
import UserAvatar from '@/components/UserAvatar'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/context/useAuth'

export default function Dashboard() {
  const { user, logout, isLoggingOut, checkAuth, isChecking, lastCheckedAt } = useAuth()
  const navigate = useNavigate()
  const [logoutError, setLogoutError] = useState('')

  async function handleLogout() {
    if (isLoggingOut) return
    setLogoutError('')
    try {
      await logout()
      navigate('/login', { replace: true })
    } catch {
      setLogoutError('We couldn’t sign you out. You’re still signed in. Please try again.')
    }
  }

  const checkedTime = lastCheckedAt?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return (
    <div className="dashboard-shell">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <aside className="desktop-sidebar"><Sidebar onLogout={handleLogout} /></aside>
      <div className="dashboard-body">
        <Header onLogout={handleLogout} />
        <main id="main-content" className="dashboard-main" tabIndex={-1}>
          <div className="page-heading">
            <div><h1>Welcome back, {user.username}!</h1><p>Here’s your account overview.</p></div>
            <Badge variant="outline" className="signed-in-badge"><span className="status-dot" /> Signed in</Badge>
          </div>
          {logoutError && <Alert variant="destructive" className="logout-error"><AlertCircle /><AlertDescription>{logoutError}</AlertDescription></Alert>}

          <section className="overview-grid" aria-label="Account overview">
            <Card className="overview-card"><CardContent><div><p className="overview-label">Account role</p><h2>{user.role}</h2></div><ShieldCheck size={22} /></CardContent></Card>
            <Card className="overview-card"><CardContent><div><p className="overview-label">Session status</p><h2>Signed in</h2></div><CircleCheck size={22} /></CardContent></Card>
          </section>

          <section id="account-details" className="details-grid" aria-label="Profile and session details">
            <Card className="profile-card">
              <CardHeader className="detail-card-heading"><div className="card-heading-icon"><UserRound size={19} /></div><div><CardTitle className="card-heading-title"><h2>Profile information</h2></CardTitle><CardDescription>Your account details.</CardDescription></div></CardHeader>
              <Separator />
              <CardContent className="profile-card-content">
                <div className="profile-identity"><UserAvatar username={user.username} className="size-16 rounded-2xl text-xl" /><div className="min-w-0"><h3>{user.username}</h3><p>{user.email}</p><Badge variant="secondary" className="role-badge">{user.role}</Badge></div></div>
                <dl className="profile-details">
                  <div><dt><UserRound size={15} /> Username</dt><dd>{user.username}</dd></div>
                  <div><dt><Mail size={15} /> Email address</dt><dd>{user.email}</dd></div>
                  <div><dt><KeyRound size={15} /> Account role</dt><dd><Badge variant="secondary" className="role-badge">{user.role}</Badge></dd></div>
                  <div><dt><Fingerprint size={15} /> User ID</dt><dd className="user-id">{user.id}</dd></div>
                </dl>
              </CardContent>
            </Card>

            <div className="right-detail-column">
              <Card className="session-card">
                <CardHeader className="detail-card-heading"><div className="card-heading-icon"><ShieldCheck size={19} /></div><div><CardTitle className="card-heading-title"><h2>Session & security</h2></CardTitle><CardDescription>Check your current session.</CardDescription></div></CardHeader>
                <CardContent>
                  <div className="session-verified"><span className="verified-icon"><ShieldCheck size={27} strokeWidth={1.6} /></span><div><h3>Session verified</h3><p>You’re signed in to your account.</p></div><span className="status-dot" /></div>
                  <dl className="session-details"><div><dt>Authentication</dt><dd className="text-emerald-700"><span className="status-dot" /> Verified</dd></div><div><dt>Last checked</dt><dd>{checkedTime || 'Just now'}</dd></div></dl>
                  <Button variant="outline" onClick={() => void checkAuth()} disabled={isChecking || isLoggingOut} className="session-check"><RefreshCw size={15} className={isChecking ? 'animate-spin' : ''} />{isChecking ? 'Checking your session…' : 'Check session'}</Button>
                </CardContent>
              </Card>
              <div className="signout-section"><Button variant="outline" onClick={handleLogout} disabled={isLoggingOut} className="signout-action">{isLoggingOut ? <LoaderCircle className="animate-spin" /> : null}{isLoggingOut ? 'Signing out…' : 'Sign out of workspace'}</Button></div>
            </div>
          </section>

        </main>
      </div>
    </div>
  )
}
