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

// Drops empty strings and empty lists, so they don't show up in the query string.
export function cleanParams(params) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => (Array.isArray(value) ? value.length : value !== '' && value != null)),
  )
}

export default api
