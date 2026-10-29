import api from './client'
import { saveDownload } from './download'

// Daily Report: every item's ending balance at the end of `date` ("YYYY-MM-DD").
export async function getDailyReport(date, { signal } = {}) {
  const { data } = await api.get('/reports/daily', { params: { date }, signal })
  return data
}

// The Daily Report for `date` as an Excel file, saved by the browser.
export async function exportDailyReport(date) {
  const response = await api.get('/reports/daily/export', { params: { date }, responseType: 'blob' })
  saveDownload(response, `EBR_Daily_Report_${date}.xlsx`)
}
