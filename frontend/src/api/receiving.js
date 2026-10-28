import api from './client'

// Has this Ref. No. been saved before? Returns { savedAt } or null.
export async function checkReportNo(reportNo) {
  const { data } = await api.get('/receiving-reports/check', { params: { reportNo } })
  return data.existing
}

// Bodega Receiving Report: { date, origin, customerName, receivedBy, reportNo,
// lines: [{ itemId, quantity, unit }], allowDuplicate }. Every line is saved as IN.
export async function createReceivingReport(report) {
  const { data } = await api.post('/receiving-reports', report)
  return data
}
