import api from './client'

// The dashboard's numbers for the current cost center. Sections the user can't see are null.
export async function getDashboard({ signal } = {}) {
  const { data } = await api.get('/dashboard', { signal })
  return data
}
