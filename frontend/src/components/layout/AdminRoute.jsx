import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'

// Use inside <ProtectedRoute>, so `user` is always set here.
export default function AdminRoute() {
  const { user } = useAuth()
  if (user.role !== 'admin') return <Navigate to="/" replace />

  return <Outlet />
}
