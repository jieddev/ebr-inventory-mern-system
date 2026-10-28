import { useCallback, useEffect, useId, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Button from '../../components/ui/Button'
import SegmentedControl from '../../components/ui/SegmentedControl'
import { getErrorMessage } from '../../api/auth'
import { getAuditLog } from '../../api/audit'
import { formatDate, formatNumber, pluralize } from '../../utils/format'
import { datePresets } from '../../utils/filters'
import searchIcon from '../../assets/icons/search.svg'
// Chip and link styles for the date presets.
import '../../components/filters/FilterDropdown.css'
import '../transactions/TransactionsPage.css'
import '../items/ItemsPage.css'
import './ActivityPage.css'

const PAGE_SIZE = 50
const SEARCH_DELAY_MS = 300

const GROUP_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'auth', label: 'Logins' },
  { value: 'item', label: 'Items' },
  { value: 'transaction', label: 'Transactions' },
  { value: 'user', label: 'Users' },
]

const ACTION_LABELS = {
  'auth.login': 'Logged in',
  'auth.login_failed': 'Failed login',
  'auth.logout': 'Logged out',
  'user.create': 'Created user',
  'item.create': 'Added item',
  'item.update': 'Edited item',
  'item.archive': 'Archived item',
  'item.restore': 'Restored item',
  'item.batch_archive': 'Archived items',
  'item.batch_restore': 'Restored items',
  'item.import': 'Imported Excel',
  'item.export': 'Exported Excel',
  'transaction.create': 'Added transaction',
}

const FIELD_LABELS = {
  category: 'Category',
  code: 'Item code',
  brand: 'Brand',
  typeDesign: 'Type / Design',
  balanceForwarded: 'Balance forwarded',
}

const FAILED_LOGIN_REASONS = {
  unknown_id: 'unknown ID',
  wrong_password: 'wrong password',
  disabled: 'account disabled',
}

const timeFormat = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
const localDateFormat = new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })

// Admin only: the audit log — who did what, to what, and when. Read-only; entries are
// kept for a year (see backend models/AuditLog.js).
export default function ActivityPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const group = searchParams.get('group') ?? ''
  const user = searchParams.get('user') ?? ''
  const from = searchParams.get('from') ?? ''
  const to = searchParams.get('to') ?? ''
  const search = searchParams.get('search') ?? ''
  const page = Math.max(1, Number(searchParams.get('page')) || 1)

  const userSelectId = useId()
  const [searchText, setSearchText] = useState(search)
  const [reloadKey, setReloadKey] = useState(0)
  // The last finished request. It's loading while that isn't the current request.
  const [response, setResponse] = useState({ key: null, data: null, error: '' })

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
    const timer = setTimeout(() => updateParams({ search: searchText.trim(), page: null }), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [searchText, search, updateParams])

  const requestKey = `${searchParams.toString()}|${reloadKey}`
  useEffect(() => {
    const controller = new AbortController()
    getAuditLog({ group, user, from, to, search, page, limit: PAGE_SIZE }, { signal: controller.signal })
      .then((data) => setResponse({ key: requestKey, data, error: '' }))
      .catch((err) => {
        if (controller.signal.aborted) return
        const message = getErrorMessage(err, 'Could not load the activity log.')
        setResponse((prev) => ({ key: requestKey, data: prev.data, error: message }))
      })
    return () => controller.abort()
  }, [group, user, from, to, search, page, requestKey])

  const { data } = response
  const isLoading = response.key !== requestKey
  const reload = () => setReloadKey((k) => k + 1)

  const entries = data?.entries ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1
  const first = total ? (page - 1) * PAGE_SIZE + 1 : 0
  const last = Math.min(page * PAGE_SIZE, total)
  const isFiltered = Boolean(group || user || from || to || search)

  function setFilter(changes) {
    updateParams({ ...changes, page: null })
  }

  function clearFilters() {
    setSearchText('')
    updateParams({ group: null, user: null, from: null, to: null, search: null, page: null })
  }

  return (
    <div className="workspace">
      <section className="workspace-content">
        <header className="page-header">
          <div>
            <h1>Activity</h1>
            <p className="activity-subtitle">Who did what and when. Entries are kept for one year.</p>
          </div>
          <Button variant="secondary" onClick={reload} isLoading={isLoading && Boolean(data)}>
            Refresh
          </Button>
        </header>

        <div className="toolbar">
          <div className="toolbar-search">
            <label className="search-input">
              <img src={searchIcon} alt="" width="18" height="18" />
              <input
                type="search"
                placeholder="Search by item, user or login ID"
                aria-label="Search activity"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </label>
            <label className="visually-hidden" htmlFor={userSelectId}>
              User
            </label>
            <select
              id={userSelectId}
              className="activity-select"
              value={user}
              onChange={(e) => setFilter({ user: e.target.value })}
            >
              <option value="">All users</option>
              {(data?.users ?? []).map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name} ({u.userId})
                </option>
              ))}
            </select>
          </div>
          <SegmentedControl
            label="Activity type"
            hideLabel
            name="activity-group"
            options={GROUP_OPTIONS}
            value={group}
            onChange={(value) => setFilter({ group: value })}
          />
        </div>

        <div className="activity-dates">
          {datePresets().map((preset) => {
            const isActive = preset.from === from && preset.to === to
            return (
              <button
                key={preset.label}
                type="button"
                className={`filter-chip-button ${isActive ? 'is-active' : ''}`}
                aria-pressed={isActive}
                onClick={() => setFilter(isActive ? { from: null, to: null } : { from: preset.from, to: preset.to })}
              >
                {preset.label}
              </button>
            )
          })}
          <label>
            <span>From</span>
            <input
              type="date"
              className="field-input"
              value={from}
              max={to || undefined}
              onChange={(e) => setFilter({ from: e.target.value })}
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="date"
              className="field-input"
              value={to}
              min={from || undefined}
              onChange={(e) => setFilter({ to: e.target.value })}
            />
          </label>
          {isFiltered && (
            <button type="button" className="filter-link" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>

        {response.error && (
          <div className="page-error" role="alert">
            {response.error}
            <Button variant="secondary" size="sm" onClick={reload}>
              Try again
            </Button>
          </div>
        )}

        <div className={`table-card ${isLoading && data ? 'is-loading' : ''}`} aria-busy={isLoading}>
          {entries.length > 0 && (
            <div className="items-table-scroll">
              <table className="items-table activity-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Who</th>
                    <th>Action</th>
                    <th>Item / Target</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry._id}>
                      <td className="activity-when">
                        <span>{localDateFormat.format(new Date(entry.at))}</span>
                        <span className="items-muted">{timeFormat.format(new Date(entry.at))}</span>
                      </td>
                      <td className="activity-who">
                        {entry.actor?.name ? (
                          <>
                            <span>{entry.actor.name}</span>
                            <span className="items-muted">{entry.actor.userId}</span>
                          </>
                        ) : (
                          <span className="items-muted">—</span>
                        )}
                      </td>
                      <td>
                        <span className={`activity-action activity-action-${entry.action.split('.')[0]} ${entry.action === 'auth.login_failed' ? 'is-failed' : ''}`}>
                          {ACTION_LABELS[entry.action] ?? entry.action}
                        </span>
                      </td>
                      <td className="activity-target">
                        <Target target={entry.target} />
                      </td>
                      <td className="activity-details">
                        <Details entry={entry} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data && entries.length === 0 && (
            <div className="table-empty">
              {isFiltered ? (
                <>
                  <p>No activity matches these filters.</p>
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                </>
              ) : (
                <p>No activity yet.</p>
              )}
            </div>
          )}

          {!data && isLoading && <div className="table-empty">Loading activity…</div>}

          {data && total > 0 && (
            <footer className="table-footer">
              <span>
                Showing {formatNumber(first)}–{formatNumber(last)} of {formatNumber(total)}{' '}
                {total === 1 ? 'entry' : 'entries'} · newest first
              </span>
              <div className="table-pager">
                <span className="table-page-count">
                  Page {formatNumber(page)} of {formatNumber(totalPages)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => updateParams({ page: page - 1 > 1 ? String(page - 1) : null })}
                >
                  Previous
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => updateParams({ page: String(page + 1) })}
                >
                  Next
                </Button>
              </div>
            </footer>
          )}
        </div>
      </section>
    </div>
  )
}

// Items are labelled "ITM-00012 · 2.25-17 TUBE · IZUMI TUBE · TUBE": the ID is highlighted.
function Target({ target }) {
  if (!target?.label) return <span className="items-muted">—</span>
  const [first, ...rest] = target.label.split(' · ')
  if (target.type === 'item' && /^ITM-/.test(first)) {
    return (
      <>
        <span className="items-id">{first}</span> <span>{rest.join(' · ')}</span>
      </>
    )
  }
  return <span>{target.label}</span>
}

function Details({ entry }) {
  const d = entry.details ?? {}
  switch (entry.action) {
    case 'auth.login_failed':
      return (
        <span className="is-failed-text">
          ID “{d.userId}” · {FAILED_LOGIN_REASONS[d.reason] ?? d.reason}
        </span>
      )
    case 'item.update':
      return (
        <ul className="activity-changes">
          {Object.entries(entry.changes ?? {}).map(([field, { from, to }]) => (
            <li key={field}>
              {FIELD_LABELS[field] ?? field}: <span className="items-muted">{String(from) || '(blank)'}</span> →{' '}
              <strong>{String(to) || '(blank)'}</strong>
            </li>
          ))}
        </ul>
      )
    case 'item.create':
      return `${d.category || 'No category'} · opening balance ${formatNumber(d.balanceForwarded)}`
    case 'transaction.create':
      return [`${d.type} ${formatNumber(d.quantity)}`, formatDate(d.date), d.customerName].filter(Boolean).join(' · ')
    case 'item.import':
      return [
        d.fileName,
        `added ${formatNumber(d.added)}`,
        d.skippedExisting && `${formatNumber(d.skippedExisting)} already existed`,
        (d.skippedDuplicates || d.invalid) && `${formatNumber(d.skippedDuplicates + d.invalid)} rows skipped`,
      ]
        .filter(Boolean)
        .join(' · ')
    case 'item.export':
      return `${pluralize(d.count, 'item')}`
    case 'item.batch_archive':
    case 'item.batch_restore':
      return `${pluralize(d.count, 'item')}${d.all ? ' · all matching' : ''}`
    case 'user.create':
      return `Role: ${d.role}`
    default:
      return entry.ip ? <span className="items-muted">from {entry.ip.replace(/^::ffff:/, '')}</span> : null
  }
}
