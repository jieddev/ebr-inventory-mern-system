import api, { cleanParams } from './client'

// Admin Activity page. group: auth | item | transaction | user. from / to: "YYYY-MM-DD".
export async function getAuditLog({ group, user, from, to, search, page, limit } = {}, { signal } = {}) {
  const { data } = await api.get('/audit', { params: cleanParams({ group, user, from, to, search, page, limit }), signal })
  return data
}
