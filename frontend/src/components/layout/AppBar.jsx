import { useId, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Button from '../ui/Button'
import Logo from '../ui/Logo'
import logoutIcon from '../../assets/icons/logout.svg'
import chevronIcon from '../../assets/icons/chevron-down-sm.svg'
import userPlusIcon from '../../assets/icons/user-plus.svg'
import { useAuth } from '../../features/auth/useAuth'
import { ROLE_LABELS } from '../../utils/roles'
import { useClickOutside } from '../../hooks/useClickOutside'
import './AppBar.css'

function initials(name) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts.at(-1)[0] : (parts[0]?.[1] ?? ''))).toUpperCase()
}

// Phones only (CSS shows it below 768px): opens the sidebar as a drawer.
function MenuIcon({ isOpen }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      {isOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
    </svg>
  )
}

export default function AppBar({ isNavOpen = false, onMenuClick, onNavigate }) {
  const { user, logout } = useAuth()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuId = useId()
  const menuRef = useRef(null)
  const triggerRef = useRef(null)
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useClickOutside(menuRef, isMenuOpen, () => setIsMenuOpen(false))

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
      <div className="app-bar-start">
        <button
          type="button"
          className="app-bar-menu"
          aria-label={isNavOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={isNavOpen}
          aria-controls="app-nav"
          onClick={onMenuClick}
        >
          <MenuIcon isOpen={isNavOpen} />
        </button>
        <Link to="/" className="app-bar-brand" onClick={onNavigate}>
          <Logo size="sm" />
          <span>EBR Inventory System</span>
        </Link>
      </div>

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
                <p className="profile-menu-role">{ROLE_LABELS[user.role] ?? user.role}</p>
              </div>
              {user.role === 'admin' && pathname !== '/users/new' && (
                <Button
                  variant="ghost"
                  block
                  className="profile-menu-item"
                  onClick={() => {
                    setIsMenuOpen(false)
                    onNavigate?.()
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
