import { Outlet } from 'react-router-dom'
import ActivityToasts from './ActivityToasts'
import AppBar from './AppBar'
import Sidebar from './Sidebar'
import { useAuth } from '../../features/auth/useAuth'
import './AppLayout.css'

export default function AppLayout() {
  const { user } = useAuth()

  return (
    <div className="app-layout">
      <AppBar />
      <div className="app-body">
        {/* Staff only have the Transactions page, so the sidebar shows for admins only. */}
        {user.role === 'admin' && <Sidebar />}
        <main className="app-content">
          <Outlet />
        </main>
      </div>
      {/* Live notices. The server only sends each one to the roles allowed to see it. */}
      <ActivityToasts />
    </div>
  )
}
