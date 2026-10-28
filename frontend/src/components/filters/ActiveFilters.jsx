import closeIcon from '../../assets/icons/close.svg'
import './FilterDropdown.css'

// One removable chip per active filter, "Clear all", and an optional result summary.
// chips: [{ id, label, without }], where without is the filters left when it's removed
// (see filterChips() in utils/filters.js).
export default function ActiveFilters({ chips, onChange, onClearAll, summary }) {
  if (!chips.length) return null

  return (
    <div className="active-filters" aria-label="Active filters">
      {chips.map((chip) => (
        <span key={chip.id} className="active-filter">
          {chip.label}
          <button type="button" onClick={() => onChange(chip.without)} aria-label={`Remove filter ${chip.label}`}>
            <img src={closeIcon} alt="" width="14" height="14" />
          </button>
        </span>
      ))}
      <button type="button" className="filter-link" onClick={onClearAll}>
        Clear all
      </button>
      {summary && <p className="active-filters-summary">{summary}</p>}
    </div>
  )
}
