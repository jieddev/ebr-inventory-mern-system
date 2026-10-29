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

// One entry for the details panel: { transaction, receiving }.
export async function getTransaction(id, { signal } = {}) {
  const { data } = await api.get(`/transactions/${id}`, { signal })
  return data
}

// Confirms a reservation is out: it becomes OUT on `date` ("YYYY-MM-DD"). { transaction, item }.
export async function releaseReservation(id, date) {
  const { data } = await api.post(`/transactions/${id}/release`, { date })
  return data
}

// Cancels a reservation; its stock goes back. { item }.
export async function cancelReservation(id) {
  const { data } = await api.delete(`/transactions/${id}`)
  return data
}

// Pending reservations for the Reservations page: { reservations, counts, today }.
// due: '' | 'overdue' | 'today' | 'upcoming'.
export async function getReservations({ search, due } = {}, { signal } = {}) {
  const { data } = await api.get('/transactions/reservations', { params: cleanParams({ search, due }), signal })
  return data
}

// { pending, overdue } for the sidebar badge.
export async function getReservationCounts({ signal } = {}) {
  const { data } = await api.get('/transactions/reservations/count', { signal })
  return data
}
