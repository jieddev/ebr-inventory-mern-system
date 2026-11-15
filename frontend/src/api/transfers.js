import api from './client'

// Stock Transfer: { fromCostCenter, toCostCenter, date, reference, notes, lines: [{ fromItemId, toItemId, quantity }] }.
// Every line becomes an OUT in From and an IN in To (backend transfers.controller.js).
export async function createTransfer(body) {
  const { data } = await api.post('/transfers', body)
  return data.transfer
}
