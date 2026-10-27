import api from './client'

export async function createUser({ userId, name, password, role }) {
  const { data } = await api.post('/users', { userId, name, password, role })
  return data.user
}
