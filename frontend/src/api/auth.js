import api from './client'

export async function login(userId, password) {
  const { data } = await api.post('/auth/login', { userId, password })
  return data.user
}

export async function logout() {
  await api.post('/auth/logout')
}

export async function getCurrentUser() {
  const { data } = await api.get('/auth/me')
  return data.user
}

export function getErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (!err.response) return 'Cannot reach the server. Check that the API is running.'
  return err.response.data?.message || fallback
}
