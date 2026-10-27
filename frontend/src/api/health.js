import api from './client'

export async function getHealth() {
  // 503 still carries a useful body (db status), so don't treat it as an error.
  const { data } = await api.get('/health', { validateStatus: (s) => s < 600 })
  return data
}
