import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Button from '../../components/ui/Button'
import ActiveFilters from '../../components/filters/ActiveFilters'
import FilterDropdown from '../../components/filters/FilterDropdown'
import { getErrorMessage } from '../../api/auth'
import { exportItems, getItems, importItems } from '../../api/items'
import { useLiveUpdates } from '../../hooks/useLiveUpdates'
import { formatDate, formatNumber, pluralize } from '../../utils/format'
import { EMPTY_FILTERS, countActiveFilters, readFilters } from '../../utils/filters'
import searchIcon from '../../assets/icons/search.svg'
import uploadIcon from '../../assets/icons/upload.svg'
import downloadIcon from '../../assets/icons/download.svg'
import checkIcon from '../../assets/icons/check-circle.svg'
import closeIcon from '../../assets/icons/close.svg'
import '../transactions/TransactionsPage.css'
import './ItemsPage.css'

const PAGE_SIZE = 25
const SEARCH_DELAY_MS = 300

// Admin only: every unique item with its item ID, plus Excel import and export.
export default function ItemsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('search') ?? ''
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  // The Items page only uses the item filters (stock, category, type / design, brand).
  const filters = useMemo(() => {
    const { stock, category, typeDesign, brand } = readFilters(searchParams)
    return { ...EMPTY_FILTERS, stock, category, typeDesign, brand }
  }, [searchParams])

  const [searchText, setSearchText] = useState(search)
  const [reloadKey, setReloadKey] = useState(0)
  // The last finished request. It's loading while that isn't the current request.
  const [response, setResponse] = useState({ key: null, data: null, error: '' })
  const [error, setError] = useState('')

  const fileInputRef = useRef(null)
  const [isImporting, setIsImporting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [importResult, setImportResult] = useState(null)

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
    getItems({ search, page, limit: PAGE_SIZE, filters }, { signal: controller.signal })
      .then((data) => setResponse({ key: requestKey, data, error: '' }))
      .catch((err) => {
        if (controller.signal.aborted) return
        const message = getErrorMessage(err, 'Could not load items.')
        setResponse((prev) => ({ key: requestKey, data: prev.data, error: message }))
      })
    return () => controller.abort()
  }, [search, page, filters, requestKey])

  const { data } = response
  const isLoading = response.key !== requestKey
  const shownError = response.error || error

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])
  useLiveUpdates(reload)

  async function handleFileChosen(event) {
    const file = event.target.files?.[0]
    event.target.value = '' // so choosing the same file again still triggers a change
    if (!file) return

    setIsImporting(true)
    setImportResult(null)
    setError('')
    try {
      setImportResult({ fileName: file.name, ...(await importItems(file)) })
      reload()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not import the file.'))
    } finally {
      setIsImporting(false)
    }
  }

  async function handleExport() {
    setIsExporting(true)
    setError('')
    try {
      await exportItems()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not export the items.'))
    } finally {
      setIsExporting(false)
    }
  }

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1
  const first = total ? (page - 1) * PAGE_SIZE + 1 : 0
  const last = Math.min(page * PAGE_SIZE, total)
  const isFiltered = Boolean(search || countActiveFilters(filters))

  function applyFilters(next) {
    updateParams({ ...next, page: null })
  }

  return (
    <div className="workspace">
      <section className="workspace-content">
        <header className="page-header">
          <h1>All Items</h1>
          <div className="page-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xlsm"
              hidden
              onChange={handleFileChosen}
            />
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()} isLoading={isImporting}>
              {!isImporting && <img src={uploadIcon} alt="" />}
              {isImporting ? 'Importing…' : 'Import Excel'}
            </Button>
            <Button variant="secondary" onClick={handleExport} isLoading={isExporting}>
              {!isExporting && <img src={downloadIcon} alt="" />}
              Export Excel
            </Button>
          </div>
        </header>

        {importResult && <ImportResult result={importResult} onDismiss={() => setImportResult(null)} />}

        <div className="toolbar">
          <div className="toolbar-search">

            <FilterDropdown filters={filters} onApply={applyFilters} />

            <label className="search-input">
              <img src={searchIcon} alt="" width="18" height="18" />
              <input
                type="search"
                placeholder="Search by item ID, code, brand or type"
                aria-label="Search items"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </label>

          </div>
        </div>

        <ActiveFilters
          filters={filters}
          onChange={applyFilters}
          onClearAll={() => applyFilters(EMPTY_FILTERS)}
          summary={data && <><strong>{pluralize(total, 'item')}</strong> match</>}
        />

        {shownError && (
          <div className="page-error" role="alert">
            {shownError}
            <Button variant="secondary" size="sm" onClick={reload}>
              Try again
            </Button>
          </div>
        )}

        <div className={`table-card ${isLoading && data ? 'is-loading' : ''}`} aria-busy={isLoading}>
          {items.length > 0 && (
            <div className="items-table-scroll">
              <table className="items-table">
                <thead>
                  <tr>
                    <th>Item ID</th>
                    <th>Category</th>
                    <th>Item code</th>
                    <th>Brand name</th>
                    <th>Type / Design</th>
                    <th className="is-number">Balance</th>
                    <th>Last transaction</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item._id}>
                      <td className="items-id">{item.itemId}</td>
                      <td className="items-muted">{item.category || '—'}</td>
                      <td className="items-code">{item.code}</td>
                      <td>{item.brand || '—'}</td>
                      <td className="items-muted">{item.typeDesign || '—'}</td>
                      <td className={`is-number ${item.balance < 0 ? 'is-negative' : ''}`}>
                        {formatNumber(item.balance)}
                      </td>
                      <td className="items-muted">{formatDate(item.lastTransactionDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data && items.length === 0 && (
            <div className="table-empty">
              {isFiltered ? (
                <>
                  <p>No items match these filters.</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSearchText('')
                      updateParams({ ...EMPTY_FILTERS, search: null, page: null })
                    }}
                  >
                    Clear filters
                  </Button>
                </>
              ) : (
                <p>No items yet. Import a Summary Report Excel file or add items from the Transactions page.</p>
              )}
            </div>
          )}

          {!data && isLoading && <div className="table-empty">Loading items…</div>}

          {data && total > 0 && (
            <footer className="table-footer">
              <span>
                Showing {formatNumber(first)}–{formatNumber(last)} of {pluralize(total, 'item')}
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

// What an import did: how many items were added and which rows were skipped and why.
function ImportResult({ result, onDismiss }) {
  const { fileName, added, asOf, skippedExisting, skippedDuplicates, invalid } = result
  const problems = [
    ...invalid,
    ...skippedDuplicates.map((row) => ({ ...row, reason: `Same item as row ${row.sameAsRow}` })),
  ].sort((a, b) => a.row - b.row)

  return (
    <section className="import-result" role="status">
      <header className="import-result-header">
        <img src={checkIcon} alt="" width="20" height="20" />
        <div>
          <p className="import-result-title">
            Imported {pluralize(added, 'new item')} from {fileName}
          </p>
          <p className="import-result-meta">
            Opening balances dated {formatDate(asOf)}
            {skippedExisting.length > 0 && ` · ${pluralize(skippedExisting.length, 'item')} already existed and were left unchanged`}
          </p>
        </div>
        <button type="button" className="import-result-close" onClick={onDismiss} aria-label="Dismiss import result">
          <img src={closeIcon} alt="" width="20" height="20" />
        </button>
      </header>

      {problems.length > 0 && (
        <div className="import-result-problems">
          <p>
            {pluralize(problems.length, 'row')} skipped. Fix {problems.length === 1 ? 'it' : 'them'} in Excel and import
            the file again; items already added will be skipped.
          </p>
          <ul>
            {problems.map((row) => (
              <li key={row.row}>
                <span className="import-result-row">Row {row.row}</span>
                <span className="import-result-item">
                  {[row.code, row.brand, row.typeDesign].filter(Boolean).join(' · ') || '(empty)'}
                </span>
                <span className="import-result-reason">{row.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
