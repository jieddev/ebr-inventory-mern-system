// The cost centers (branches). Keep in step with backend config/costCenters.js.
export const COST_CENTERS = [
  { value: 'warehouse-1', label: 'Warehouse #1' },
  { value: 'servitek', label: 'Servitek (#2 - #7)' },
  { value: 'repair-shop', label: 'Repair shop' },
  { value: 'accessory-shop', label: 'Accessory shop' },
]

export const DEFAULT_COST_CENTER = 'servitek'

export const isCostCenter = (value) => COST_CENTERS.some((c) => c.value === value)

export const costCenterLabel = (value) => COST_CENTERS.find((c) => c.value === value)?.label ?? ''

// The cost centers a user may work in. Admins: every one. Everyone else: the ones an admin
// assigned (costCenters), or the single costCenter on accounts saved before that.
// Keep in step with backend config/costCenters.js.
export function userCostCenters(user) {
  if (!user) return []
  if (user.role === 'admin') return COST_CENTERS.map((c) => c.value)
  if (user.costCenters?.length) return COST_CENTERS.map((c) => c.value).filter((value) => user.costCenters.includes(value))
  return isCostCenter(user.costCenter) ? [user.costCenter] : []
}
