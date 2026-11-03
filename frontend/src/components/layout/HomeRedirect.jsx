import { Navigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import { can } from '../../utils/permissions'
import '../../features/transactions/TransactionsPage.css'

// Landing page after login: admins manage users, users who add transactions get Transactions,
// others the Items page. Accounts with neither page enabled are told to ask an admin.
// Use inside <ProtectedRoute>, so `user` is always set here.
export default function HomeRedirect() {
  const { user } = useAuth()
  if (user.role === 'admin') return <Navigate to="/users/new" replace />
  if (can(user, 'addTransactions')) return <Navigate to="/transactions" replace />
  if (can(user, 'viewItems')) return <Navigate to="/items" replace />

  return (
    <section className="workspace-content">
      <div className="table-empty">
        <p>No pages are turned on for your account yet. Ask an admin to give you access.</p>
      </div>
    </section>
  )
}
