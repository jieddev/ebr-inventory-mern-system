import api from './client'

// costCenters: one or more, required unless role is 'admin' (admins switch between every cost center).
// permissions: see utils/permissions.js; the role's defaults when left out, none for admins.
export async function createUser({ userId, name, password, role, costCenters, permissions }) {
  const { data } = await api.post('/users', { userId, name, password, role, costCenters, permissions })
  return data.user
}

// Every account, for User management.
export async function getUsers({ signal } = {}) {
  const { data } = await api.get('/users', { signal })
  return data.users
}

// Edit user: { costCenters?, permissions?, isActive? }. Only non-admins have cost centers and
// permissions, and admins can't disable themselves. Returns the saved user.
export async function updateUser(id, changes) {
  const { data } = await api.patch(`/users/${id}`, changes)
  return data.user
}
