// The ?sort= choices of the Transactions and Items pages. '' is each page's own default order.
// Keep in step with backend utils/filters.js SORTS.
const SORT_CHOICES = [
  { value: 'description', label: 'Item description (A–Z)' },
  { value: 'description-desc', label: 'Item description (Z–A)' },
  { value: 'brand', label: 'Brand name (A–Z)' },
  { value: 'added-desc', label: 'Date added (newest first)' },
  { value: 'added', label: 'Date added (oldest first)' },
]

export const TRANSACTION_SORTS = [{ value: '', label: 'Recent activity' }, ...SORT_CHOICES]
export const ITEM_SORTS = [{ value: '', label: 'Item ID' }, ...SORT_CHOICES]

// The URL value, or '' when it isn't one of `options`.
export function readSort(searchParams, options) {
  const value = searchParams.get('sort') ?? ''
  return options.some((o) => o.value === value) ? value : ''
}
