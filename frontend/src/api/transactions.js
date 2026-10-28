import api, { cleanParams } from './client'

// filters: see utils/filters.js. Empty values are left out of the query string.
export async function getTransactions({ search, page, limit, filters } = {}, { signal } = {}) {
  const params = cleanParams({ search, page, limit, ...filters })
  const { data } = await api.get('/transactions', { params, signal })
  return data
}

export async function createTransaction(transaction) {
  const { data } = await api.post('/transactions', transaction)
  return data
}
