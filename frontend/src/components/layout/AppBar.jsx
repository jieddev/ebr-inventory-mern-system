import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Button from '../ui/Button'
import Logo from '../ui/Logo'
import logoutIcon from '../../assets/icons/logout.svg'
import chevronIcon from '../../assets/icons/chevron-down-sm.svg'
import userPlusIcon from '../../assets/icons/user-plus.svg'
import { useAuth } from '../../features/auth/useAuth'
import './AppBar.css'

function initials(name) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts.at(-1)[0] : (parts[0]?.[1] ?? ''))).toUpperCase()
}

export default function AppBar() {
  const { user, logout } = useAuth()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuId = useId()
  const menuRef = useRef(null)
  const triggerRef = useRef(null)
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // Close the profile menu on any click outside it.
  useEffect(() => {
    if (!isMenuOpen) return
    function handlePointerDown(event) {
      if (!menuRef.current?.contains(event.target)) setIsMenuOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isMenuOpen])

  function handleMenuKeyDown(event) {
    if (event.key !== 'Escape' || !isMenuOpen) return
    // Stop here so an open side panel doesn't also close.
    event.stopPropagation()
    setIsMenuOpen(false)
    triggerRef.current?.focus()
  }

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
        <div className="profile-menu" ref={menuRef} onKeyDown={handleMenuKeyDown}>
          <button
            ref={triggerRef}
            type="button"
            className="profile-menu-trigger"
            aria-haspopup="true"
            aria-expanded={isMenuOpen}
            aria-controls={menuId}
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            <span className="app-bar-avatar" aria-hidden="true">
              {initials(user.name)}
            </span>
            <span className="app-bar-user-name">{user.name}</span>
            <img className="profile-menu-chevron" src={chevronIcon} alt="" width="16" height="16" />
          </button>

          {isMenuOpen && (
            <div id={menuId} className="profile-menu-popover">
              <div className="profile-menu-header">
                <p className="profile-menu-name">{user.name}</p>
                <p className="profile-menu-role">{user.role === 'admin' ? 'Admin' : 'Staff'}</p>
              </div>
              {user.role === 'admin' && pathname !== '/users/new' && (
                <Button
                  variant="ghost"
                  block
                  className="profile-menu-item"
                  onClick={() => {
                    setIsMenuOpen(false)
                    navigate('/users/new')
                  }}
                >
                  <img src={userPlusIcon} alt="" />
                  Create user
                </Button>
              )}
              <Button variant="ghost" block className="profile-menu-item" onClick={handleLogout} isLoading={isLoggingOut}>
                {!isLoggingOut && <img src={logoutIcon} alt="" />}
                Log out
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
