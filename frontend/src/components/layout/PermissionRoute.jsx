import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import { can } from '../../utils/permissions'

// Pages for users with `permission` only (see utils/permissions.js); others go back to their home page.
// Use inside <ProtectedRoute>, so `user` is always set here.
export default function PermissionRoute({ permission }) {
  const { user } = useAuth()
  if (!can(user, permission)) return <Navigate to="/" replace />

  return <Outlet />
}
