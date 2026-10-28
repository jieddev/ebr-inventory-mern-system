import api, { cleanParams } from './client'

// filters: see utils/filters.js (the item filters: stock, category, typeDesign, brand).
export async function getItems({ search, page, limit, filters } = {}, { signal } = {}) {
  const { data } = await api.get('/items', { params: cleanParams({ search, page, limit, ...filters }), signal })
  return data
}

// Choices and counts for the filter dropdown.
export async function getItemFacets() {
  const { data } = await api.get('/items/facets')
  return data
}

// Sends the Excel file as the raw request body.
export async function importItems(file) {
  const { data } = await api.post('/items/import', file, {
    headers: { 'Content-Type': 'application/octet-stream' },
  })
  return data
}

// Downloads every item as an Excel file.
export async function exportItems() {
  const response = await api.get('/items/export', { responseType: 'blob' })
  const filename = /filename="?([^";]+)"?/.exec(response.headers['content-disposition'] ?? '')?.[1] ?? 'EBR_Items.xlsx'
  const url = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export async function searchItems(q, { signal } = {}) {
  const { data } = await api.get('/items/search', { params: { q }, signal })
  return data.items
}

export async function getItemTypes() {
  const { data } = await api.get('/items/types')
  return data.types
}

export async function getItemCategories() {
  const { data } = await api.get('/items/categories')
  return data.categories
}

export async function createItem(item) {
  const { data } = await api.post('/items', item)
  return data.item
}

// entryFilters ({ type, from, to }) limit the ledger to matching entries.
export async function getItemTransactions(itemId, entryFilters = {}) {
  const { data } = await api.get(`/items/${itemId}/transactions`, { params: cleanParams(entryFilters) })
  return data
}
