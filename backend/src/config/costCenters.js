// The cost centers (branches). Each has its own items, transactions, reservations,
// receiving reports and reports. Keep in step with frontend utils/costCenters.js.
const COST_CENTERS = [
  { value: 'warehouse-1', label: 'Warehouse #1' },
  { value: 'servitek', label: 'Servitek (#2 - #7)' },
  { value: 'repair-shop', label: 'Repair shop' },
  { value: 'accessory-shop', label: 'Accessory shop' },
];
const COST_CENTER_VALUES = COST_CENTERS.map((c) => c.value);

// Where data saved before cost centers existed belongs (scripts/migrate-cost-centers.js).
const DEFAULT_COST_CENTER = 'servitek';

const isCostCenter = (value) => COST_CENTER_VALUES.includes(value);
const costCenterLabel = (value) => COST_CENTERS.find((c) => c.value === value)?.label ?? value;

// The label for a download's file name: letters, digits and dashes, words joined by "_".
// "Servitek (#2 - #7)" → "Servitek_2-7", "Warehouse #1" → "Warehouse_1".
const costCenterFileName = (value) =>
  costCenterLabel(value)
    .replace(/\s*-\s*/g, '-')
    .replace(/[^A-Za-z0-9-]+/g, '_')
    .replace(/_?-_?/g, '-')
    .replace(/^_+|_+$/g, '');

module.exports = { COST_CENTERS, COST_CENTER_VALUES, DEFAULT_COST_CENTER, isCostCenter, costCenterLabel, costCenterFileName };
