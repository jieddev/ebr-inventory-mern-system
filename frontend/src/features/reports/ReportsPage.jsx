import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/ui/Button'
import DateRangeFields from '../../components/ui/DateRangeFields'
import { useAuth } from '../auth/useAuth'
import { can } from '../../utils/permissions'
import { isValidRange, rangePeriod } from '../../utils/dateRange'
import { todayInputValue } from '../../utils/format'
import reportIcon from '../../assets/icons/report.svg'
import '../../components/ui/ConfirmDialog.css'
import '../../components/ui/TextField.css'
import '../transactions/TransactionsPage.css'
import './ReportsPage.css'

// Reports: one card per report the user may open, each with its dates and a Generate button.
// Open to users with any report permission (App.jsx); each card checks its own.
export default function ReportsPage() {
  const { user } = useAuth()

  return (
    <div className="workspace">
      <section className="workspace-content">
        <header className="page-header">
          <h1>Reports</h1>
        </header>
        <div className="reports-grid">
          {can(user, 'viewDailyReport') && <DailyReportCard />}
          {can(user, 'viewTransactionReport') && <TransactionReportCard />}
        </div>
      </section>
    </div>
  )
}

function ReportCard({ title, description, canGenerate, onGenerate, children }) {
  const titleId = useId()
  return (
    <form
      className="reports-card"
      aria-labelledby={titleId}
      onSubmit={(event) => {
        event.preventDefault()
        if (canGenerate) onGenerate()
      }}
    >
      <div className="reports-card-heading">
        <span className="reports-card-icon" aria-hidden="true">
          <img src={reportIcon} alt="" width="18" height="18" />
        </span>
        <div>
          <h2 id={titleId}>{title}</h2>
          <p className="reports-card-description">{description}</p>
        </div>
      </div>
      <div className="reports-card-fields">{children}</div>
      <footer>
        <Button type="submit" disabled={!canGenerate}>
          Generate
        </Button>
      </footer>
    </form>
  )
}

// A single day today, the starting value of both cards' period fields.
function todayRange() {
  const today = todayInputValue()
  return { mode: 'day', from: today, to: today }
}

// Single day keeps the ?date= link; a range opens ?from=&to=.
function dailyReportPath(range) {
  const { from, to } = rangePeriod(range)
  return `/reports/daily?${new URLSearchParams(from === to ? { date: to } : { from, to })}`
}

function DailyReportCard() {
  const navigate = useNavigate()
  const [range, setRange] = useState(todayRange)

  return (
    <ReportCard
      title="Daily Report"
      canGenerate={isValidRange(range)}
      onGenerate={() => navigate(dailyReportPath(range))}
    >
      <DateRangeFields {...range} onChange={setRange} />
    </ReportCard>
  )
}

function TransactionReportCard() {
  const navigate = useNavigate()
  const [range, setRange] = useState(todayRange)

  return (
    <ReportCard
      title="Transaction Report"
      canGenerate={isValidRange(range)}
      onGenerate={() => navigate(`/reports/transactions?${new URLSearchParams(rangePeriod(range))}`)}
    >
      <DateRangeFields {...range} onChange={setRange} />
    </ReportCard>
  )
}
