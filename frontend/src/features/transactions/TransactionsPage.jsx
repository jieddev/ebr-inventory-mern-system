import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Button from '../../components/ui/Button'
import ActiveFilters from '../../components/filters/ActiveFilters'
import FilterDropdown from '../../components/filters/FilterDropdown'
import { getErrorMessage } from '../../api/auth'
import { getItemTransactions } from '../../api/items'
import { getTransactions } from '../../api/transactions'
import { useLiveUpdates } from '../../hooks/useLiveUpdates'
import AddItemPanel from '../items/AddItemPanel'
import AddTransactionPanel from '../add-transaction/AddTransactionPanel'
import TransactionTable from './TransactionTable'
import { formatNumber, pluralize } from '../../utils/format'
import { EMPTY_FILTERS, countActiveFilters, readFilters } from '../../utils/filters'
import plusIcon from '../../assets/icons/plus.svg'
import searchIcon from '../../assets/icons/search.svg'
import reportIcon from '../../assets/icons/report.svg'
import './TransactionsPage.css'

const PAGE_SIZE = 10
const SEARCH_DELAY_MS = 300
// Saves from other PCs that land within this window cause a single re-fetch.
const LIVE_REFRESH_DELAY_MS = 300

export default function TransactionsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('search') ?? ''
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const filters = useMemo(() => readFilters(searchParams), [searchParams])
  const entryFilters = useMemo(() => ({ type: filters.type, from: filters.from, to: filters.to }), [filters])
  const activeFilterCount = countActiveFilters(filters)

  const [searchText, setSearchText] = useState(search)
  const [reloadKey, setReloadKey] = useState(0)
  // The last finished request. It's loading while that isn't the current request.
  const [response, setResponse] = useState({ key: null, data: null, error: '' })
  const [error, setError] = useState('')

  const [collapsed, setCollapsed] = useState(() => new Set())
  const [expandedEntries, setExpandedEntries] = useState(() => new Map())
  const [loadingAll, setLoadingAll] = useState(null)

  const [panel, setPanel] = useState(null) // 'item' | 'transaction' | null
  const [itemsAddedThisSession, setItemsAddedThisSession] = useState([])

  const updateParams = useCallback(
    (changes) => {
      // A new page or search shows different items, so drop their "View all" lists.
      setExpandedEntries(new Map())
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

  // Search, page and filters: everything in the URL.
  const view = searchParams.toString()
  const requestKey = `${view}|${reloadKey}`
  useEffect(() => {
    const controller = new AbortController()
    getTransactions({ search, page, limit: PAGE_SIZE, filters }, { signal: controller.signal })
      .then((data) => {
        setResponse({ key: requestKey, view, data, error: '' })
        setError('')
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        const message = getErrorMessage(err, 'Could not load transactions.')
        setResponse((prev) => ({ key: requestKey, view, data: prev.data, error: message }))
      })
    return () => controller.abort()
  }, [search, page, filters, view, requestKey])

  const { data } = response
  const isLoading = response.key !== requestKey
  // Only dim the table when moving to another page or search, not on background refreshes.
  const isChangingView = isLoading && response.view !== view
  const shownError = response.error || error

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  // Live updates from other PCs: re-fetch the page once, and refresh any open
  // "View all" lists of the items that changed (all of them after a reconnect).
  const expandedIdsRef = useRef([])
  useEffect(() => {
    expandedIdsRef.current = [...expandedEntries.keys()]
  }, [expandedEntries])

  const pendingLive = useRef({ itemIds: new Set(), everything: false, timer: null })
  useEffect(() => () => clearTimeout(pendingLive.current.timer), [])

  useLiveUpdates(({ itemId, reconnected }) => {
    const pending = pendingLive.current
    if (reconnected) pending.everything = true
    else pending.itemIds.add(itemId)

    clearTimeout(pending.timer)
    pending.timer = setTimeout(() => {
      const { itemIds, everything } = pending
      pendingLive.current = { itemIds: new Set(), everything: false, timer: null }

      reload()
      for (const id of expandedIdsRef.current) {
        if (!everything && !itemIds.has(id)) continue
        getItemTransactions(id, entryFilters)
          .then(({ transactions }) =>
            setExpandedEntries((prev) => (prev.has(id) ? new Map(prev).set(id, transactions) : prev)),
          )
          .catch(() => {}) // the list keeps its last entries; the next change retries
      }
    }, LIVE_REFRESH_DELAY_MS)
  })
  const closePanel = useCallback(() => setPanel(null), [])

  const handleItemAdded = useCallback(
    (item) => {
      setItemsAddedThisSession((items) => [item, ...items])
      reload()
    },
    [reload],
  )

  function toggleGroup(id) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function viewAll(id) {
    setLoadingAll(id)
    try {
      const { transactions } = await getItemTransactions(id, entryFilters)
      setExpandedEntries((prev) => new Map(prev).set(id, transactions))
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load the transactions for this item.'))
    } finally {
      setLoadingAll(null)
    }
  }

  function showLess(id) {
    setExpandedEntries((prev) => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }

  function applyFilters(next) {
    updateParams({ ...next, page: null })
  }

  function clearSearchAndFilters() {
    setSearchText('')
    updateParams({ ...EMPTY_FILTERS, search: null, page: null })
  }

  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1
  const first = total ? (page - 1) * PAGE_SIZE + 1 : 0
  const last = Math.min(page * PAGE_SIZE, total)

  return (
    <div className="workspace">
      <section className="workspace-content">
        <header className="page-header">
          <h1>Servitek Transactions</h1>
          <div className="page-actions">
            <Button onClick={() => setPanel('item')} aria-pressed={panel === 'item'}>
              <img src={plusIcon} alt="" />
              Add Item
            </Button>
            <Button onClick={() => setPanel('transaction')} aria-pressed={panel === 'transaction'}>
              <img src={plusIcon} alt="" />
              Add Transaction
            </Button>
          </div>
        </header>

        <div className="toolbar">
          <div className="toolbar-search">
            <label className="search-input">
              <img src={searchIcon} alt="" width="18" height="18" />
              <input
                type="search"
                placeholder="Search by item ID, code, brand or customer"
                aria-label="Search transactions"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </label>
            <FilterDropdown filters={filters} onApply={applyFilters} withEntryFilters />
          </div>
          <div className="toolbar-reports">
            <Button variant="secondary" disabled title="Coming soon">
              <img src={reportIcon} alt="" />
              Generate Daily Report
            </Button>
            <Button variant="secondary" disabled title="Coming soon">
              <img src={reportIcon} alt="" />
              Generate Transaction Report
            </Button>
          </div>
        </div>

        <ActiveFilters
          filters={filters}
          onChange={applyFilters}
          onClearAll={() => applyFilters(EMPTY_FILTERS)}
          summary={
            data?.summary && (
              <>
                <strong>{pluralize(total, 'item')}</strong> · IN total <strong>{formatNumber(data.summary.in)}</strong> ·
                OUT total <strong>{formatNumber(data.summary.out)}</strong>
              </>
            )
          }
        />

        {shownError && (
          <div className="page-error" role="alert">
            {shownError}
            <Button variant="secondary" size="sm" onClick={reload}>
              Try again
            </Button>
          </div>
        )}

        <div className={`table-card ${isChangingView ? 'is-loading' : ''}`} aria-busy={isLoading}>
          {data && data.groups.length > 0 && (
            <TransactionTable
              groups={data.groups}
              collapsed={collapsed}
              expandedEntries={expandedEntries}
              loadingAll={loadingAll}
              onToggle={toggleGroup}
              onViewAll={viewAll}
              onShowLess={showLess}
            />
          )}

          {data && data.groups.length === 0 && (
            <div className="table-empty">
              {search || activeFilterCount ? (
                <>
                  <p>{search ? `No items match “${search}”` : 'No items match'}{activeFilterCount ? ' with these filters.' : '.'}</p>
                  <Button variant="secondary" size="sm" onClick={clearSearchAndFilters}>
                    {activeFilterCount ? 'Clear search and filters' : 'Clear search'}
                  </Button>
                </>
              ) : (
                <>
                  <p>No items yet. Add your first item to start recording transactions.</p>
                  <Button size="sm" onClick={() => setPanel('item')}>
                    <img src={plusIcon} alt="" />
                    Add Item
                  </Button>
                </>
              )}
            </div>
          )}

          {!data && isLoading && <div className="table-empty">Loading transactions…</div>}

          {data && total > 0 && (
            <footer className="table-footer">
              <span>
                Showing {formatNumber(first)}–{formatNumber(last)} of {formatNumber(total)} items · most recent
                activity first
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

      {panel === 'item' && (
        <AddItemPanel onClose={closePanel} onAdded={handleItemAdded} addedThisSession={itemsAddedThisSession} />
      )}
      {panel === 'transaction' && <AddTransactionPanel onClose={closePanel} onSaved={reload} />}
    </div>
  )
}
