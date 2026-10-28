import api, { cleanParams } from './client'

// Admin Activity page. type and user are lists (see features/audit/activityFilters.js);
// from / to: "YYYY-MM-DD".
export async function getAuditLog({ type, user, from, to, search, page, limit } = {}, { signal } = {}) {
  const { data } = await api.get('/audit', { params: cleanParams({ type, user, from, to, search, page, limit }), signal })
  return data
}

// Choices and counts for the Activity filter dropdown.
export async function getAuditFacets() {
  const { data } = await api.get('/audit/facets')
  return data
}
