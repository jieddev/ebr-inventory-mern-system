import { Navigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'

// Landing page after login: admins manage users, everyone else records transactions.
// Use inside <ProtectedRoute>, so `user` is always set here.
export default function HomeRedirect() {
  const { user } = useAuth()
  return <Navigate to={user.role === 'admin' ? '/users/new' : '/transactions'} replace />
}
