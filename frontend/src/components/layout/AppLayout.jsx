import { Outlet } from 'react-router-dom'
import ActivityToasts from './ActivityToasts'
import AppBar from './AppBar'
import Sidebar from './Sidebar'
import './AppLayout.css'

export default function AppLayout() {
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
