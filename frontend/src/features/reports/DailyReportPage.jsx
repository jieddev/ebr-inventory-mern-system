import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Logo from '../../components/ui/Logo'
import PickDateDialog from '../../components/ui/PickDateDialog'
import { getErrorMessage } from '../../api/auth'
import { exportDailyReport, getDailyReport } from '../../api/reports'
import { formatDate, formatNumber, todayInputValue } from '../../utils/format'
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

// Daily Report (design screen 06): every item's ending balance at the end of the chosen day,
// from /reports/daily?date=YYYY-MM-DD. Pages on screen; Print prints every item.
export default function DailyReportPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const date = searchParams.get('date') || todayInputValue()
  const [page, setPage] = useState({ date, number: 1 })
  // The last finished request; it's loading while that isn't the current request.
  const [response, setResponse] = useState({ key: null, data: null, error: '' })
  const [isPickingDate, setIsPickingDate] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  const requestKey = `${date}|${reloadKey}`
  useEffect(() => {
    const controller = new AbortController()
    getDailyReport(date, { signal: controller.signal })
      .then((data) => setResponse({ key: requestKey, data, error: '' }))
      .catch((err) => {
        if (controller.signal.aborted) return
        setResponse({ key: requestKey, data: null, error: getErrorMessage(err, 'Could not generate the report.') })
      })
    return () => controller.abort()
  }, [date, requestKey])

  async function handleExport() {
    setIsExporting(true)
    setExportError('')
    try {
      await exportDailyReport(date)
    } catch (err) {
      setExportError(getErrorMessage(err, 'Could not export the report.'))
    } finally {
      setIsExporting(false)
    }
  }

  const { data } = response
  const isLoading = response.key !== requestKey
  const rows = data?.rows ?? []
  // A new date starts on page 1.
  const pageNumber = page.date === date ? page.number : 1
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const first = rows.length ? (pageNumber - 1) * PAGE_SIZE : 0
  const last = Math.min(first + PAGE_SIZE, rows.length)
  const asOfText = longDate.format(new Date(`${date}T00:00:00Z`))

  return (
    <div className="workspace">
      <section className="workspace-content report-page">
        <div className="report-toolbar no-print">
          <Link to="/transactions" className="report-back">
            <img src={arrowLeftIcon} alt="" width="16" height="16" />
            Back to transactions
          </Link>
          <div className="page-actions">
            <Button variant="secondary" onClick={() => setIsPickingDate(true)}>
              <img src={calendarIcon} alt="" />
              Change date
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
              <p className="report-eyebrow">EBR Inventory System · Servitek</p>
              <h1>Daily Report</h1>
              <p className="report-as-of">As of {asOfText}</p>
            </div>
            <Logo size="sm" />
          </header>

          <dl className="report-meta">
            <div>
              <dt>Report date</dt>
              <dd>{formatDate(`${date}T00:00:00Z`)}</dd>
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
                  <th>Item code</th>
                  <th>Brand name</th>
                  <th>Type / Design</th>
                  <th className="is-number">Ending balance</th>
                  <th className="is-number">Last transaction date</th>
                </tr>
              </thead>
              <tbody>
                {/* Every row is rendered so Print gets the whole report; the screen shows one page. */}
                {rows.map((row, index) => (
                  <tr key={row._id} className={index >= first && index < last ? '' : 'screen-hidden'}>
                    <td className="report-code">{row.code}</td>
                    <td>{row.brand || '—'}</td>
                    <td>{row.typeDesign || '—'}</td>
                    <td className={`is-number report-balance ${row.endingBalance < 0 ? 'is-negative' : ''}`}>
                      {formatNumber(row.endingBalance)}
                    </td>
                    <td className="is-number report-muted">{formatDate(row.lastTransactionDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data && isLoading && <p className="report-empty">Generating the report…</p>}
            {data && rows.length === 0 && <p className="report-empty">No items yet.</p>}
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
                  onClick={() => setPage({ date, number: pageNumber - 1 })}
                >
                  Previous
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pageNumber >= totalPages}
                  onClick={() => setPage({ date, number: pageNumber + 1 })}
                >
                  Next
                </Button>
              </div>
            </footer>
          )}

          <p className="report-note">
            Ending balance is each item's stock on hand at the end of {asOfText}.
            {data?.negativeCount > 0 && ` ${formatNumber(data.negativeCount)} negative balances are shown in red so they can be checked.`}
            {data?.negativeCount === 0 && ' Negative balances are shown in red so they can be checked.'}
          </p>
        </article>
      </section>

      {isPickingDate && (
        <PickDateDialog
          title="Generate Daily Report"
          subtitle="Show ending balances as of which date?"
          initialDate={date}
          onCancel={() => setIsPickingDate(false)}
          onConfirm={(next) => {
            setIsPickingDate(false)
            setSearchParams({ date: next })
          }}
        />
      )}
    </div>
  )
}
