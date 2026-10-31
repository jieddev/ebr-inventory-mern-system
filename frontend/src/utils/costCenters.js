// The cost centers (branches). Keep in step with backend config/costCenters.js.
export const COST_CENTERS = [
  { value: 'servitek', label: 'Servitek' },
  { value: 'repair-shop', label: 'Repair shop' },
  { value: 'accessory-shop', label: 'Accessory shop' },
]

export const DEFAULT_COST_CENTER = 'servitek'

export const isCostCenter = (value) => COST_CENTERS.some((c) => c.value === value)

export const costCenterLabel = (value) => COST_CENTERS.find((c) => c.value === value)?.label ?? ''
