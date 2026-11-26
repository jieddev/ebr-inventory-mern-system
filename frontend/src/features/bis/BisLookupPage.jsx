import { useEffect, useId, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import { getErrorMessage } from '../../api/auth'
import { getBis, getBrr } from '../../api/transactions'
import { formatDate, formatNumber, pluralize } from '../../utils/format'
import { costCenterLabel } from '../../utils/costCenters'
import { useCostCenter } from '../costCenter/useCostCenter'
import searchIcon from '../../assets/icons/search.svg'
import '../../components/ui/TextField.css'
import '../transactions/TransactionsPage.css'
import '../reports/DailyReportPage.css'
import './BisLookupPage.css'

const description = (item) => [item.code, item.brand, item.typeDesign].filter(Boolean).join(' · ')

// What differs between a BIS and a BRR search.
const LOOKUPS = {
  bis: {
    label: 'BIS',
    fetch: getBis,
    placeholder: 'e.g. 92479',
    title: (n) => `BIS# ${n}`,
  },
  brr: {
    label: 'BRR',
    fetch: getBrr,
    placeholder: 'e.g. 46954',
    title: (n) => `BRR No. ${n}`,
  },
}
const TYPES = Object.keys(LOOKUPS)

// BIS / BRR lookup: type a BIS or BRR number and list the items in the cost center whose transactions
// are on it. The BIS number is typed into the transaction's Customer name ("BIS# 92479 - No. 46954"),
// so the API matches it there (transactions.controller.js listBis). The BRR number is the Ref. No. of
// a saved Bodega Receiving Report slip (listBrr). ?type=brr&number= keeps the search in the URL;
// without ?type= it's a BIS search.
export default function BisLookupPage() {
  const id = useId()
  const { costCenter } = useCostCenter()
  const [searchParams, setSearchParams] = useSearchParams()
  const number = searchParams.get('number') ?? ''
  const type = searchParams.get('type') === 'brr' ? 'brr' : 'bis'
  const lookup = LOOKUPS[type]
  const [text, setText] = useState(number)
  const inputRef = useRef(null)
  const tabRefs = useRef({})
  // The selected tab; it's the URL's type until the user switches before searching.
  const [pickedType, setPickedType] = useState(type)
  // The last finished request; it's loading while that isn't the current request.
  const [response, setResponse] = useState({ key: null, data: null, error: '' })
  const [reloadKey, setReloadKey] = useState(0)

  const requestKey = number ? `${costCenter}|${type}|${number}|${reloadKey}` : null
  useEffect(() => {
    if (!requestKey) return
    const controller = new AbortController()
    LOOKUPS[type].fetch(number, { signal: controller.signal })
      .then((data) => setResponse({ key: requestKey, data, error: '' }))
      .catch((err) => {
        if (controller.signal.aborted) return
        setResponse({ key: requestKey, data: null, error: getErrorMessage(err, `Could not search that ${LOOKUPS[type].label} number.`) })
      })
    return () => controller.abort()
  }, [number, type, requestKey])

  // Back/forward in the browser changes ?type= and ?number=; keep the tabs and the box in step.
  const [shown, setShown] = useState({ type, number })
  if (shown.type !== type || shown.number !== number) {
    setShown({ type, number })
    setPickedType(type)
    setText(number)
  }

  // BIS links without ?type= keep working: BIS is the default.
  const search = (nextType, nextNumber) =>
    setSearchParams(nextNumber ? { ...(nextType === 'brr' && { type: nextType }), number: nextNumber } : {})

  // Switching keeps the typed number; with a search already shown, it searches the other kind.
  function handleTypeChange(nextType) {
    setPickedType(nextType)
    if (number) search(nextType, text.trim() || number)
  }

  // Left/Right move between the tabs (the usual tabs keyboard pattern); a click goes on to the box.
  function handleTabKeyDown(event) {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key]
    if (!step) return
    event.preventDefault()
    const next = TYPES[(TYPES.indexOf(pickedType) + step + TYPES.length) % TYPES.length]
    handleTypeChange(next)
    tabRefs.current[next]?.focus()
  }

  function handleSubmit(event) {
    event.preventDefault()
    const next = text.trim()
    if (next === number && pickedType === type) setReloadKey((k) => k + 1)
    else search(pickedType, next)
  }

  const isCurrent = requestKey && response.key === requestKey
  const data = isCurrent ? response.data : null
  const isLoading = Boolean(requestKey) && !isCurrent
  const items = data?.items ?? []
  const bisText = lookup.title(data?.number ?? number)
  const picked = LOOKUPS[pickedType]
  const warehouse = costCenterLabel(costCenter)

  return (
    <div className="workspace">
      <section className="workspace-content report-page">
        <header className="page-header bis-header">
          <h1>BIS / BRR lookup</h1>
        </header>

        <div className="bis-search">
          <div className="bis-tabs" role="tablist" aria-label="Search by" onKeyDown={handleTabKeyDown}>
            {TYPES.map((value) => {
              const isSelected = value === pickedType
              return (
                <button
                  key={value}
                  ref={(node) => {
                    tabRefs.current[value] = node
                  }}
                  id={`${id}-tab-${value}`}
                  type="button"
                  role="tab"
                  className={`bis-tab ${isSelected ? 'is-selected' : ''}`}
                  aria-selected={isSelected}
                  aria-controls={`${id}-panel`}
                  tabIndex={isSelected ? 0 : -1}
                  onClick={() => {
                    handleTypeChange(value)
                    inputRef.current?.focus()
                  }}
                >
                  {LOOKUPS[value].label} number
                </button>
              )
            })}
          </div>

          <form
            id={`${id}-panel`}
            className="bis-controls"
            onSubmit={handleSubmit}
            role="search"
            aria-labelledby={`${id}-tab-${pickedType}`}
          >
            <div className="bis-row">
              <div className="field bis-field">
                <label className="visually-hidden" htmlFor={`${id}-number`}>
                  {picked.label} number
                </label>
                <input
                  ref={inputRef}
                  id={`${id}-number`}
                  type="search"
                  inputMode="numeric"
                  autoComplete="off"
                  className="field-input"
                  placeholder={picked.placeholder}
                  aria-describedby={`${id}-hint`}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />
              </div>
              <Button type="submit" disabled={!text.trim()}>
                <img src={searchIcon} alt="" />
                Search
              </Button>
            </div>
          </form>
        </div>

        {response.error && isCurrent && (
          <div className="page-error" role="alert">
            {response.error}
            <Button variant="secondary" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
              Try again
            </Button>
          </div>
        )}

        {!number ? (
          <p className="bis-empty">Type a {picked.label} number to see the items on it.</p>
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
