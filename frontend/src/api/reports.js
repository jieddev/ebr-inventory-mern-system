import api, { cleanParams } from './client'
import { saveDownload } from './download'

// Daily Report: every item's ending balance at the end of `to` ("YYYY-MM-DD"), and for a range
// (from < to) its beginning balance when `from` starts.
export async function getDailyReport({ from, to }, { signal } = {}) {
  const { data } = await api.get('/reports/daily', { params: { from, to }, signal })
  return data
}

// The Daily Report as an Excel file, saved by the browser.
export async function exportDailyReport({ from, to }) {
  const response = await api.get('/reports/daily/export', { params: { from, to }, responseType: 'blob' })
  saveDownload(response, `EBR_Daily_Report_${from === to ? to : `${from}_to_${to}`}.xlsx`)
}

// Transaction Report: IN and OUT totals per item from `from` to `to` ("YYYY-MM-DD", both included).
export async function getTransactionReport({ from, to }, { signal } = {}) {
  const { data } = await api.get('/reports/transactions', { params: { from, to }, signal })
  return data
}

// The Transaction Report as an Excel file, saved by the browser.
export async function exportTransactionReport({ from, to }) {
  const response = await api.get('/reports/transactions/export', { params: { from, to }, responseType: 'blob' })
  saveDownload(response, `EBR_Transaction_Report_${from === to ? from : `${from}_to_${to}`}.xlsx`)
}

// Stockcard: every item's transactions from `from` to `to` ("YYYY-MM-DD", both included) as an
// Excel file, saved by the browser.
export async function exportStockcard({ from, to }) {
  const response = await api.get('/reports/stockcard/export', { params: { from, to }, responseType: 'blob' })
  saveDownload(response, `EBR_Stockcard_${from === to ? from : `${from}_to_${to}`}.xlsx`)
}

// Reconcile: one item's transactions, oldest first. from / to ("YYYY-MM-DD") are optional.
export async function getReconcile(itemId, { from, to } = {}, { signal } = {}) {
  const { data } = await api.get(`/reports/reconcile/${itemId}`, { params: cleanParams({ from, to }), signal })
  return data
}

// The item's transactions as an Excel file, saved by the browser.
export async function exportReconcile(itemId, { from, to } = {}) {
  const response = await api.get(`/reports/reconcile/${itemId}/export`, {
    params: cleanParams({ from, to }),
    responseType: 'blob',
  })
  saveDownload(response, 'EBR_Reconcile.xlsx')
}
