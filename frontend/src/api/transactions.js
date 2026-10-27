import api from './client'

export async function getTransactions({ search, page, limit } = {}, { signal } = {}) {
  const { data } = await api.get('/transactions', { params: { search: search || undefined, page, limit }, signal })
  return data
}

export async function createTransaction(transaction) {
  const { data } = await api.post('/transactions', transaction)
  return data
}
