import { useState } from 'react'
import SegmentedControl from '../ui/SegmentedControl'
import { getItemFacets } from '../../api/items'
import { formatNumber } from '../../utils/format'
import { EMPTY_FILTERS, LIST_FILTERS, STOCK_OPTIONS, countActiveFilters } from '../../utils/filters'
import FilterPopover from './FilterPopover'
import { ChecklistSection, DateRangeSection } from './FilterSections'
import dotIn from '../../assets/icons/dot-in.svg'
import dotOut from '../../assets/icons/dot-out.svg'
import dotReserve from '../../assets/icons/dot-reserve.svg'

const TYPE_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'IN', label: 'IN', icon: dotIn, tone: 'in' },
  { value: 'OUT', label: 'OUT', icon: dotOut, tone: 'out' },
  { value: 'RESERVE', label: 'RESERVE', icon: dotReserve, tone: 'reserve' },
]

// The Added by choices. With "Added today" on: today's counts, and only users who added items
// today (plus any already picked).
function addedByOptions(users, draft) {
  if (!users || draft.added !== 'today') return users
  return users
    .filter((user) => user.todayCount > 0 || draft.addedBy.includes(user.value))
    .map((user) => ({ ...user, count: user.todayCount }))
}

// The item filter of the Transactions and Items pages (see utils/filters.js).
// withEntryFilters adds transaction type and date range (Transactions page only).
// withStock: false hides stock status (encoders don't see stock). withAdded: the "Added today"
// and "Added by" filters (Items page only). align: see FilterPopover.
export default function FilterDropdown({
  filters,
  onApply,
  withEntryFilters = false,
  withStock = true,
  withAdded = false,
  align = 'end',
}) {
  const [facets, setFacets] = useState(null)
  const [facetsError, setFacetsError] = useState(false)

  // Fetched on every open, so the counts are current.
  function loadFacets() {
    setFacetsError(false)
    getItemFacets()
      .then(setFacets)
      .catch(() => setFacetsError(true))
  }

  return (
    <FilterPopover
      value={filters}
      empty={EMPTY_FILTERS}
      countOf={countActiveFilters}
      onApply={onApply}
      onOpen={loadFacets}
      align={align}
    >
      {({ draft, set, idPrefix }) => (
        <>
          {withEntryFilters && (
            <>
              <section className="filter-section">
                <SegmentedControl
                  label="Transaction type"
                  name={`${idPrefix}-type`}
                  options={TYPE_OPTIONS}
                  value={draft.type}
                  onChange={(type) => set({ type })}
                />
              </section>

              <DateRangeSection from={draft.from} to={draft.to} onChange={set} />
            </>
          )}

          {withStock && (
            <section className="filter-section">
              <h3 className="filter-title">Stock status</h3>
              <div className="filter-options" role="radiogroup" aria-label="Stock status">
                {STOCK_OPTIONS.map((option) => (
                  <label key={option.value} className="filter-option">
                    <input
                      type="radio"
                      name={`${idPrefix}-stock`}
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
          )}

          {withAdded && (
            <section className="filter-section">
              <h3 className="filter-title">Date added</h3>
              <div className="filter-options">
                <label className="filter-option">
                  <input
                    type="checkbox"
                    checked={draft.added === 'today'}
                    onChange={(e) => set({ added: e.target.checked ? 'today' : '' })}
                  />
                  <span className="filter-option-label">Added today</span>
                  {facets && <span className="filter-option-count">{formatNumber(facets.addedToday)}</span>}
                </label>
              </div>
            </section>
          )}

          {withAdded && (
            <ChecklistSection
              title="Added by"
              options={addedByOptions(facets?.addedBy, draft)}
              error={facetsError}
              selected={draft.addedBy}
              onChange={(addedBy) => set({ addedBy })}
            />
          )}

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
        </>
      )}
    </FilterPopover>
  )
}
