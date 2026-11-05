// The ?sort= choices of the Transactions and Items pages. '' is each page's own default order.
// Keep in step with backend utils/filters.js ALPHABETICAL_SORTS.
const ALPHABETICAL = [
  { value: 'description', label: 'Item description (A–Z)' },
  { value: 'description-desc', label: 'Item description (Z–A)' },
  { value: 'brand', label: 'Brand name (A–Z)' },
]

export const TRANSACTION_SORTS = [{ value: '', label: 'Recent activity' }, ...ALPHABETICAL]
export const ITEM_SORTS = [{ value: '', label: 'Item ID' }, ...ALPHABETICAL]

// The URL value, or '' when it isn't one of `options`.
export function readSort(searchParams, options) {
  const value = searchParams.get('sort') ?? ''
  return options.some((o) => o.value === value) ? value : ''
}
