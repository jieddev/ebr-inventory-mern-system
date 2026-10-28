import api, { cleanParams } from './client'

// filters: see utils/filters.js (the item filters: stock, category, typeDesign, brand).
// archived: true lists the archived items instead.
export async function getItems({ search, page, limit, filters, archived } = {}, { signal } = {}) {
  const params = cleanParams({ search, page, limit, archived: archived ? '1' : '', ...filters })
  const { data } = await api.get('/items', { params, signal })
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

// Edit Item (admin): category, code, brand, typeDesign, balanceForwarded.
export async function updateItem(itemId, fields) {
  const { data } = await api.patch(`/items/${itemId}`, fields)
  return data.item
}

// "Delete" archives the item: hidden everywhere, history kept, can be restored.
export async function archiveItem(itemId) {
  const { data } = await api.delete(`/items/${itemId}`)
  return data.item
}

// Archive or restore many items: { ids } for picked items, or { all: true, query } for every
// item matching the Items page's search and filters. Returns how many changed.
export async function batchItems(action, { ids, all, query } = {}) {
  const { data } = await api.post('/items/batch', all ? { action, all: true, query } : { action, ids })
  return data.count
}

export async function restoreItem(itemId) {
  const { data } = await api.post(`/items/${itemId}/restore`)
  return data.item
}

// entryFilters ({ type, from, to }) limit the ledger to matching entries.
export async function getItemTransactions(itemId, entryFilters = {}) {
  const { data } = await api.get(`/items/${itemId}/transactions`, { params: cleanParams(entryFilters) })
  return data
}
