import api from './client'

// costCenter: required unless role is 'admin' (admins switch between every cost center).
// permissions: see utils/permissions.js; the role's defaults when left out, none for admins.
export async function createUser({ userId, name, password, role, costCenter, permissions }) {
  const { data } = await api.post('/users', { userId, name, password, role, costCenter, permissions })
  return data.user
}

// Every account, for User management.
export async function getUsers({ signal } = {}) {
  const { data } = await api.get('/users', { signal })
  return data.users
}

// Edit user: { costCenter?, permissions?, isActive? }. Only warehouse users and encoders have
// a cost center and permissions, and admins can't disable themselves. Returns the saved user.
export async function updateUser(id, changes) {
  const { data } = await api.patch(`/users/${id}`, changes)
  return data.user
}
