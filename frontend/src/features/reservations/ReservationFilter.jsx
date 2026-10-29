import FilterPopover from '../../components/filters/FilterPopover'
import { formatNumber } from '../../utils/format'
import { DUE_OPTIONS, EMPTY_RESERVATION_FILTERS, countReservationFilters } from './reservationFilters'

// Reservations page filter: when the reservation is needed. counts: from the last
// page load (they follow the search, not the filter).
export default function ReservationFilter({ filters, counts, onApply }) {
  return (
    <FilterPopover
      value={filters}
      empty={EMPTY_RESERVATION_FILTERS}
      countOf={countReservationFilters}
      onApply={onApply}
    >
      {({ draft, set, idPrefix }) => (
        <section className="filter-section">
          <h3 className="filter-title">Needed by</h3>
          <div className="filter-options" role="radiogroup" aria-label="Needed by">
            {DUE_OPTIONS.map((option) => (
              <label key={option.value} className="filter-option">
                <input
                  type="radio"
                  name={`${idPrefix}-due`}
                  checked={draft.due === option.value}
                  onChange={() => set({ due: option.value })}
                />
                <span className="filter-option-label">{option.label}</span>
                {counts && <span className="filter-option-count">{formatNumber(counts[option.count])}</span>}
              </label>
            ))}
          </div>
        </section>
      )}
    </FilterPopover>
  )
}
