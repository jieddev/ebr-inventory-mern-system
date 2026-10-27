import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../ui/Button'
import Logo from '../ui/Logo'
import { useAuth } from '../../features/auth/useAuth'
import './AppBar.css'

export default function AppBar() {
  const { user, logout } = useAuth()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  async function handleLogout() {
    setIsLoggingOut(true)
    await logout()
  }

  return (
    <header className="app-bar">
      <Link to="/" className="app-bar-brand">
        <Logo size="sm" />
        <span>EBR Inventory System</span>
      </Link>

      <div className="app-bar-user">
        <div className="app-bar-user-text">
          <span className="app-bar-user-name">{user.name}</span>
          <span className="app-bar-user-role">{user.role}</span>
        </div>
        <Button variant="secondary" size="sm" onClick={handleLogout} isLoading={isLoggingOut}>
          Log out
        </Button>
      </div>
    </header>
  )
}
