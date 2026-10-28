import { useState } from 'react'
import FilterPopover from '../../components/filters/FilterPopover'
import { ChecklistSection, DateRangeSection } from '../../components/filters/FilterSections'
import { getAuditFacets } from '../../api/audit'
import { EMPTY_ACTIVITY_FILTERS, countActivityFilters } from './activityFilters'

// Activity page filter: activity type, user and date range, each with counts.
export default function ActivityFilter({ filters, onApply }) {
  const [facets, setFacets] = useState(null)
  const [facetsError, setFacetsError] = useState(false)

  // Fetched on every open, so the counts are current.
  function loadFacets() {
    setFacetsError(false)
    getAuditFacets()
      .then(setFacets)
      .catch(() => setFacetsError(true))
  }

  return (
    <FilterPopover
      value={filters}
      empty={EMPTY_ACTIVITY_FILTERS}
      countOf={countActivityFilters}
      onApply={onApply}
      onOpen={loadFacets}
    >
      {({ draft, set }) => (
        <>
          <ChecklistSection
            title="Activity type"
            options={facets?.types}
            error={facetsError}
            selected={draft.type}
            onChange={(type) => set({ type })}
          />
          <ChecklistSection
            title="User"
            options={facets?.users}
            error={facetsError}
            selected={draft.user}
            onChange={(user) => set({ user })}
          />
          <DateRangeSection from={draft.from} to={draft.to} onChange={set} />
        </>
      )}
    </FilterPopover>
  )
}
