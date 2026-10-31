import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import { useCostCenter } from '../../features/costCenter/useCostCenter'
import { usePendingReservations } from '../../hooks/usePendingReservations'
import { viewPath } from '../../utils/rememberedViews'
import { COST_CENTERS, costCenterLabel } from '../../utils/costCenters'
import chevronIcon from '../../assets/icons/chevron-down-sm.svg'
import '../ui/TextField.css'
import './Sidebar.css'

// roles: who can open the page; keep in step with the RoleRoute/AdminRoute wrappers in App.jsx.
const LINKS = [
  { to: '/transactions', label: 'Transactions', icon: 'transactions', roles: ['admin', 'warehouse'] },
  { to: '/reservations', label: 'Reservations', icon: 'reservations', roles: ['admin', 'warehouse'] },
  { to: '/items', label: 'Items', icon: 'items', roles: ['admin', 'encoder'] },
  { to: '/activity', label: 'Activity', icon: 'activity', roles: ['admin'] },
  { to: '/users', label: 'User management', icon: 'users', roles: ['admin'] },
]

// Shows icons only, and expands over the page on hover or keyboard focus.
export default function Sidebar() {
  const { user } = useAuth()
  const { pathname, search } = useLocation()
  const links = LINKS.filter((link) => link.roles.includes(user.role))
  const reservations = usePendingReservations({ enabled: links.some((link) => link.to === '/reservations') })
  const { costCenter, canSwitch, setCostCenter } = useCostCenter()
  const label = costCenterLabel(costCenter)

  return (
    <aside className="sidebar">
      <nav className="sidebar-panel" aria-label="Main">
        {/* Collapsed: the cost center's initial. Expanded: the dropdown (admins) or its name. */}
        <div className="sidebar-branch" title={`Cost center: ${label}`}>
          <span className="sidebar-branch-mark" aria-hidden="true">
            {label.charAt(0)}
          </span>
          {canSwitch ? (
            <div className="field-control sidebar-branch-control">
              <select
                className="field-input field-select"
                aria-label="Cost center"
                value={costCenter}
                onChange={(e) => setCostCenter(e.target.value)}
              >
                {COST_CENTERS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <div className="field-adornment field-adornment-icon" aria-hidden="true">
                <img src={chevronIcon} alt="" width="16" height="16" />
              </div>
            </div>
          ) : (
            <span className="sidebar-branch-control sidebar-branch-name">
              <span className="visually-hidden">Cost center: </span>
              {label}
            </span>
          )}
        </div>

        {links.map((link) => (
          <NavLink
            key={link.to}
            // Back to the page with its last filters; the current page keeps its own URL.
            to={link.to === pathname ? pathname + search : viewPath(link.to)}
            className="sidebar-link"
            title={link.label}
            aria-label={
              link.to === '/reservations' && reservations.pending
                ? `${link.label}, ${reservations.pending} pending`
                : undefined
            }
          >
            <span className={`sidebar-icon sidebar-icon-${link.icon}`} aria-hidden="true" />
            <span className="sidebar-label">{link.label}</span>
            {link.to === '/reservations' && reservations.pending > 0 && (
              // Red while any reservation is past its needed-by date.
              <span className={`sidebar-badge ${reservations.overdue ? 'is-overdue' : ''}`} aria-hidden="true">
                {reservations.pending > 99 ? '99+' : reservations.pending}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
