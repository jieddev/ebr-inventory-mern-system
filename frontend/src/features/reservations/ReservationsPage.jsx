import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Button from '../../components/ui/Button'
import CopyText from '../../components/ui/CopyText'
import ActiveFilters from '../../components/filters/ActiveFilters'
import { getErrorMessage } from '../../api/auth'
import { getReservations } from '../../api/transactions'
import { useLiveUpdates } from '../../hooks/useLiveUpdates'
import { formatDate, formatNumber, pluralize } from '../../utils/format'
import ReservationDialogs from './ReservationDialogs'
import ReservationFilter from './ReservationFilter'
import { DUE_OPTIONS, EMPTY_RESERVATION_FILTERS, countReservationFilters, reservationChips } from './reservationFilters'
import searchIcon from '../../assets/icons/search.svg'
import '../transactions/TransactionsPage.css'
import '../items/ItemsPage.css'
import './ReservationsPage.css'

const SEARCH_DELAY_MS = 300
// Saves from other PCs that land within this window cause a single re-fetch.
const LIVE_REFRESH_DELAY_MS = 300
const DAY_MS = 24 * 60 * 60 * 1000

// The warehouse's to-do list: one card per pending reservation, soonest needed first.
// Search and the due filter live in the URL, like the other list pages.
export default function ReservationsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('search') ?? ''
  const due = DUE_OPTIONS.some((o) => o.value === searchParams.get('due')) ? searchParams.get('due') : ''

  const [searchText, setSearchText] = useState(search)
  const [reloadKey, setReloadKey] = useState(0)
  // The last finished request. It's loading while that isn't the current request.
  const [response, setResponse] = useState({ key: null, data: null, error: '' })
  const [dialog, setDialog] = useState(null) // { reservation, action }

  const updateParams = useCallback(
    (changes) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value)
            else next.delete(key)
          }
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  // Push the search box into the URL after the user stops typing.
  useEffect(() => {
    if (searchText.trim() === search) return
    const timer = setTimeout(() => updateParams({ search: searchText.trim() }), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [searchText, search, updateParams])

  const requestKey = `${search}|${due}|${reloadKey}`
  useEffect(() => {
    const controller = new AbortController()
    getReservations({ search, due }, { signal: controller.signal })
      .then((data) => setResponse({ key: requestKey, data, error: '' }))
      .catch((err) => {
        if (controller.signal.aborted) return
        setResponse((prev) => ({ ...prev, key: requestKey, error: getErrorMessage(err, 'Could not load reservations.') }))
      })
    return () => controller.abort()
  }, [search, due, requestKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  // Changes from any PC (including this one) re-fetch once.
  const liveTimer = useRef(null)
  useEffect(() => () => clearTimeout(liveTimer.current), [])
  useLiveUpdates(() => {
    clearTimeout(liveTimer.current)
    liveTimer.current = setTimeout(reload, LIVE_REFRESH_DELAY_MS)
  })

  const isLoading = response.key !== requestKey
  const { data, error } = response
  const reservations = data?.reservations ?? []
  const counts = data?.counts
  const filters = { due }
  const isFiltered = Boolean(search || countReservationFilters(filters))

  return (
    <div className="workspace">
      <section className="workspace-content">
        <header className="page-header">
          <div>
            <h1>Reservations</h1>
            <p className="reservations-subtitle">
              {counts ? `${pluralize(counts.all, 'pending reservation')}${search ? ' matching the search' : ''}` : ' '}
            </p>
          </div>
        </header>

        <div className="toolbar">
          <div className="toolbar-search">
            <label className="search-input">
              <img src={searchIcon} alt="" width="18" height="18" />
              <input
                type="search"
                placeholder="Search by item ID, code, brand or customer"
                aria-label="Search reservations"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </label>
            <ReservationFilter filters={filters} counts={counts} onApply={updateParams} />
          </div>
        </div>

        <ActiveFilters
          chips={reservationChips(filters)}
          onChange={updateParams}
          onClearAll={() => updateParams(EMPTY_RESERVATION_FILTERS)}
          summary={
            data && (
              <>
                <strong>{formatNumber(reservations.length)}</strong>{' '}
                {reservations.length === 1 ? 'reservation' : 'reservations'} match
              </>
            )
          }
        />

        {error && (
          <div className="page-error" role="alert">
            {error}
            <Button variant="secondary" size="sm" onClick={reload}>
              Try again
            </Button>
          </div>
        )}

        {!data && isLoading && <div className="table-empty">Loading reservations…</div>}

        {data && reservations.length === 0 && (
          <div className="table-empty">
            {isFiltered ? 'No reservations match.' : 'No pending reservations.'}
            {isFiltered && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearchText('')
                  updateParams({ ...EMPTY_RESERVATION_FILTERS, search: '' })
                }}
              >
                Clear search and filter
              </Button>
            )}
          </div>
        )}

        {reservations.length > 0 && (
          <ul className={`reservation-grid ${isLoading ? 'is-loading' : ''}`} aria-busy={isLoading}>
            {reservations.map((r) => (
              <ReservationCard
                key={r._id}
                reservation={r}
                today={data.today}
                onAction={(action) => setDialog({ reservation: r, action })}
              />
            ))}
          </ul>
        )}
      </section>

      {dialog && (
        <ReservationDialogs
          reservation={dialog.reservation}
          action={dialog.action}
          onDone={() => {
            setDialog(null)
            reload()
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}

// "Overdue · 3 days", "Due today", "Due 11/02/2026" or "No date", from the server's today.
function dueStatus(neededBy, today) {
  if (!neededBy) return { tone: 'none', label: 'No needed-by date' }
  const days = Math.round((new Date(neededBy) - new Date(today)) / DAY_MS)
  if (days < 0) return { tone: 'overdue', label: `Overdue · ${pluralize(-days, 'day')}` }
  if (days === 0) return { tone: 'today', label: 'Due today' }
  return { tone: 'upcoming', label: `Due ${formatDate(neededBy)}` }
}

function ReservationCard({ reservation: r, today, onAction }) {
  const status = dueStatus(r.neededBy, today)
  const item = r.item ?? {}

  return (
    <li className={`reservation-card is-${status.tone}`}>
      <header className="reservation-card-top">
        {item.itemId ? <CopyText text={item.itemId} className="reservation-card-id" /> : <span />}
        <span className={`reservation-due is-${status.tone}`}>{status.label}</span>
      </header>

      <div>
        <p className="reservation-card-code">{item.code}</p>
        <p className="reservation-card-muted">{[item.brand, item.category].filter(Boolean).join(' · ') || '—'}</p>
      </div>

      <div className="reservation-card-qty">
        <strong>{formatNumber(r.quantity)}</strong>
        <span className="reservation-card-muted">reserved · balance {formatNumber(item.balance)}</span>
      </div>

      <dl className="reservation-card-details">
        <div>
          <dt>Customer</dt>
          <dd>{r.customerName || '—'}</dd>
        </div>
        <div>
          <dt>Reserved</dt>
          <dd>
            {formatDate(r.date)}
            {r.createdBy?.name && <span className="reservation-card-muted"> by {r.createdBy.name}</span>}
          </dd>
        </div>
        {r.notes && (
          <div>
            <dt>Notes</dt>
            <dd className="reservation-card-notes" title={r.notes}>
              {r.notes}
            </dd>
          </div>
        )}
      </dl>

      <footer className="reservation-card-actions">
        <Button variant="secondary" size="sm" onClick={() => onAction('cancel')}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => onAction('release')}>
          Confirm out
        </Button>
      </footer>
    </li>
  )
}
