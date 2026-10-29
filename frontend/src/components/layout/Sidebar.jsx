import { NavLink } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import './Sidebar.css'

// roles: who can open the page; keep in step with the RoleRoute/AdminRoute wrappers in App.jsx.
const LINKS = [
  { to: '/transactions', label: 'Transactions', icon: 'transactions', roles: ['admin', 'warehouse'] },
  { to: '/items', label: 'Items', icon: 'items', roles: ['admin', 'encoder'] },
  { to: '/activity', label: 'Activity', icon: 'activity', roles: ['admin'] },
]

// Shows icons only, and expands over the page on hover or keyboard focus.
export default function Sidebar() {
  const { user } = useAuth()
  const links = LINKS.filter((link) => link.roles.includes(user.role))

  return (
    <aside className="sidebar">
      <nav className="sidebar-panel" aria-label="Main">
        {links.map((link) => (
          <NavLink key={link.to} to={link.to} className="sidebar-link" title={link.label}>
            <span className={`sidebar-icon sidebar-icon-${link.icon}`} aria-hidden="true" />
            <span className="sidebar-label">{link.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
