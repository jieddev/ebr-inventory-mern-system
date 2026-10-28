import { filterChips } from '../../utils/filters'
import closeIcon from '../../assets/icons/close.svg'
import './FilterDropdown.css'

// One removable chip per active filter, "Clear all", and an optional result summary.
export default function ActiveFilters({ filters, onChange, onClearAll, summary }) {
  const chips = filterChips(filters)
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
