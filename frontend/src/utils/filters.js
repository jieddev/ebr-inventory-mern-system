import { formatDate } from './format'

// Filters live in the URL query string, so a filtered view survives a refresh and can be shared.
// Entry filters (type, from, to) only apply on the Transactions page; added (date added) and
// addedBy (user _ids) only on the Items page.
export const EMPTY_FILTERS = { type: '', from: '', to: '', stock: '', added: '', addedBy: [], category: [], brand: [] }

// facet: where the dropdown finds the choices in GET /api/items/facets.
export const LIST_FILTERS = [
  { key: 'category', label: 'Category', facet: 'categories' },
  { key: 'brand', label: 'Brand', facet: 'brands' },
]

export const STOCK_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'in', label: 'In stock' },
  { value: 'out', label: 'Out of stock' },
  { value: 'negative', label: 'Negative' },
]

export function readFilters(searchParams) {
  return {
    type: searchParams.get('type') ?? '',
    from: searchParams.get('from') ?? '',
    to: searchParams.get('to') ?? '',
    stock: searchParams.get('stock') ?? '',
    added: searchParams.get('added') ?? '',
    addedBy: searchParams.getAll('addedBy'),
    category: searchParams.getAll('category'),
    brand: searchParams.getAll('brand'),
  }
}

export function countActiveFilters(filters) {
  return (
    (filters.type ? 1 : 0) +
    (filters.from || filters.to ? 1 : 0) +
    (filters.stock ? 1 : 0) +
    (filters.added ? 1 : 0) +
    filters.addedBy.length +
    LIST_FILTERS.reduce((sum, { key }) => sum + filters[key].length, 0)
  )
}

// One chip per active filter value, each with the filters it leaves when removed.
// addedByNames: { userId: name } for the Added by chips (from the Items list response).
export function filterChips(filters, { addedByNames } = {}) {
  const chips = []
  if (filters.type) chips.push({ id: 'type', label: `Type: ${filters.type === 'ADJUST' ? 'COUNT' : filters.type}`, without: { ...filters, type: '' } })
  if (filters.from || filters.to) {
    const label =
      filters.from && filters.to
        ? filters.from === filters.to
          ? formatDay(filters.from)
          : `${formatDay(filters.from)} – ${formatDay(filters.to)}`
        : filters.from
          ? `From ${formatDay(filters.from)}`
          : `Until ${formatDay(filters.to)}`
    chips.push({ id: 'date', label: `Date: ${label}`, without: { ...filters, from: '', to: '' } })
  }
  if (filters.stock) {
    const label = STOCK_OPTIONS.find((o) => o.value === filters.stock)?.label ?? filters.stock
    chips.push({ id: 'stock', label: `Stock: ${label}`, without: { ...filters, stock: '' } })
  }
  if (filters.added) chips.push({ id: 'added', label: 'Added today', without: { ...filters, added: '' } })
  for (const id of filters.addedBy) {
    chips.push({
      id: `addedBy:${id}`,
      label: `Added by: ${addedByNames?.[id] ?? 'user'}`,
      without: { ...filters, addedBy: filters.addedBy.filter((v) => v !== id) },
    })
  }
  for (const { key, label } of LIST_FILTERS) {
    for (const value of filters[key]) {
      chips.push({
        id: `${key}:${value}`,
        label: `${label}: ${value}`,
        without: { ...filters, [key]: filters[key].filter((v) => v !== value) },
      })
    }
  }
  return chips
}

// "2026-10-28" → "10/28/2026"
function formatDay(value) {
  return formatDate(`${value}T00:00:00Z`)
}

// Date range presets, as "YYYY-MM-DD" in the user's time zone.
export function datePresets() {
  const toInput = (date) => {
    const pad = (n) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  }
  const now = new Date()
  const today = toInput(now)
  const weekAgo = toInput(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6))
  const monthStart = toInput(new Date(now.getFullYear(), now.getMonth(), 1))
  return [
    { label: 'Today', from: today, to: today },
    { label: 'Last 7 days', from: weekAgo, to: today },
    { label: 'This month', from: monthStart, to: today },
  ]
}
