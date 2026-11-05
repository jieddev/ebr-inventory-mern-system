import api from './client'

// Has this Ref. No. been saved before on a slip of this kind ('IN' | 'OUT')? Returns { savedAt } or null.
export async function checkReportNo(reportNo, kind = 'IN') {
  const { data } = await api.get('/receiving-reports/check', { params: { reportNo, kind } })
  return data.existing
}

// Bodega Receiving Report: { date, origin, customerName, receivedBy, reportNo,
// lines: [{ itemId, quantity, unit }], allowDuplicate }. Every line is saved as IN.
export async function createReceivingReport(report) {
  const { data } = await api.post('/receiving-reports', report)
  return data
}

// Batch Out slip: { date, customerName, releasedBy, reportNo, lines, allowDuplicate }.
// Every line is saved as OUT.
export async function createBatchOut(slip) {
  const { data } = await api.post('/receiving-reports/out', slip)
  return data
}
