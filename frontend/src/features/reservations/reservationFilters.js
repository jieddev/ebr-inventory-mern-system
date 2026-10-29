// The Reservations page filter (see ReservationFilter.jsx), kept in the URL as ?due=.
export const EMPTY_RESERVATION_FILTERS = { due: '' }

// value: the URL param; count: the key in the page's counts.
export const DUE_OPTIONS = [
  { value: '', label: 'All', count: 'all' },
  { value: 'overdue', label: 'Overdue', count: 'overdue' },
  { value: 'today', label: 'Due today', count: 'today' },
  { value: 'upcoming', label: 'Upcoming', count: 'upcoming' },
]

export const countReservationFilters = (filters) => (filters.due ? 1 : 0)

// One removable chip per active filter, for ActiveFilters.
export function reservationChips(filters) {
  const due = DUE_OPTIONS.find((o) => o.value && o.value === filters.due)
  return due ? [{ id: 'due', label: `Due: ${due.label}`, without: { ...filters, due: '' } }] : []
}
