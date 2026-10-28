import { formatDate } from '../../utils/format'

// The Activity page's filters, kept in the URL like the other pages' filters.
// type and user are lists (?type=item&type=user); from / to are "YYYY-MM-DD".
export const EMPTY_ACTIVITY_FILTERS = { type: [], user: [], from: '', to: '' }

// Same values as TYPES in backend controllers/audit.controller.js.
export const ACTIVITY_TYPE_LABELS = {
  login: 'Logins and logouts',
  failed_login: 'Failed logins',
  item: 'Items',
  transaction: 'Transactions',
  user: 'Users',
}

export function readActivityFilters(searchParams) {
  return {
    type: searchParams.getAll('type'),
    user: searchParams.getAll('user'),
    from: searchParams.get('from') ?? '',
    to: searchParams.get('to') ?? '',
  }
}

export function countActivityFilters(filters) {
  return filters.type.length + filters.user.length + (filters.from || filters.to ? 1 : 0)
}

// Chips for ActiveFilters. userName(id) gives a user's display name.
export function activityChips(filters, userName) {
  const chips = filters.type.map((type) => ({
    id: `type:${type}`,
    label: `Type: ${ACTIVITY_TYPE_LABELS[type] ?? type}`,
    without: { ...filters, type: filters.type.filter((t) => t !== type) },
  }))
  for (const id of filters.user) {
    chips.push({
      id: `user:${id}`,
      label: `User: ${userName(id)}`,
      without: { ...filters, user: filters.user.filter((u) => u !== id) },
    })
  }
  if (filters.from || filters.to) {
    const day = (value) => formatDate(`${value}T00:00:00Z`)
    const label =
      filters.from && filters.to
        ? filters.from === filters.to
          ? day(filters.from)
          : `${day(filters.from)} – ${day(filters.to)}`
        : filters.from
          ? `From ${day(filters.from)}`
          : `Until ${day(filters.to)}`
    chips.push({ id: 'date', label: `Date: ${label}`, without: { ...filters, from: '', to: '' } })
  }
  return chips
}
