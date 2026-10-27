import axios from 'axios'

// In dev, Vite proxies /api to the backend (see vite.config.js).
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
})

export default api
