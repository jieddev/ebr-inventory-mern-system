// What a warehouse user or encoder may do, ticked per account on User management. Admins can
// do everything and have none stored. Keep in step with frontend utils/permissions.js.
const PERMISSIONS = [
  { value: 'addTransactions', label: 'Allow user to add transactions' },
  { value: 'viewDailyReport', label: 'Allow user to view the daily report' },
  { value: 'viewTransactionReport', label: 'Allow user to view the transaction report' },
  { value: 'viewItems', label: 'Allow user to open the Items page' },
  { value: 'viewItemStock', label: 'Allow user to see stock details (stock filter, last transaction) on the Items page' },
  { value: 'addItems', label: 'Allow user to add items' },
  { value: 'reconcile', label: 'Allow user to reconcile items and export their transactions' },
];
const PERMISSION_VALUES = PERMISSIONS.map((p) => p.value);

// Ticked when an admin picks the role; the admin can change them after.
const ROLE_DEFAULTS = {
  admin: [],
  warehouse: ['addTransactions', 'viewDailyReport', 'viewTransactionReport', 'addItems'],
  encoder: ['viewItems', 'addItems'],
  accounting: ['reconcile'],
};

const defaultPermissions = (role) => [...(ROLE_DEFAULTS[role] ?? [])];
const isPermission = (value) => PERMISSION_VALUES.includes(value);

// Accounts saved before permissions existed have none stored and get their role's defaults
// (until scripts/migrate-permissions.js runs).
function can(user, permission) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return (user.permissions ?? defaultPermissions(user.role)).includes(permission);
}

module.exports = { PERMISSION_VALUES, defaultPermissions, isPermission, can };
