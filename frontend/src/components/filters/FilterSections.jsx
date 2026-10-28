import { useId, useState } from 'react'
import { formatNumber } from '../../utils/format'
import { datePresets } from '../../utils/filters'
import './FilterDropdown.css'

// Sections for FilterPopover, shared by the Transactions, Items and Activity filters.

export function DateRangeSection({ from, to, onChange }) {
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
// options: [{ value, count, label? }]; label (default: value) is what's shown and searched.
export function ChecklistSection({ title, options, error, selected, onChange }) {
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
  const matching = q ? options.filter((o) => (o.label ?? o.value).toUpperCase().includes(q)) : options
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
            <span className="filter-option-label">{option.label ?? option.value}</span>
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
