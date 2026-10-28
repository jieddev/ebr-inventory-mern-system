import { useId, useRef, useState } from 'react'
import Button from '../ui/Button'
import SegmentedControl from '../ui/SegmentedControl'
import { getItemFacets } from '../../api/items'
import { useClickOutside } from '../../hooks/useClickOutside'
import { formatNumber } from '../../utils/format'
import { EMPTY_FILTERS, LIST_FILTERS, STOCK_OPTIONS, countActiveFilters, datePresets } from '../../utils/filters'
import filterIcon from '../../assets/icons/filter.svg'
import dotIn from '../../assets/icons/dot-in.svg'
import dotOut from '../../assets/icons/dot-out.svg'
import './FilterDropdown.css'

const TYPE_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'IN', label: 'IN', icon: dotIn, tone: 'in' },
  { value: 'OUT', label: 'OUT', icon: dotOut, tone: 'out' },
]

// "Filter" button with a dropdown. Changes are a draft until "Show results".
// withEntryFilters adds transaction type and date range (Transactions page only).
// align: 'end' opens leftward from the button, 'start' rightward (for a button at the left edge).
export default function FilterDropdown({ filters, onApply, withEntryFilters = false, align = 'end' }) {
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const popoverId = useId()
  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState(filters)
  const [facets, setFacets] = useState(null)
  const [facetsError, setFacetsError] = useState(false)

  const activeCount = countActiveFilters(filters)
  const draftCount = countActiveFilters(draft)

  function open() {
    setDraft(filters)
    setIsOpen(true)
    // Fetched on every open, so the counts are current.
    setFacetsError(false)
    getItemFacets()
      .then(setFacets)
      .catch(() => setFacetsError(true))
  }

  function close() {
    setIsOpen(false)
  }

  useClickOutside(rootRef, isOpen, close)

  function handleKeyDown(event) {
    if (event.key !== 'Escape' || !isOpen) return
    // Stop here so an open side panel doesn't also close.
    event.stopPropagation()
    close()
    triggerRef.current?.focus()
  }

  function apply() {
    onApply(draft)
    close()
  }

  const set = (changes) => setDraft((d) => ({ ...d, ...changes }))

  return (
    <div className="filter-dropdown" ref={rootRef} onKeyDown={handleKeyDown}>
      <Button
        ref={triggerRef}
        variant="secondary"
        onClick={() => (isOpen ? close() : open())}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={popoverId}
      >
        <img src={filterIcon} alt="" />
        Filter
        {activeCount > 0 && <span className="filter-count">{activeCount}</span>}
      </Button>

      {isOpen && (
        <div id={popoverId} className={`filter-popover filter-popover-${align}`} role="dialog" aria-label="Filters">
          <div className="filter-body">
            {withEntryFilters && (
              <>
                <section className="filter-section">
                  <SegmentedControl
                    label="Transaction type"
                    name={`${popoverId}-type`}
                    options={TYPE_OPTIONS}
                    value={draft.type}
                    onChange={(type) => set({ type })}
                  />
                </section>

                <DateRangeSection from={draft.from} to={draft.to} onChange={set} />
              </>
            )}

            <section className="filter-section">
              <h3 className="filter-title">Stock status</h3>
              <div className="filter-options" role="radiogroup" aria-label="Stock status">
                {STOCK_OPTIONS.map((option) => (
                  <label key={option.value} className="filter-option">
                    <input
                      type="radio"
                      name={`${popoverId}-stock`}
                      checked={draft.stock === option.value}
                      onChange={() => set({ stock: option.value })}
                    />
                    <span className="filter-option-label">{option.label}</span>
                    {option.value && facets && (
                      <span className="filter-option-count">{formatNumber(facets.stock[option.value])}</span>
                    )}
                  </label>
                ))}
              </div>
            </section>

            {LIST_FILTERS.map(({ key, label, facet }) => (
              <ChecklistSection
                key={key}
                title={label}
                options={facets?.[facet]}
                error={facetsError}
                selected={draft[key]}
                onChange={(values) => set({ [key]: values })}
              />
            ))}
          </div>

          <footer className="filter-footer">
            <span className="filter-selected">{draftCount ? `${draftCount} selected` : 'No filters'}</span>
            <Button variant="ghost" size="sm" onClick={() => setDraft(EMPTY_FILTERS)} disabled={!draftCount}>
              Clear all
            </Button>
            <Button variant="secondary" size="sm" onClick={close}>
              Cancel
            </Button>
            <Button size="sm" onClick={apply}>
              Show results
            </Button>
          </footer>
        </div>
      )}
    </div>
  )
}

function DateRangeSection({ from, to, onChange }) {
  const fromId = useId()
  const toId = useId()
  const presets = datePresets()

  return (
    <section className="filter-section">
      <h3 className="filter-title">Date range</h3>
      <div className="filter-presets">
        {presets.map((preset) => {
          const isActive = preset.from === from && preset.to === to
          return (
            <button
              key={preset.label}
              type="button"
              className={`filter-chip-button ${isActive ? 'is-active' : ''}`}
              aria-pressed={isActive}
              onClick={() => onChange(isActive ? { from: '', to: '' } : { from: preset.from, to: preset.to })}
            >
              {preset.label}
            </button>
          )
        })}
      </div>
      <div className="filter-dates">
        <label htmlFor={fromId}>
          <span className="filter-date-label">From</span>
          <input
            id={fromId}
            type="date"
            className="field-input"
            value={from}
            max={to || undefined}
            onChange={(e) => onChange({ from: e.target.value })}
          />
        </label>
        <label htmlFor={toId}>
          <span className="filter-date-label">To</span>
          <input
            id={toId}
            type="date"
            className="field-input"
            value={to}
            min={from || undefined}
            onChange={(e) => onChange({ to: e.target.value })}
          />
        </label>
      </div>
    </section>
  )
}

const COLLAPSED_COUNT = 6

// Checkbox list with a search box and "Show all". Selected values stay visible.
function ChecklistSection({ title, options, error, selected, onChange }) {
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)

  if (!options) {
    return (
      <section className="filter-section">
        <h3 className="filter-title">{title}</h3>
        <p className="filter-note">{error ? 'Could not load the choices.' : 'Loading…'}</p>
      </section>
    )
  }

  const q = query.trim().toUpperCase()
  const matching = q ? options.filter((o) => o.value.includes(q)) : options
  const isCollapsible = !q && !showAll && matching.length > COLLAPSED_COUNT
  const shown = isCollapsible
    ? [...matching.slice(0, COLLAPSED_COUNT), ...matching.slice(COLLAPSED_COUNT).filter((o) => selected.includes(o.value))]
    : matching

  function toggle(value) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])
  }

  return (
    <section className="filter-section">
      <div className="filter-title-row">
        <h3 className="filter-title">{title}</h3>
        {selected.length > 0 && (
          <button type="button" className="filter-link" onClick={() => onChange([])}>
            Clear ({selected.length})
          </button>
        )}
      </div>
      {options.length > COLLAPSED_COUNT && (
        <input
          type="search"
          className="field-input filter-search"
          placeholder={`Search ${title.toLowerCase()}`}
          aria-label={`Search ${title.toLowerCase()}`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      <div className="filter-options">
        {shown.map((option) => (
          <label key={option.value} className="filter-option">
            <input type="checkbox" checked={selected.includes(option.value)} onChange={() => toggle(option.value)} />
            <span className="filter-option-label">{option.value}</span>
            <span className="filter-option-count">{formatNumber(option.count)}</span>
          </label>
        ))}
        {shown.length === 0 && <p className="filter-note">No matches.</p>}
      </div>
      {isCollapsible && (
        <button type="button" className="filter-link" onClick={() => setShowAll(true)}>
          Show all ({formatNumber(matching.length)})
        </button>
      )}
    </section>
  )
}
