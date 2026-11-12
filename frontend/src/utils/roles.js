// Same roles as the API (backend models/User.js). admin: everything. warehouse, encoder and accounting:
// what their permissions allow, starting from the role's defaults (utils/permissions.js).
export const ROLE_LABELS = { admin: 'Admin', warehouse: 'Warehouse', encoder: 'Encoder', accounting: 'Accounting' }
