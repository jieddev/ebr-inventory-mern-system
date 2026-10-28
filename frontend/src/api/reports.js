import api from './client'

// Daily Report: every item's ending balance at the end of `date` ("YYYY-MM-DD").
export async function getDailyReport(date, { signal } = {}) {
  const { data } = await api.get('/reports/daily', { params: { date }, signal })
  return data
}
