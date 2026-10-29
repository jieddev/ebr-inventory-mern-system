import { Navigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'

const HOME_BY_ROLE = { admin: '/users/new', warehouse: '/transactions', encoder: '/items' }

// Landing page after login: admins manage users, warehouse users record transactions, encoders get the Items page.
// Use inside <ProtectedRoute>, so `user` is always set here.
export default function HomeRedirect() {
  const { user } = useAuth()
  return <Navigate to={HOME_BY_ROLE[user.role] ?? '/transactions'} replace />
}
