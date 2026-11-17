import { Link, Navigate, Route, Routes } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import ProtectedRoute from '@/components/ProtectedRoute'
import PublicRoute from '@/components/PublicRoute'
import Brand from '@/components/Brand'
import { Button } from '@/components/ui/button'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route element={<PublicRoute />}><Route path="/login" element={<Login />} /></Route>
      <Route element={<ProtectedRoute />}><Route path="/dashboard" element={<Dashboard />} /></Route>
      <Route path="*" element={<main className="auth-status-page"><Brand /><div className="auth-status-content"><div>404 · A SMALL DETOUR</div><h1>This page isn’t here.</h1><p>Let’s get you back to your workspace.</p><Button asChild className="mt-7"><Link to="/"><ArrowLeft /> Back to workspace</Link></Button></div></main>} />
    </Routes>
  )
}
