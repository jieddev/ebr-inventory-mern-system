import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Logo from '../../components/ui/Logo'
import PickDateRangeDialog from '../../components/ui/PickDateRangeDialog'
import { getErrorMessage } from '../../api/auth'
import { exportTransactionReport, getTransactionReport } from '../../api/reports'
import { formatNumber, todayInputValue } from '../../utils/format'
import { costCenterLabel } from '../../utils/costCenters'
import { useCostCenter } from '../costCenter/useCostCenter'
import arrowLeftIcon from '../../assets/icons/arrow-left.svg'
import calendarIcon from '../../assets/icons/calendar.svg'
import downloadIcon from '../../assets/icons/download.svg'
import printIcon from '../../assets/icons/print.svg'
import '../transactions/TransactionsPage.css'
import './DailyReportPage.css'

const PAGE_SIZE = 25

const longDate = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const dateTime = new Intl.DateTimeFormat('en-US', {
  month: '2-digit',
  day: '2-digit',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})
const toDate = (day) => new Date(`${day}T00:00:00Z`)

// "October 26, 2026", or "October 1 – October 26, 2026" for a range.
function periodText(from, to) {
  return from === to ? longDate.format(toDate(to)) : longDate.formatRange(toDate(from), toDate(to))
}

// Transaction Report (design screen 08): the items that had IN, OUT or physical count entries in the chosen day or
// range, with their totals and ending balance, from /reports/transactions?from=&to=.
// Pages on screen; Print prints every item.
export default function TransactionReportPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { costCenter } = useCostCenter()
  const from = searchParams.get('from') || searchParams.get('to') || todayInputValue()
  const to = searchParams.get('to') || from
  const period = `${from}|${to}`
  const [page, setPage] = useState({ period, number: 1 })
  // The last finished request; it's loading while that isn't the current request.
  const [response, setResponse] = useState({ key: null, data: null, error: '' })
  const [isPickingDates, setIsPickingDates] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  const requestKey = `${period}|${reloadKey}`
  useEffect(() => {
    const controller = new AbortController()
    getTransactionReport({ from, to }, { signal: controller.signal })
      .then((data) => setResponse({ key: requestKey, data, error: '' }))
      .catch((err) => {
        if (controller.signal.aborted) return
        setResponse({ key: requestKey, data: null, error: getErrorMessage(err, 'Could not generate the report.') })
      })
    return () => controller.abort()
  }, [from, to, requestKey])

  async function handleExport() {
    setIsExporting(true)
    setExportError('')
    try {
      await exportTransactionReport({ from, to })
    } catch (err) {
      setExportError(getErrorMessage(err, 'Could not export the report.'))
    } finally {
      setIsExporting(false)
    }
  }

  const { data } = response
  const isLoading = response.key !== requestKey
  const rows = data?.rows ?? []
  const hasAdjust = rows.some((row) => row.adjust)
  const signed = (n) => (n > 0 ? `+${formatNumber(n)}` : n < 0 ? `−${formatNumber(-n)}` : '0')
  // A new period starts on page 1.
  const pageNumber = page.period === period ? page.number : 1
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const first = rows.length ? (pageNumber - 1) * PAGE_SIZE : 0
  const last = Math.min(first + PAGE_SIZE, rows.length)
  const isSingleDay = from === to
  const forText = periodText(from, to)

  return (
    <div className="workspace">
      <section className="workspace-content report-page">
        <div className="report-toolbar no-print">
          <Link to="/reports" className="report-back">
            <img src={arrowLeftIcon} alt="" width="16" height="16" />
            Back to reports
          </Link>
          <div className="page-actions">
            <Button variant="secondary" onClick={() => setIsPickingDates(true)}>
              <img src={calendarIcon} alt="" />
              Change dates
            </Button>
            <Button variant="secondary" onClick={handleExport} disabled={!data || isLoading} isLoading={isExporting}>
              {!isExporting && <img src={downloadIcon} alt="" />}
              Export Excel
            </Button>
            <Button onClick={() => window.print()} disabled={!data || isLoading}>
              <img src={printIcon} alt="" />
              Print
            </Button>
          </div>
        </div>

        {response.error && !isLoading && (
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

        <article className={`report-card ${isLoading && data ? 'is-loading' : ''}`} aria-busy={isLoading}>
          <header className="report-header">
            <div>
              <p className="report-eyebrow">EBR Inventory System · {costCenterLabel(costCenter)}</p>
              <h1>Transaction Report</h1>
              <p className="report-as-of">For {forText}</p>
            </div>
            <Logo size="sm" />
          </header>

          <dl className="report-meta">
            <div>
              <dt>{isSingleDay ? 'Report date' : 'Period'}</dt>
              <dd>{forText}</dd>
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
              {/* Physical count adjustments (Adjust to Count) get a column only when there are any. */}
              <thead>
                <tr>
                  <th>Item description</th>
                  <th>Brand name</th>
                  <th>Type / design</th>
                  <th className="is-number">In</th>
                  <th className="is-number">Out</th>
                  {hasAdjust && <th className="is-number">Count adj.</th>}
                  <th className="is-number">Ending balance</th>
                </tr>
              </thead>
              <tbody>
                {/* Every row is rendered so Print gets the whole report; the screen shows one page. */}
                {rows.map((row, index) => (
                  <tr key={row._id} className={index >= first && index < last ? '' : 'screen-hidden'}>
                    <td className="report-code">{row.code}</td>
                    <td>{row.brand || '—'}</td>
                    <td>{row.typeDesign || '—'}</td>
                    <td className="is-number">{formatNumber(row.in)}</td>
                    <td className="is-number">{formatNumber(row.out)}</td>
                    {hasAdjust && <td className="is-number">{row.adjust ? signed(row.adjust) : '—'}</td>}
                    <td className={`is-number report-balance ${row.endingBalance < 0 ? 'is-negative' : ''}`}>
                      {formatNumber(row.endingBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={3}>Total</td>
                    <td className="is-number">{formatNumber(data.totals.in)}</td>
                    <td className="is-number">{formatNumber(data.totals.out)}</td>
                    {hasAdjust && <td className="is-number">{signed(data.totals.adjust ?? 0)}</td>}
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
            {!data && isLoading && <p className="report-empty">Generating the report…</p>}
            {data && rows.length === 0 && (
              <p className="report-empty">No IN, OUT or count transactions {isSingleDay ? 'on this day' : 'in this period'}.</p>
            )}
          </div>

          {data && rows.length > 0 && (
            <footer className="report-footer">
              <span className="no-print">
                Showing {formatNumber(first + 1)}–{formatNumber(last)} of {formatNumber(rows.length)} items
              </span>
              <span className="print-only">{formatNumber(rows.length)} items</span>
              <div className="table-pager no-print">
                <span className="table-page-count">
                  Page {formatNumber(pageNumber)} of {formatNumber(totalPages)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pageNumber <= 1}
                  onClick={() => setPage({ period, number: pageNumber - 1 })}
                >
                  Previous
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pageNumber >= totalPages}
                  onClick={() => setPage({ period, number: pageNumber + 1 })}
                >
                  Next
                </Button>
              </div>
            </footer>
          )}

        </article>
      </section>

      {isPickingDates && (
        <PickDateRangeDialog
          title="Generate Transaction Report"
          initialFrom={from}
          initialTo={to}
          onCancel={() => setIsPickingDates(false)}
          onConfirm={(next) => {
            setIsPickingDates(false)
            setSearchParams(next)
          }}
        />
      )}
    </div>
  )
}
