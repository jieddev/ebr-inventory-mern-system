import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'

// Pages for some roles only (see utils/roles.js); others go back to their home page.
// Use inside <ProtectedRoute>, so `user` is always set here.
export default function RoleRoute({ roles }) {
  const { user } = useAuth()
  if (!roles.includes(user.role)) return <Navigate to="/" replace />

  return <Outlet />
}
