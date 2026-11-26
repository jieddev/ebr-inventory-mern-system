import { useEffect, useId, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import { getErrorMessage } from '../../api/auth'
import { getBis } from '../../api/transactions'
import { formatDate, formatNumber, pluralize } from '../../utils/format'
import { costCenterLabel } from '../../utils/costCenters'
import { useCostCenter } from '../costCenter/useCostCenter'
import searchIcon from '../../assets/icons/search.svg'
import '../../components/ui/TextField.css'
import '../transactions/TransactionsPage.css'
import '../reports/DailyReportPage.css'
import './BisLookupPage.css'

const description = (item) => [item.code, item.brand, item.typeDesign].filter(Boolean).join(' · ')

// BIS lookup: type a BIS number and list the items in the cost center whose transactions are on it.
// The BIS number is typed into the transaction's Customer name ("BIS# 92479 - No. 46954"), so the
// API matches it there (transactions.controller.js listBis). ?number= keeps the search in the URL.
export default function BisLookupPage() {
  const id = useId()
  const { costCenter } = useCostCenter()
  const [searchParams, setSearchParams] = useSearchParams()
  const number = searchParams.get('number') ?? ''
  const [text, setText] = useState(number)
  // The last finished request; it's loading while that isn't the current request.
  const [response, setResponse] = useState({ key: null, data: null, error: '' })
  const [reloadKey, setReloadKey] = useState(0)

  const requestKey = number ? `${costCenter}|${number}|${reloadKey}` : null
  useEffect(() => {
    if (!requestKey) return
    const controller = new AbortController()
    getBis(number, { signal: controller.signal })
      .then((data) => setResponse({ key: requestKey, data, error: '' }))
      .catch((err) => {
        if (controller.signal.aborted) return
        setResponse({ key: requestKey, data: null, error: getErrorMessage(err, 'Could not search that BIS number.') })
      })
    return () => controller.abort()
  }, [number, requestKey])

  // Back/forward in the browser changes ?number=; keep the box in step.
  const [shownNumber, setShownNumber] = useState(number)
  if (shownNumber !== number) {
    setShownNumber(number)
    setText(number)
  }

  function handleSubmit(event) {
    event.preventDefault()
    const next = text.trim()
    if (next === number) setReloadKey((k) => k + 1)
    else setSearchParams(next ? { number: next } : {})
  }

  const isCurrent = requestKey && response.key === requestKey
  const data = isCurrent ? response.data : null
  const isLoading = Boolean(requestKey) && !isCurrent
  const items = data?.items ?? []
  const bisText = `BIS# ${data?.number ?? number}`
  const warehouse = costCenterLabel(costCenter)

  return (
    <div className="workspace">
      <section className="workspace-content report-page">
        <header className="page-header bis-header">
          <h1>BIS lookup</h1>
        </header>

        <form className="bis-controls" onSubmit={handleSubmit} role="search">
          <div className="field bis-field">
            <label className="field-label" htmlFor={`${id}-number`}>
              BIS number
            </label>
            <input
              id={`${id}-number`}
              type="search"
              inputMode="numeric"
              autoComplete="off"
              className="field-input"
              placeholder="e.g. 92479"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={!text.trim()}>
            <img src={searchIcon} alt="" />
            Search
          </Button>
        </form>

        {response.error && isCurrent && (
          <div className="page-error" role="alert">
            {response.error}
            <Button variant="secondary" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
              Try again
            </Button>
          </div>
        )}

        {!number ? (
          <p className="bis-empty">Type a BIS number to see the items on it.</p>
        ) : (
          !response.error && (
            <article className={`report-card bis-card ${isLoading ? 'is-loading' : ''}`} aria-busy={isLoading}>
              <header className="report-header">
                <div>
                  <p className="report-eyebrow">{warehouse}</p>
                  <h2 className="bis-title">{bisText}</h2>
                  {data && <p className="report-as-of">{pluralize(items.length, 'item')}</p>}
                </div>
              </header>

              <div className="report-table-wrap">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Item ID</th>
                      <th>Description</th>
                      <th>Date</th>
                      <th>Type</th>
                      <th className="is-number">Qty</th>
                      <th>Customer</th>
                    </tr>
                  </thead>
                  {items.map(({ item, totals, entries }) => (
                    <tbody key={item._id} className="bis-item">
                      {entries.map((entry, index) => (
                        <tr key={entry._id}>
                          {index === 0 && (
                            <>
                              <td rowSpan={entries.length} className="bis-item-id">
                                {item.itemId || '—'}
                              </td>
                              <td rowSpan={entries.length} className="bis-item-description">
                                <span>{description(item)}</span>
                                <span className="report-muted">
                                  IN {formatNumber(totals.IN)} · OUT {formatNumber(totals.OUT)}
                                  {totals.RESERVE > 0 && ` · RESERVE ${formatNumber(totals.RESERVE)}`}
                                  {' · '}Balance now {formatNumber(item.balance)}
                                </span>
                              </td>
                            </>
                          )}
                          <td>{formatDate(entry.date)}</td>
                          <td>
                            <Badge kind={entry.type} />
                          </td>
                          <td className="is-number">{formatNumber(entry.quantity)}</td>
                          <td>{entry.customerName}</td>
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </table>
                {!data && isLoading && <p className="report-empty">Searching…</p>}
                {data && items.length === 0 && (
                  <p className="report-empty">
                    No items found for {bisText} in {warehouse}.
                  </p>
                )}
              </div>
            </article>
          )
        )}
      </section>
    </div>
  )
}
