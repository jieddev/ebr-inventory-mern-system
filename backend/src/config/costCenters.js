// The cost centers (branches). Each has its own items, transactions, reservations,
// receiving reports and reports. Keep in step with frontend utils/costCenters.js.
const COST_CENTERS = [
  { value: 'servitek', label: 'Servitek' },
  { value: 'repair-shop', label: 'Repair shop' },
  { value: 'accessory-shop', label: 'Accessory shop' },
];
const COST_CENTER_VALUES = COST_CENTERS.map((c) => c.value);

// Where data saved before cost centers existed belongs (scripts/migrate-cost-centers.js).
const DEFAULT_COST_CENTER = 'servitek';

const isCostCenter = (value) => COST_CENTER_VALUES.includes(value);
const costCenterLabel = (value) => COST_CENTERS.find((c) => c.value === value)?.label ?? value;

module.exports = { COST_CENTERS, COST_CENTER_VALUES, DEFAULT_COST_CENTER, isCostCenter, costCenterLabel };
