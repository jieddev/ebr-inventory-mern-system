import { NavLink } from 'react-router-dom'
import './Sidebar.css'

const LINKS = [
  { to: '/transactions', label: 'Transactions', icon: 'transactions' },
  { to: '/items', label: 'Items', icon: 'items' },
  { to: '/activity', label: 'Activity', icon: 'activity' },
]

// Shows icons only, and expands over the page on hover or keyboard focus.
export default function Sidebar() {
  return (
    <aside className="sidebar">
      <nav className="sidebar-panel" aria-label="Main">
        {LINKS.map((link) => (
          <NavLink key={link.to} to={link.to} className="sidebar-link" title={link.label}>
            <span className={`sidebar-icon sidebar-icon-${link.icon}`} aria-hidden="true" />
            <span className="sidebar-label">{link.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
