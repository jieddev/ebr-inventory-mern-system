import { Outlet } from 'react-router-dom'
import AppBar from './AppBar'
import './AppLayout.css'

export default function AppLayout() {
  return (
    <div className="app-layout">
      <AppBar />
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  )
}
