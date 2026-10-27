import api from './client'

export async function searchItems(q, { signal } = {}) {
  const { data } = await api.get('/items/search', { params: { q }, signal })
  return data.items
}

export async function getItemTypes() {
  const { data } = await api.get('/items/types')
  return data.types
}

export async function createItem(item) {
  const { data } = await api.post('/items', item)
  return data.item
}

export async function getItemTransactions(itemId) {
  const { data } = await api.get(`/items/${itemId}/transactions`)
  return data
}
