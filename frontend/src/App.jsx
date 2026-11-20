import { Link, Route, Routes } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Profile from '@/pages/Profile'
import ProtectedRoute from '@/components/ProtectedRoute'
import PublicRoute from '@/components/PublicRoute'
import Brand from '@/components/Brand'
import { MenuProvider } from '@/context/MenuContext'
import MenuRoute, { MenuLanding } from '@/components/MenuRoute'
import Forbidden from '@/pages/Forbidden'
import MenuManagement from '@/pages/MenuManagement'
import RoleManagement from '@/pages/RoleManagement'
import UserRoleAssignment from '@/pages/UserRoleAssignment'
import { Toaster } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'

export default function App() {
  return (
    <MenuProvider>
      <Routes>
        <Route element={<PublicRoute />}><Route path="/login" element={<Login />} /></Route>
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<MenuLanding />} />
          <Route path="/403" element={<Forbidden />} />
          <Route path="/dashboard" element={<MenuRoute path="/dashboard"><Dashboard /></MenuRoute>} />
          <Route path="/profile" element={<MenuRoute path="/profile"><Profile /></MenuRoute>} />
          <Route path="/admin/menus" element={<MenuRoute path="/admin/menus"><MenuManagement /></MenuRoute>} />
          <Route path="/admin/roles" element={<MenuRoute path="/admin/roles"><RoleManagement /></MenuRoute>} />
          <Route path="/admin/users" element={<MenuRoute path="/admin/users"><UserRoleAssignment /></MenuRoute>} />
        </Route>
        <Route path="*" element={<main className="auth-status-page"><Brand /><div className="auth-status-content"><div>404 · A SMALL DETOUR</div><h1>This page isn’t here.</h1><p>Let’s get you back to your workspace.</p><Button asChild className="mt-7"><Link to="/"><ArrowLeft /> Back to workspace</Link></Button></div></main>} />
      </Routes>
      <Toaster theme="light" position="top-right" richColors closeButton style={{}} />
    </MenuProvider>
  )
}
