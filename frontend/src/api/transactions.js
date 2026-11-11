import api, { cleanParams } from './client'

// filters: see utils/filters.js; sort: see utils/sorts.js. Empty values are left out of the query string.
export async function getTransactions({ search, page, limit, filters, sort } = {}, { signal } = {}) {
  const params = cleanParams({ search, page, limit, sort, ...filters })
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

// Admin: removes the entry as if it was never recorded; the item's balance is recalculated. { item }.
export async function rollbackTransaction(id) {
  const { data } = await api.post(`/transactions/${id}/rollback`)
  return data
}

// Admin: corrects an entry in place (date, type, quantity, customerName, neededBy, notes; only
// the fields given change). The item's balance is recalculated. { transaction, item }.
export async function updateTransaction(id, changes) {
  const { data } = await api.patch(`/transactions/${id}`, changes)
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
