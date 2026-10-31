import axios from 'axios'

// Identifies this browser tab, so live announcements about its own saves can be skipped.
// (crypto.randomUUID only exists on HTTPS or localhost, and other PCs use plain http.)
export const CLIENT_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

// In dev, Vite proxies /api to the backend (see vite.config.js).
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  headers: { 'X-Client-Id': CLIENT_ID },
  // Lists go out as repeated keys (?brand=A&brand=B), which Express reads as an array.
  paramsSerializer: { indexes: null },
})

// The cost center the pages show (features/costCenter/CostCenterProvider.jsx). The server
// only follows it for admins; everyone else always gets their own cost center.
let costCenter = null

export function setRequestCostCenter(value) {
  costCenter = value
}

export function getRequestCostCenter() {
  return costCenter
}

api.interceptors.request.use((config) => {
  if (costCenter) config.headers['X-Cost-Center'] = costCenter
  return config
})

// Drops empty strings and empty lists, so they don't show up in the query string.
export function cleanParams(params) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => (Array.isArray(value) ? value.length : value !== '' && value != null)),
  )
}

export default api
