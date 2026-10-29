import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import ActivityToasts from './ActivityToasts'
import AppBar from './AppBar'
import Sidebar from './Sidebar'
import { rememberView } from '../../utils/rememberedViews'
import './AppLayout.css'

export default function AppLayout() {
  const location = useLocation()

  // Each list page's filters, for the links that lead back to it (see Sidebar).
  useEffect(() => {
    rememberView(location.pathname, location.search)
  }, [location.pathname, location.search])

  return (
    <div className="app-layout">
      <AppBar />
      <div className="app-body">
        <Sidebar />
        <main className="app-content">
          <Outlet />
        </main>
      </div>
      {/* Live notices. The server only sends each one to the roles allowed to see it. */}
      <ActivityToasts />
    </div>
  )
}
