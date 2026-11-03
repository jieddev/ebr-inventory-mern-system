// What a warehouse user or encoder may do, ticked per account on User management. Admins can
// do everything. Keep in step with backend config/permissions.js.
// short: for User management rows and the Activity log.
export const PERMISSIONS = [
  {
    value: 'addTransactions',
    label: 'Allow user to add transactions',
    short: 'Add transactions',
    hint: 'Transactions, Reservations and receiving reports',
  },
  { value: 'viewDailyReport', label: 'Allow user to view the daily report', short: 'Daily report' },
  { value: 'viewItems', label: 'Allow user to open the Items page', short: 'Items page' },
  {
    value: 'viewItemStock',
    label: 'Allow user to see stock details on the Items page',
    short: 'Item stock details',
    hint: 'Stock filter and last transaction',
  },
  { value: 'addItems', label: 'Allow user to add items', short: 'Add items' },
]

// Ticked when an admin picks the role; the admin can change them after.
export const ROLE_DEFAULTS = {
  admin: [],
  warehouse: ['addTransactions', 'viewDailyReport', 'addItems'],
  encoder: ['viewItems', 'addItems'],
}

export const permissionsOf = (user) => user.permissions ?? ROLE_DEFAULTS[user.role] ?? []

export function can(user, permission) {
  if (!user) return false
  if (user.role === 'admin') return true
  return permissionsOf(user).includes(permission)
}

export const permissionShortLabel = (value) => PERMISSIONS.find((p) => p.value === value)?.short ?? value
