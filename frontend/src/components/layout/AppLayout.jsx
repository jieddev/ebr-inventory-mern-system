import { Outlet } from 'react-router-dom'
import ActivityToasts from './ActivityToasts'
import AppBar from './AppBar'
import './AppLayout.css'

export default function AppLayout() {
  return (
    <div className="app-layout">
      <AppBar />
      <main className="app-content">
        <Outlet />
      </main>
      {/* Live notices. The server only sends each one to the roles allowed to see it. */}
      <ActivityToasts />
    </div>
  )
}
