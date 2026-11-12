import { useEffect, useId, useState } from 'react'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Logo from '../../components/ui/Logo'
import { getErrorMessage } from '../../api/auth'
import { exportReconcile, getReconcile } from '../../api/reports'
import { formatDate, formatNumber, pluralize } from '../../utils/format'
import { costCenterLabel } from '../../utils/costCenters'
import { useCostCenter } from '../costCenter/useCostCenter'
import ItemCodePicker from '../add-transaction/ItemCodePicker'
import downloadIcon from '../../assets/icons/download.svg'
import printIcon from '../../assets/icons/print.svg'
import '../../components/ui/TextField.css'
import '../transactions/TransactionsPage.css'
import '../reports/DailyReportPage.css'
import './ReconcilePage.css'

const dateTime = new Intl.DateTimeFormat('en-US', {
  month: '2-digit',
  day: '2-digit',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})
const day = (value) => formatDate(`${value}T00:00:00Z`)

// "All transactions", "10/01/2026 – 10/26/2026", "From 10/01/2026" or "Up to 10/26/2026".
function periodText(from, to) {
  if (from && to) return from === to ? day(from) : `${day(from)} – ${day(to)}`
  if (from) return `From ${day(from)}`
  if (to) return `Up to ${day(to)}`
  return 'All transactions'
}

// Reconcile (temporary name): search one item and list every transaction on it, oldest first,
// with the running balance; optionally only those in a date range. Export Excel downloads the same list.
export default function ReconcilePage() {
  const id = useId()
  const { costCenter } = useCostCenter()
  const [codeText, setCodeText] = useState('')
  const [item, setItem] = useState(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  // The last finished request; it's loading while that isn't the current request.
  const [response, setResponse] = useState({ key: null, data: null, error: '' })
  const [reloadKey, setReloadKey] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  const isBackwards = Boolean(from && to && from > to)
  const requestKey = item && !isBackwards ? `${costCenter}|${item._id}|${from}|${to}|${reloadKey}` : null
  useEffect(() => {
    if (!requestKey) return
    const controller = new AbortController()
    getReconcile(item._id, { from, to }, { signal: controller.signal })
      .then((data) => setResponse({ key: requestKey, data, error: '' }))
      .catch((err) => {
        if (controller.signal.aborted) return
        setResponse({ key: requestKey, data: null, error: getErrorMessage(err, 'Could not load the transactions.') })
      })
    return () => controller.abort()
  }, [item, from, to, requestKey])

  // Another cost center has other items, so start over.
  const [shownCostCenter, setShownCostCenter] = useState(costCenter)
  if (shownCostCenter !== costCenter) {
    setShownCostCenter(costCenter)
    setItem(null)
    setCodeText('')
  }

  function handleCodeChange(text) {
    setCodeText(text)
    setItem(null)
    setExportError('')
  }

  function handleSelect(picked) {
    setItem(picked)
    setCodeText(picked.code)
    setExportError('')
  }

  async function handleExport() {
    setIsExporting(true)
    setExportError('')
    try {
      await exportReconcile(item._id, { from, to })
    } catch (err) {
      setExportError(getErrorMessage(err, 'Could not export the transactions.'))
    } finally {
      setIsExporting(false)
    }
  }

  const isCurrent = requestKey && response.key === requestKey
  const data = isCurrent ? response.data : null
  const isLoading = Boolean(requestKey) && !isCurrent
  const transactions = data?.transactions ?? []
  const totals = transactions.reduce(
    (sum, t) => ({ ...sum, [t.type]: sum[t.type] + t.quantity }),
    { IN: 0, OUT: 0, RESERVE: 0 },
  )
  const forText = periodText(from, to)

  return (
    <div className="workspace">
      <section className="workspace-content report-page">
        <header className="page-header reconcile-header no-print">
          <h1>Reconcile</h1>
          <div className="page-actions">
            <Button variant="secondary" onClick={handleExport} disabled={!data} isLoading={isExporting}>
              {!isExporting && <img src={downloadIcon} alt="" />}
              Export Excel
            </Button>
            <Button onClick={() => window.print()} disabled={!data}>
              <img src={printIcon} alt="" />
              Print
            </Button>
          </div>
        </header>

        <div className="reconcile-controls no-print">
          <div className="reconcile-item">
            <ItemCodePicker
              label="Item"
              placeholder="Search by item description or item ID"
              value={codeText}
              onChange={handleCodeChange}
              selected={item}
              onSelect={handleSelect}
              required={false}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`${id}-from`}>
              From
            </label>
            <input
              id={`${id}-from`}
              type="date"
              className="field-input"
              value={from}
              max={to || undefined}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`${id}-to`}>
              To
            </label>
            <input
              id={`${id}-to`}
              type="date"
              className="field-input"
              value={to}
              min={from || undefined}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              setFrom('')
              setTo('')
            }}
            disabled={!from && !to}
          >
            All dates
          </Button>
        </div>

        {isBackwards && (
          <div className="page-error no-print" role="alert">
            The From date must be on or before the To date.
          </div>
        )}

        {response.error && isCurrent && (
          <div className="page-error no-print" role="alert">
            {response.error}
            <Button variant="secondary" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
              Try again
            </Button>
          </div>
        )}

        {exportError && (
          <div className="page-error no-print" role="alert">
            {exportError}
          </div>
        )}

        {!item ? (
          <p className="reconcile-empty">Search for an item to see its transactions.</p>
        ) : (
          <article className={`report-card reconcile-card ${isLoading ? 'is-loading' : ''}`} aria-busy={isLoading}>
            <header className="report-header">
              <div>
                <p className="report-eyebrow">EBR Inventory System · {costCenterLabel(costCenter)}</p>
                <h1>Reconcile Report</h1>
                <p className="report-as-of">{forText}</p>
              </div>
              <Logo size="sm" />
            </header>

            <dl className="report-meta">
              <div>
                <dt>Item</dt>
                <dd>
                  {item.itemId ? `${item.itemId} · ` : ''}
                  {item.code}
                </dd>
              </div>
              <div>
                <dt>Brand · Type</dt>
                <dd>{[item.brand, item.typeDesign].filter(Boolean).join(' · ') || '—'}</dd>
              </div>
              <div>
                <dt>Generated</dt>
                <dd>{data ? dateTime.format(new Date(data.generatedAt)) : '—'}</dd>
              </div>
              <div>
                <dt>Prepared by</dt>
                <dd>{data?.preparedBy ?? '—'}</dd>
              </div>
            </dl>

            <div className="report-table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th className="is-number">Qty</th>
                    <th>Customer</th>
                    <th>Notes</th>
                    <th>Recorded by</th>
                    <th className="is-number">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <tr key={t._id}>
                      <td>{formatDate(t.date)}</td>
                      <td>
                        <span className="reconcile-type">
                          <Badge kind={t.type} />
                          {t.isBalanceForwarded && <span className="report-muted">Balance forwarded</span>}
                        </span>
                      </td>
                      <td className="is-number">{formatNumber(t.quantity)}</td>
                      <td>{t.customerName || '—'}</td>
                      <td className="reconcile-notes">{t.notes || '—'}</td>
                      <td>{t.createdBy?.name ?? '—'}</td>
                      <td className={`is-number report-balance ${t.endingBalance < 0 ? 'is-negative' : ''}`}>
                        {formatNumber(t.endingBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data && isLoading && <p className="report-empty">Loading transactions…</p>}
              {data && transactions.length === 0 && (
                <p className="report-empty">
                  No transactions {from || to ? 'in this period' : 'on this item yet'}.
                </p>
              )}
            </div>

            {data && transactions.length > 0 && (
              <footer className="report-footer">
                <span>{pluralize(transactions.length, 'transaction')}</span>
                <span>
                  IN {formatNumber(totals.IN)} · OUT {formatNumber(totals.OUT)}
                  {totals.RESERVE > 0 && ` · RESERVE ${formatNumber(totals.RESERVE)}`}
                </span>
              </footer>
            )}
          </article>
        )}
      </section>
    </div>
  )
}
