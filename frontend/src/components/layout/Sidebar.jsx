import { useEffect, useId, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import { useCostCenter } from '../../features/costCenter/useCostCenter'
import { usePendingReservations } from '../../hooks/usePendingReservations'
import { viewPath } from '../../utils/rememberedViews'
import { REPORT_PERMISSIONS, canAny } from '../../utils/permissions'
import { COST_CENTERS, costCenterLabel } from '../../utils/costCenters'
import chevronIcon from '../../assets/icons/chevron-right-sm.svg'
import checkIcon from '../../assets/icons/check.svg'
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
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const triggerRef = useRef(null)
  const pickerId = useId()

  function closePicker({ returnFocus = false } = {}) {
    setIsPickerOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  return (
    <aside className="sidebar">
      {/* Stays expanded while the cost center card is open, so the card stays beside it. */}
      <nav className={`sidebar-panel ${isPickerOpen ? 'is-pinned' : ''}`} aria-label="Main">
        {/* Collapsed: the cost center's initial. Expanded: its name, a button that opens the
            cost center card for admins. */}
        {canSwitch ? (
          <button
            ref={triggerRef}
            type="button"
            className="sidebar-branch sidebar-branch-trigger"
            title={`Cost center: ${label}`}
            aria-haspopup="true"
            aria-expanded={isPickerOpen}
            aria-controls={pickerId}
            onClick={() => setIsPickerOpen((open) => !open)}
          >
            <span className="sidebar-branch-mark" aria-hidden="true">
              {label.charAt(0)}
            </span>
            <span className="sidebar-branch-control sidebar-branch-name">
              <span className="visually-hidden">Cost center: </span>
              {label}
            </span>
            <img className="sidebar-branch-chevron" src={chevronIcon} alt="" width="16" height="16" />
          </button>
        ) : (
          <div className="sidebar-branch" title={`Cost center: ${label}`}>
            <span className="sidebar-branch-mark" aria-hidden="true">
              {label.charAt(0)}
            </span>
            <span className="sidebar-branch-control sidebar-branch-name">
              <span className="visually-hidden">Cost center: </span>
              {label}
            </span>
          </div>
        )}

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

      {isPickerOpen && (
        <CostCenterCard
          id={pickerId}
          value={costCenter}
          triggerRef={triggerRef}
          onSelect={(value) => {
            setCostCenter(value)
            closePicker({ returnFocus: true })
          }}
          onClose={closePicker}
        />
      )}
    </aside>
  )
}

// The admin's cost center choices, in a card beside the sidebar. Arrow keys move between them,
// Escape closes it, and pressing outside it (except on its trigger) closes it too.
function CostCenterCard({ id, value, triggerRef, onSelect, onClose }) {
  const cardRef = useRef(null)
  const titleId = useId()

  // Start on the current cost center.
  useEffect(() => {
    cardRef.current?.querySelector('[aria-checked="true"]')?.focus()
  }, [])

  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  useEffect(() => {
    function handlePointerDown(event) {
      if (cardRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) return
      onCloseRef.current()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [triggerRef])

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      // Stop here so an open side panel doesn't also close.
      event.stopPropagation()
      onClose({ returnFocus: true })
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const options = [...cardRef.current.querySelectorAll('[role="menuitemradio"]')]
    const index = options.indexOf(document.activeElement)
    const next = (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
    options[next].focus()
  }

  return (
    <div id={id} ref={cardRef} className="cost-center-card" onKeyDown={handleKeyDown}>
      <div className="cost-center-card-header">
        <p id={titleId} className="cost-center-card-title">
          Cost center
        </p>
        <p className="cost-center-card-hint">Pages show this cost center's items and transactions.</p>
      </div>
      <div role="menu" aria-labelledby={titleId}>
        {COST_CENTERS.map((c) => (
          <button
            key={c.value}
            type="button"
            role="menuitemradio"
            aria-checked={c.value === value}
            className="cost-center-option"
            onClick={() => (c.value === value ? onClose({ returnFocus: true }) : onSelect(c.value))}
          >
            <span className="cost-center-option-mark" aria-hidden="true">
              {c.label.charAt(0)}
            </span>
            <span className="cost-center-option-label">{c.label}</span>
            {c.value === value && <img src={checkIcon} alt="" width="16" height="16" />}
          </button>
        ))}
      </div>
    </div>
  )
}
