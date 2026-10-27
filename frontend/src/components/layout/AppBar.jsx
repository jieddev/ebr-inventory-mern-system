import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Button from '../ui/Button'
import Logo from '../ui/Logo'
import logoutIcon from '../../assets/icons/logout.svg'
import { useAuth } from '../../features/auth/useAuth'
import './AppBar.css'

function initials(name) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts.at(-1)[0] : (parts[0]?.[1] ?? ''))).toUpperCase()
}

export default function AppBar() {
  const { user, logout } = useAuth()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const navigate = useNavigate()
  const { pathname } = useLocation()

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
        {user.role === 'admin' && pathname !== '/users/new' && (
          <Button variant="secondary" size="sm" onClick={() => navigate('/users/new')}>
            Create user
          </Button>
        )}
        <span className="app-bar-avatar" aria-hidden="true">
          {initials(user.name)}
        </span>
        <span className="app-bar-user-name" title={user.role}>
          {user.name}
        </span>
        <Button variant="ghost" onClick={handleLogout} isLoading={isLoggingOut}>
          {!isLoggingOut && <img src={logoutIcon} alt="" />}
          Log out
        </Button>
      </div>
    </header>
  )
}
