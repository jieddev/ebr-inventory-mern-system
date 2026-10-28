import api from './client'

export async function getItems({ search, category, page, limit } = {}, { signal } = {}) {
  const { data } = await api.get('/items', {
    params: { search: search || undefined, category: category || undefined, page, limit },
    signal,
  })
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

export async function getItemTransactions(itemId) {
  const { data } = await api.get(`/items/${itemId}/transactions`)
  return data
}
