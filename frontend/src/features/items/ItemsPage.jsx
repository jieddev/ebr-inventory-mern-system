import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import CopyText from '../../components/ui/CopyText'
import SegmentedControl from '../../components/ui/SegmentedControl'
import ActiveFilters from '../../components/filters/ActiveFilters'
import FilterDropdown from '../../components/filters/FilterDropdown'
import { getErrorMessage } from '../../api/auth'
import { archiveItem, batchItems, exportItems, getItems, importItems, restoreItem } from '../../api/items'
import { useLiveUpdates } from '../../hooks/useLiveUpdates'
import { formatDate, formatNumber, pluralize } from '../../utils/format'
import { EMPTY_FILTERS, countActiveFilters, filterChips, readFilters } from '../../utils/filters'
import searchIcon from '../../assets/icons/search.svg'
import plusIcon from '../../assets/icons/plus.svg'
import uploadIcon from '../../assets/icons/upload.svg'
import downloadIcon from '../../assets/icons/download.svg'
import checkIcon from '../../assets/icons/check-circle.svg'
import closeIcon from '../../assets/icons/close.svg'
import EditItemPanel from './EditItemPanel'
import AddItemPanel from './AddItemPanel'
import { useAuth } from '../auth/useAuth'
import { can } from '../../utils/permissions'
import '../transactions/TransactionsPage.css'
import './ItemsPage.css'

const PAGE_SIZE = 25
const VIEW_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
]
const SEARCH_DELAY_MS = 300
// all: every item matching the current search, filters and view, on every page.
const NO_SELECTION = { scope: null, ids: new Set(), all: false }

// Every unique item with its item ID, for users with viewItems; Add Item with addItems.
// Everyone sees the current ending balance. With viewItemStock: the stock filter and the last
// transaction date (the API leaves them out otherwise). Admins also get: Excel import and
// export, Edit / Archive per item, the Archived view (with Restore), and ticked rows
// (or "Select all N matching") archived or restored in one go.
export default function ItemsPage() {
  const { user } = useAuth()
  const isAdmin = user.role === 'admin'
  const canAddItems = can(user, 'addItems')
  const seesStock = can(user, 'viewItemStock')
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('search') ?? ''
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const isArchivedView = isAdmin && searchParams.get('archived') === '1'
  // The Items page only uses the item filters (stock, category, brand).
  const filters = useMemo(() => {
    const { stock, category, brand } = readFilters(searchParams)
    return { ...EMPTY_FILTERS, stock, category, brand }
  }, [searchParams])

  const [searchText, setSearchText] = useState(search)
  const [reloadKey, setReloadKey] = useState(0)
  // The last finished request. It's loading while that isn't the current request.
  const [response, setResponse] = useState({
    key: null,
    data: null,
    error: '',
  })
  const [error, setError] = useState('')

  const fileInputRef = useRef(null)
  const [isImporting, setIsImporting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [importResult, setImportResult] = useState(null)

  const [editing, setEditing] = useState(null)
  const [isAdding, setIsAdding] = useState(false)
  const [addedThisSession, setAddedThisSession] = useState([])
  const [confirmArchive, setConfirmArchive] = useState(null) // { item, isBusy, error }
  const [restoringId, setRestoringId] = useState(null)
  const [notice, setNotice] = useState('')

  // The selection belongs to one search + filters + view (page excluded, so it survives
  // paging). Changing any of them drops it.
  const selectionScope = useMemo(() => {
    const scope = new URLSearchParams(searchParams)
    scope.delete('page')
    return scope.toString()
  }, [searchParams])
  const [selectionState, setSelectionState] = useState(NO_SELECTION)
  const selection = selectionState.scope === selectionScope ? selectionState : NO_SELECTION
  const [confirmBatch, setConfirmBatch] = useState(null) // { isBusy, error }

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
    getItems({ search, page, limit: PAGE_SIZE, filters, archived: isArchivedView }, { signal: controller.signal })
      .then((data) => setResponse({ key: requestKey, data, error: '' }))
      .catch((err) => {
        if (controller.signal.aborted) return
        const message = getErrorMessage(err, 'Could not load items.')
        setResponse((prev) => ({
          key: requestKey,
          data: prev.data,
          error: message,
        }))
      })
    return () => controller.abort()
  }, [search, page, filters, isArchivedView, requestKey])

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

  function handleSaved(item) {
    setEditing(null)
    setNotice(`${item.itemId} · ${item.code} was saved.`)
    reload()
  }

  async function handleArchive() {
    const { item } = confirmArchive
    setConfirmArchive({ item, isBusy: true, error: '' })
    try {
      await archiveItem(item._id)
      setConfirmArchive(null)
      if (editing?._id === item._id) setEditing(null)
      setNotice(`${item.itemId} · ${item.code} was archived. Find it under Archived to restore it.`)
      reload()
    } catch (err) {
      setConfirmArchive({
        item,
        isBusy: false,
        error: getErrorMessage(err, 'Could not archive the item.'),
      })
    }
  }

  async function handleRestore(item) {
    setRestoringId(item._id)
    setError('')
    try {
      await restoreItem(item._id)
      setNotice(`${item.itemId} · ${item.code} was restored.`)
      reload()
    } catch (err) {
      setError(getErrorMessage(err, 'Could not restore the item.'))
    } finally {
      setRestoringId(null)
    }
  }

  const setSelection = (ids, all = false) => setSelectionState({ scope: selectionScope, ids, all })
  const clearSelection = () => setSelectionState(NO_SELECTION)

  function toggleRow(id) {
    // In "all matching" mode, unticking a row falls back to this page's rows.
    const ids = new Set(selection.all ? items.map((item) => item._id) : selection.ids)
    if (ids.has(id)) ids.delete(id)
    else ids.add(id)
    setSelection(ids)
  }

  function togglePage() {
    const ids = new Set(selection.ids)
    if (isPageSelected) items.forEach((item) => ids.delete(item._id))
    else items.forEach((item) => ids.add(item._id))
    setSelection(ids)
  }

  async function handleBatch() {
    const action = isArchivedView ? 'restore' : 'archive'
    setConfirmBatch({ isBusy: true, error: '' })
    try {
      const { stock, category, brand } = filters
      const count = await batchItems(
        action,
        selection.all
          ? { all: true, query: { search, stock, category, brand } }
          : { ids: [...selection.ids] },
      )
      setConfirmBatch(null)
      clearSelection()
      setEditing(null)
      setNotice(
        action === 'archive'
          ? `${pluralize(count, 'item')} archived. Find them under Archived to restore them.`
          : `${pluralize(count, 'item')} restored.`,
      )
      reload()
    } catch (err) {
      setConfirmBatch({
        isBusy: false,
        error: getErrorMessage(err, `Could not ${action} the items.`),
      })
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

  const isRowSelected = (id) => selection.all || selection.ids.has(id)
  const selectedOnPage = items.filter((item) => isRowSelected(item._id)).length
  const isPageSelected = items.length > 0 && selectedOnPage === items.length
  const selectedCount = selection.all ? total : selection.ids.size
  const batchVerb = isArchivedView ? 'Restore' : 'Archive'

  function applyFilters(next) {
    updateParams({ ...next, page: null })
  }

  return (
    <div className="workspace">
      <section className="workspace-content">
        <header className="page-header">
          <h1>All Items</h1>
          {!isArchivedView && (canAddItems || isAdmin) && (
            <div className="page-actions">
              {canAddItems && (
                <Button
                  onClick={() => {
                    setEditing(null)
                    setIsAdding(true)
                  }}
                  aria-pressed={isAdding}
                >
                  <img src={plusIcon} alt="" />
                  Add Item
                </Button>
              )}
              {isAdmin && (
                <>
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xlsm" hidden onChange={handleFileChosen} />
                  <Button variant="secondary" onClick={() => fileInputRef.current?.click()} isLoading={isImporting}>
                    {!isImporting && <img src={uploadIcon} alt="" />}
                    {isImporting ? 'Importing…' : 'Import Excel'}
                  </Button>
                  <Button variant="secondary" onClick={handleExport} isLoading={isExporting}>
                    {!isExporting && <img src={downloadIcon} alt="" />}
                    Export Excel
                  </Button>
                </>
              )}
            </div>
          )}
        </header>

        {importResult && <ImportResult result={importResult} onDismiss={() => setImportResult(null)} />}
        {notice && (
          <div className="panel-alert panel-alert-success items-notice" role="status">
            <img src={checkIcon} alt="" width="20" height="20" />
            <p>{notice}</p>
            <button type="button" className="import-result-close" onClick={() => setNotice('')} aria-label="Dismiss">
              <img src={closeIcon} alt="" width="20" height="20" />
            </button>
          </div>
        )}

        <div className="toolbar">
          <div className="toolbar-search">
            <FilterDropdown filters={filters} onApply={applyFilters} align="start" withStock={seesStock} />

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
          {isAdmin && (
            <SegmentedControl
              label="Show"
              hideLabel
              name="items-view"
              options={VIEW_OPTIONS}
              value={isArchivedView ? 'archived' : 'active'}
              onChange={(view) => {
                setNotice('')
                updateParams({
                  archived: view === 'archived' ? '1' : null,
                  page: null,
                })
              }}
            />
          )}
        </div>

        <ActiveFilters
          chips={filterChips(filters)}
          onChange={applyFilters}
          onClearAll={() => applyFilters(EMPTY_FILTERS)}
          summary={
            data && (
              <>
                <strong>{pluralize(total, 'item')}</strong> match
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

        <div className={`table-card ${isLoading && data ? 'is-loading' : ''}`} aria-busy={isLoading}>
          {selectedCount > 0 && (
            <div className="items-bulk-bar" role="region" aria-label="Selected items">
              <span className="items-bulk-count">
                {selection.all
                  ? `All ${pluralize(total, 'matching item')} selected`
                  : `${formatNumber(selectedCount)} selected`}
              </span>
              {!selection.all && isPageSelected && total > selectedCount && (
                <button type="button" className="filter-link" onClick={() => setSelection(new Set(), true)}>
                  Select all {pluralize(total, 'matching item')}
                </button>
              )}
              <button type="button" className="filter-link" onClick={clearSelection}>
                Clear selection
              </button>
              <Button
                size="sm"
                variant={isArchivedView ? 'primary' : 'danger'}
                className="items-bulk-action"
                onClick={() => setConfirmBatch({ isBusy: false, error: '' })}
              >
                {batchVerb} {selection.all ? 'all' : 'selected'}
              </Button>
            </div>
          )}

          {items.length > 0 && (
            <div className="items-table-scroll">
              <table className="items-table">
                <thead>
                  <tr>
                    {isAdmin && (
                      <th className="items-select-col">
                        <input
                          type="checkbox"
                          aria-label="Select all items on this page"
                          checked={isPageSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = selectedOnPage > 0 && !isPageSelected
                          }}
                          onChange={togglePage}
                        />
                      </th>
                    )}
                    <th>Item ID</th>
                    <th>Category</th>
                    <th>Item Description</th>
                    <th>Brand name</th>
                    <th className="is-number">Balance</th>
                    {seesStock && <th>Last transaction</th>}
                    {isAdmin && <th className="items-actions-col" aria-label="Actions" />}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item._id} className={isRowSelected(item._id) ? 'is-selected' : ''}>
                      {isAdmin && (
                        <td className="items-select-col">
                          <input
                            type="checkbox"
                            aria-label={`Select ${item.itemId}`}
                            checked={isRowSelected(item._id)}
                            onChange={() => toggleRow(item._id)}
                          />
                        </td>
                      )}
                      <td className="items-id">
                        <CopyText text={item.itemId} className="items-id" />
                      </td>
                      <td className="items-muted">{item.category || '—'}</td>
                      <td className="items-code">{item.code}</td>
                      <td>{item.brand || '—'}</td>
                      <td className={`is-number ${item.balance < 0 ? 'is-negative' : ''}`}>
                        {formatNumber(item.balance)}
                      </td>
                      {seesStock && <td className="items-muted">{formatDate(item.lastTransactionDate)}</td>}
                      {isAdmin && (
                        <td className="items-actions">
                          {isArchivedView ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRestore(item)}
                              isLoading={restoringId === item._id}
                              aria-label={`Restore ${item.itemId}`}
                            >
                              Restore
                            </Button>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setIsAdding(false)
                                  setEditing(item)
                                }}
                                aria-pressed={editing?._id === item._id}
                                aria-label={`Edit ${item.itemId}`}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="items-archive-btn"
                                onClick={() =>
                                  setConfirmArchive({
                                    item,
                                    isBusy: false,
                                    error: '',
                                  })
                                }
                                aria-label={`Archive ${item.itemId}`}
                              >
                                Archive
                              </Button>
                            </>
                          )}
                        </td>
                      )}
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
                      updateParams({
                        ...EMPTY_FILTERS,
                        search: null,
                        page: null,
                      })
                    }}
                  >
                    Clear filters
                  </Button>
                </>
              ) : isArchivedView ? (
                <p>No archived items.</p>
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
                  onClick={() =>
                    updateParams({
                      page: page - 1 > 1 ? String(page - 1) : null,
                    })
                  }
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

      {editing && (
        <EditItemPanel key={editing._id} item={editing} onClose={() => setEditing(null)} onSaved={handleSaved} />
      )}
      {isAdding && !editing && canAddItems && (
        <AddItemPanel
          onClose={() => setIsAdding(false)}
          onAdded={(item) => {
            setAddedThisSession((list) => [item, ...list])
            reload()
          }}
          addedThisSession={addedThisSession}
        />
      )}

      {confirmBatch && (
        <ConfirmDialog
          title={`${batchVerb} ${selection.all ? 'all ' : ''}${pluralize(selectedCount, 'item')}?`}
          message={
            isArchivedView ? (
              <p>They'll be back in transactions, search, filters and exports, and can get new transactions again.</p>
            ) : (
              <p>
                {selection.all && isFiltered && 'Every item matching the current search and filters, on every page. '}
                {selection.all && !isFiltered && <strong>This is every active item. </strong>}
                They'll be hidden from transactions, search, filters and exports, and can't get new transactions. Their
                history is kept, and you can restore them from the Archived view.
              </p>
            )
          }
          confirmLabel={`${batchVerb} ${pluralize(selectedCount, 'item')}`}
          tone={isArchivedView ? 'primary' : 'danger'}
          isBusy={confirmBatch.isBusy}
          error={confirmBatch.error}
          onConfirm={handleBatch}
          onCancel={() => setConfirmBatch(null)}
        />
      )}

      {confirmArchive && (
        <ConfirmDialog
          title={`Archive ${confirmArchive.item.itemId}?`}
          message={
            <p>
              <strong>{confirmArchive.item.code}</strong> will be hidden from transactions, search, filters and exports,
              and can't get new transactions. Its history is kept, and you can restore it from the Archived view.
            </p>
          }
          confirmLabel="Archive item"
          isBusy={confirmArchive.isBusy}
          error={confirmArchive.error}
          onConfirm={handleArchive}
          onCancel={() => setConfirmArchive(null)}
        />
      )}
    </div>
  )
}

// What an import did: how many items were added and which rows were skipped and why.
function ImportResult({ result, onDismiss }) {
  const { fileName, added, asOf, skippedExisting, skippedDuplicates, invalid } = result
  const problems = [
    ...invalid,
    ...skippedDuplicates.map((row) => ({
      ...row,
      reason: `Same item as row ${row.sameAsRow}`,
    })),
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
            {skippedExisting.length > 0 &&
              ` · ${pluralize(skippedExisting.length, 'item')} already existed and were left unchanged`}
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
