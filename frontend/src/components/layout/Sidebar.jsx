import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import { useCostCenter } from '../../features/costCenter/useCostCenter'
import { usePendingReservations } from '../../hooks/usePendingReservations'
import { viewPath } from '../../utils/rememberedViews'
import { REPORT_PERMISSIONS, canAny } from '../../utils/permissions'
import { COST_CENTERS, costCenterLabel } from '../../utils/costCenters'
import chevronIcon from '../../assets/icons/chevron-down-sm.svg'
import '../ui/TextField.css'
import './Sidebar.css'

// permission: who can open the page, one or a list of any (admins can open all; none = everyone); keep in step with the
// PermissionRoute/AdminRoute wrappers in App.jsx.
const LINKS = [
  { to: '/', label: 'Dashboard', icon: 'dashboard' },
  { to: '/transactions', label: 'Transactions', icon: 'transactions', permission: 'addTransactions' },
  { to: '/reservations', label: 'Reservations', icon: 'reservations', permission: 'addTransactions' },
  { to: '/items', label: 'Items', icon: 'items', permission: 'viewItems' },
  { to: '/reports', label: 'Reports', icon: 'reports', permission: REPORT_PERMISSIONS },
  { to: '/activity', label: 'Activity', icon: 'activity', adminOnly: true },
  { to: '/users', label: 'User management', icon: 'users', adminOnly: true },
]

// Shows icons only, and expands over the page on hover or keyboard focus.
export default function Sidebar() {
  const { user } = useAuth()
  const { pathname, search } = useLocation()
  const links = LINKS.filter((link) => {
    if (link.adminOnly) return user.role === 'admin'
    return !link.permission || canAny(user, [].concat(link.permission))
  })
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
            // "/" matches every page, so only highlight it on the dashboard itself.
            end={link.to === '/'}
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
