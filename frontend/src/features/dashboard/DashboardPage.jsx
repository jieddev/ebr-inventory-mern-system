import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import { getErrorMessage } from '../../api/auth'
import { getDashboard } from '../../api/dashboard'
import { useLiveUpdates } from '../../hooks/useLiveUpdates'
import { useAuth } from '../auth/useAuth'
import { can } from '../../utils/permissions'
import { formatDate, formatNumber, todayInputValue } from '../../utils/format'
import alertIcon from '../../assets/icons/alert-triangle.svg'
import '../transactions/TransactionsPage.css'
import './DashboardPage.css'

// Changes from other PCs that land within this window cause a single re-fetch.
const LIVE_REFRESH_DELAY_MS = 500

// Home page for every signed-in user: today's movement, reservations and stock for the cost
// center, and the latest entries. The API leaves out what the user can't see.
export default function DashboardPage() {
  const { user } = useAuth()
  const [reloadKey, setReloadKey] = useState(0)
  // The last finished request; it's loading while that isn't the current request.
  const [response, setResponse] = useState({ key: null, data: null, error: '' })

  useEffect(() => {
    const controller = new AbortController()
    getDashboard({ signal: controller.signal })
      .then((data) => setResponse({ key: reloadKey, data, error: '' }))
      .catch((err) => {
        if (controller.signal.aborted) return
        const message = getErrorMessage(err, 'Could not load the dashboard.')
        setResponse((prev) => ({ key: reloadKey, data: prev.data, error: message }))
      })
    return () => controller.abort()
  }, [reloadKey])

  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  useLiveUpdates(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setReloadKey((k) => k + 1), LIVE_REFRESH_DELAY_MS)
  })

  const { data, error } = response
  const hasData = data && (data.stock || data.today || data.reservations || data.recent)

  return (
    <div className="workspace">
      <section className="workspace-content dashboard">
        {/* No visible title; this names the page for screen readers. */}
        <h1 className="visually-hidden">Dashboard</h1>

        {error && (
          <div className="page-error" role="alert">
            {error}
            <Button variant="secondary" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
              Try again
            </Button>
          </div>
        )}

        {!data && !error && <div className="table-empty">Loading the dashboard…</div>}

        {hasData && <StatTiles data={data} user={user} />}

        {data?.recent && <RecentEntries entries={data.recent} />}

        {data && !hasData && (
          <div className="table-card table-empty">
            <p>No pages are turned on for your account yet. Ask an admin to give you access.</p>
          </div>
        )}
      </section>
    </div>
  )
}

function StatTiles({ data, user }) {
  const { stock, today, reservations } = data
  const day = todayInputValue()
  const todayReport = can(user, 'viewTransactionReport') ? `/reports/transactions?from=${day}&to=${day}` : null
  const canFilterStock = can(user, 'viewItems') && can(user, 'viewItemStock')

  return (
    <div className="stat-tiles">
      {today && (
        <>
          <StatTile
            label={<><Badge kind="IN" /> Today</>}
            value={formatNumber(today.in)}
            detail="units received"
            to={todayReport}
          />
          <StatTile
            label={<><Badge kind="OUT" /> Today</>}
            value={formatNumber(today.out)}
            detail="units released"
            to={todayReport}
          />
        </>
      )}
      {reservations && (
        <StatTile
          label="Pending reservations"
          value={formatNumber(reservations.pending)}
          detail={
            reservations.overdue > 0 ? (
              <span className="stat-status is-warning">
                <img src={alertIcon} alt="" width="14" height="14" />
                {formatNumber(reservations.overdue)} overdue
              </span>
            ) : reservations.dueToday > 0 ? (
              `${formatNumber(reservations.dueToday)} due today`
            ) : (
              'None overdue'
            )
          }
          to={reservations.overdue > 0 ? '/reservations?due=overdue' : '/reservations'}
        />
      )}
      {stock && (
        <StatTile
          label="Active items"
          value={formatNumber(stock.items)}
          detail={stock.outOfStock != null ? `${formatNumber(stock.outOfStock)} out of stock` : null}
          to={can(user, 'viewItems') ? (stock.outOfStock && canFilterStock ? '/items?stock=out' : '/items') : null}
        />
      )}
    </div>
  )
}

// label · value · detail. With `to`, the whole tile links to the page behind the number.
function StatTile({ label, value, detail, to }) {
  const body = (
    <>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {detail && <span className="stat-detail">{detail}</span>}
    </>
  )
  return to ? (
    <Link to={to} className="stat-tile is-link">
      {body}
    </Link>
  ) : (
    <div className="stat-tile">{body}</div>
  )
}

function RecentEntries({ entries }) {
  return (
    <section className="table-card dashboard-card" aria-labelledby="dashboard-recent">
      <header className="dashboard-card-header">
        <h2 id="dashboard-recent">Recent entries</h2>
        <Link to="/transactions" className="dashboard-card-link">
          View all
        </Link>
      </header>
      {entries.length === 0 ? (
        <p className="dashboard-empty">No transactions yet.</p>
      ) : (
        <ul className="recent-list">
          {entries.map((entry) => (
            <li key={entry._id}>
              <Badge kind={entry.type} />
              <div className="recent-item">
                <span className="recent-code">{entry.item?.code ?? 'Deleted item'}</span>
                <span className="recent-meta">
                  {[entry.item?.brand, formatDate(entry.date), entry.customerName].filter(Boolean).join(' · ')}
                </span>
              </div>
              <span className="recent-quantity">{formatNumber(entry.quantity)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
