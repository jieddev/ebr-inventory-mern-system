import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Button from '../../components/ui/Button'
import ActiveFilters from '../../components/filters/ActiveFilters'
import { getErrorMessage } from '../../api/auth'
import { getAuditLog } from '../../api/audit'
import { formatDate, formatNumber, pluralize } from '../../utils/format'
import { costCenterLabel } from '../../utils/costCenters'
import { permissionShortLabel } from '../../utils/permissions'
import ActivityFilter from './ActivityFilter'
import { EMPTY_ACTIVITY_FILTERS, activityChips, countActivityFilters, readActivityFilters } from './activityFilters'
import searchIcon from '../../assets/icons/search.svg'
import '../transactions/TransactionsPage.css'
import '../items/ItemsPage.css'
import './ActivityPage.css'

const PAGE_SIZE = 50
const SEARCH_DELAY_MS = 300

const ACTION_LABELS = {
  'auth.login': 'Logged in',
  'auth.login_failed': 'Failed login',
  'auth.logout': 'Logged out',
  'user.create': 'Created user',
  'user.update': 'Edited user',
  'item.create': 'Added item',
  'item.update': 'Edited item',
  'item.archive': 'Archived item',
  'item.restore': 'Restored item',
  'item.batch_archive': 'Archived items',
  'item.batch_restore': 'Restored items',
  'item.import': 'Imported Excel',
  'item.import_undo': 'Undid import',
  'item.export': 'Exported Excel',
  'item.list_export': 'Exported item list',
  'transaction.create': 'Added transaction',
  'transaction.release': 'Released reservation',
  'transaction.cancel': 'Cancelled reservation',
  'transaction.rollback': 'Rolled back transaction',
  'transaction.update': 'Edited transaction',
  'receiving.create': 'Receiving report',
  'batchout.create': 'Batch out',
  'report.export': 'Exported Daily Report',
  'report.transactions_export': 'Exported Transaction Report',
  'report.reconcile_export': 'Exported Reconcile Report',
  'report.stockcard_export': 'Exported Stockcard',
}

const FIELD_LABELS = {
  category: 'Category',
  code: 'Item description',
  brand: 'Brand',
  typeDesign: 'Type / Design',
  balanceForwarded: 'Balance forwarded',
  // Edited transactions
  date: 'Date',
  type: 'Type',
  quantity: 'Quantity',
  customerName: 'Customer name / Details',
  neededBy: 'Needed by',
  notes: 'Notes',
}

// Fields whose change values are days (YYYY-MM-DD), shown as dates.
const DAY_FIELDS = new Set(['date', 'neededBy'])
const changeText = (field, value) =>
  value === '' || value == null ? '(blank)' : DAY_FIELDS.has(field) ? formatDate(`${value}T00:00:00Z`) : String(value)

const FAILED_LOGIN_REASONS = {
  unknown_id: 'unknown ID',
  wrong_password: 'wrong password',
  disabled: 'account disabled',
  locked: 'blocked: too many attempts',
}

const timeFormat = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
const localDateFormat = new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })

// Admin only: the audit log — who did what, to what, and when. Read-only; entries are
// kept for 30 days (see backend models/AuditLog.js).
export default function ActivityPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = useMemo(() => readActivityFilters(searchParams), [searchParams])
  const search = searchParams.get('search') ?? ''
  const page = Math.max(1, Number(searchParams.get('page')) || 1)

  const [searchText, setSearchText] = useState(search)
  const [reloadKey, setReloadKey] = useState(0)
  // The last finished request. It's loading while that isn't the current request.
  const [response, setResponse] = useState({ key: null, data: null, error: '' })

  const updateParams = useCallback(
    (changes) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          // Lists become repeated keys; empty values remove the key.
          for (const [key, value] of Object.entries(changes)) {
            next.delete(key)
            for (const v of [].concat(value || [])) if (v) next.append(key, v)
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
    getAuditLog({ ...filters, search, page, limit: PAGE_SIZE }, { signal: controller.signal })
      .then((data) => setResponse({ key: requestKey, data, error: '' }))
      .catch((err) => {
        if (controller.signal.aborted) return
        const message = getErrorMessage(err, 'Could not load the activity log.')
        setResponse((prev) => ({ key: requestKey, data: prev.data, error: message }))
      })
    return () => controller.abort()
  }, [filters, search, page, requestKey])

  const { data } = response
  const isLoading = response.key !== requestKey
  const reload = () => setReloadKey((k) => k + 1)

  const entries = data?.entries ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1
  const first = total ? (page - 1) * PAGE_SIZE + 1 : 0
  const last = Math.min(page * PAGE_SIZE, total)
  const isFiltered = Boolean(search || countActivityFilters(filters))

  const userNames = new Map((data?.users ?? []).map((u) => [u._id, `${u.name} (${u.userId})`]))
  const chips = activityChips(filters, (id) => userNames.get(id) ?? 'Unknown user')

  function applyFilters(next) {
    updateParams({ ...next, page: null })
  }

  function clearFilters() {
    setSearchText('')
    updateParams({ ...EMPTY_ACTIVITY_FILTERS, search: null, page: null })
  }

  return (
    <div className="workspace">
      <section className="workspace-content">
        <header className="page-header">
          <div>
            <h1>Activity</h1>
            <p className="activity-subtitle">Activity logs are displayed here.</p>
          </div>
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
            <ActivityFilter filters={filters} onApply={applyFilters} />
          </div>
        </div>

        <ActiveFilters
          chips={chips}
          onChange={applyFilters}
          onClearAll={() => applyFilters(EMPTY_ACTIVITY_FILTERS)}
          summary={data && <><strong>{formatNumber(total)}</strong> {total === 1 ? 'entry' : 'entries'} match</>}
        />

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
                    <th>DATE</th>
                    <th>USER</th>
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
                        {entry.costCenter && <span className="activity-cost-center">{costCenterLabel(entry.costCenter)}</span>}
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
    case 'transaction.update':
      return (
        <ul className="activity-changes">
          {Object.entries(entry.changes ?? {}).map(([field, { from, to }]) => (
            <li key={field}>
              {FIELD_LABELS[field] ?? field}: <span className="items-muted">{changeText(field, from)}</span> →{' '}
              <strong>{changeText(field, to)}</strong>
            </li>
          ))}
          {d.reportNo && <li className="items-muted">On slip {d.reportNo}</li>}
        </ul>
      )
    case 'item.create':
      return `${d.category || 'No category'} · opening balance ${formatNumber(d.balanceForwarded)}`
    case 'receiving.create':
    case 'batchout.create':
      return (
        <>
          <span>
            {[`${entry.action === 'batchout.create' ? 'OUT' : 'IN'} ${formatNumber(d.totalQuantity)}`, formatDate(d.date), d.customerName]
              .filter(Boolean)
              .join(' · ')}
          </span>
          <ul className="activity-changes">
            {(d.lines ?? []).map((line, i) => (
              <li key={i} className="items-muted">
                {formatNumber(line.quantity)} {line.unit} · {line.itemId} {line.code}
              </li>
            ))}
          </ul>
        </>
      )
    case 'transaction.create':
      return [
        `${d.type} ${formatNumber(d.quantity)}`,
        formatDate(d.date),
        d.customerName,
        d.neededBy && `needed by ${formatDate(d.neededBy)}`,
        d.notes,
      ]
        .filter(Boolean)
        .join(' · ')
    case 'transaction.release':
      return [
        `OUT ${formatNumber(d.quantity)}`,
        `reserved ${formatDate(d.reservedOn)} → out ${formatDate(d.date)}`,
        d.customerName,
      ]
        .filter(Boolean)
        .join(' · ')
    case 'transaction.cancel':
      return [`RESERVE ${formatNumber(d.quantity)}`, formatDate(d.date), d.customerName].filter(Boolean).join(' · ')
    case 'transaction.rollback':
      return [
        `${d.type} ${formatNumber(d.quantity)}`,
        formatDate(d.date),
        d.customerName,
        d.wasReserved && 'was a reservation',
        d.reportNo && `BRR ${d.reportNo}`,
      ]
        .filter(Boolean)
        .join(' · ')
    case 'item.import':
      return [
        d.fileName,
        `added ${formatNumber(d.added)}`,
        d.skippedExisting && `${formatNumber(d.skippedExisting)} already existed`,
        (d.skippedDuplicates || d.invalid) && `${formatNumber(d.skippedDuplicates + d.invalid)} rows skipped`,
      ]
        .filter(Boolean)
        .join(' · ')
    case 'item.import_undo':
      return [d.fileName, `removed ${pluralize(d.removed, 'item')}`, d.importedAt && `imported ${formatDate(d.importedAt)}`]
        .filter(Boolean)
        .join(' · ')
    case 'item.export':
      return `${pluralize(d.count, 'item')}`
    case 'item.list_export':
      return `${pluralize(d.count, 'item')}${d.filtered ? ' · filtered' : ''}`
    case 'report.export':
      return `${d.from ? `${formatDate(`${d.from}T00:00:00Z`)} – ` : 'As of '}${formatDate(`${d.date}T00:00:00Z`)} · ${pluralize(d.count, 'item')}`
    case 'report.transactions_export': {
      const day = (value) => formatDate(`${value}T00:00:00Z`)
      const period = d.from === d.to ? day(d.from) : `${day(d.from)} – ${day(d.to)}`
      return `${period} · ${pluralize(d.count, 'item')}`
    }
    case 'report.stockcard_export': {
      const day = (value) => formatDate(`${value}T00:00:00Z`)
      const period = d.from === d.to ? day(d.from) : `${day(d.from)} – ${day(d.to)}`
      return `${period} · ${pluralize(d.count, 'item')} · ${pluralize(d.transactions, 'transaction')}`
    }
    case 'report.reconcile_export': {
      const day = (value) => formatDate(`${value}T00:00:00Z`)
      let period = 'all transactions'
      if (d.from && d.to) period = d.from === d.to ? day(d.from) : `${day(d.from)} – ${day(d.to)}`
      else if (d.from) period = `from ${day(d.from)}`
      else if (d.to) period = `up to ${day(d.to)}`
      return [d.itemId, d.code, period, pluralize(d.count, 'transaction')].filter(Boolean).join(' · ')
    }
    case 'item.batch_archive':
    case 'item.batch_restore':
      return `${pluralize(d.count, 'item')}${d.all ? ' · all matching' : ''}`
    case 'user.update': {
      const { costCenter, permissions, isActive } = entry.changes ?? {}
      const added = permissions?.to.filter((p) => !permissions.from.includes(p)) ?? []
      const removed = permissions?.from.filter((p) => !permissions.to.includes(p)) ?? []
      return [
        costCenter && `Cost center: ${costCenterLabel(costCenter.from) || '(not set)'} → ${costCenterLabel(costCenter.to)}`,
        added.length && `Allowed: ${added.map(permissionShortLabel).join(', ')}`,
        removed.length && `Removed: ${removed.map(permissionShortLabel).join(', ')}`,
        isActive && (isActive.to ? 'Enabled account' : 'Disabled account'),
      ]
        .filter(Boolean)
        .join(' · ')
    }
    case 'user.create':
      return [
        `Role: ${d.role}`,
        d.costCenter && `Cost center: ${costCenterLabel(d.costCenter)}`,
        d.permissions?.length && `Permissions: ${d.permissions.map(permissionShortLabel).join(', ')}`,
      ]
        .filter(Boolean)
        .join(' · ')
    default:
      return entry.ip ? <span className="items-muted">from {entry.ip.replace(/^::ffff:/, '')}</span> : null
  }
}
