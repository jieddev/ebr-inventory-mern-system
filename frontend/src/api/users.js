import api from './client'

// costCenter: required unless role is 'admin' (admins switch between every cost center).
export async function createUser({ userId, name, password, role, costCenter }) {
  const { data } = await api.post('/users', { userId, name, password, role, costCenter })
  return data.user
}

// Every account, for User management.
export async function getUsers({ signal } = {}) {
  const { data } = await api.get('/users', { signal })
  return data.users
}

// Moves a warehouse user or encoder to another cost center. Returns the saved user.
export async function setUserCostCenter(id, costCenter) {
  const { data } = await api.patch(`/users/${id}`, { costCenter })
  return data.user
}
