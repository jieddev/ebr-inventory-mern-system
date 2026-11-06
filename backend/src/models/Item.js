const mongoose = require('mongoose');
const { COST_CENTER_VALUES, DEFAULT_COST_CENTER } = require('../config/costCenters');

// Type / Design values used in the Excel workbook. New ones can still be typed in.
const DEFAULT_TYPES = [
  'BATTERY',
  'BOSCH',
  'BRAKE FLUID',
  'CHEMICAL',
  'COOLANT',
  'FLAP',
  'GAS',
  'GULF',
  'OIL',
  'OTHERS',
  'TIRE',
  'TUBE',
];

// Brand names offered in Add Item and Edit Item, with the brands already used in the cost center.
// Other brands can still be typed in.
const DEFAULT_BRANDS = [
  'GOODYEAR',
  'AMS',
  'GULF',
  'PRESTONE',
  'MOTUL',
  'BOSCH',
  'VS1',
  'MOTOTEK',
  'MOTOLUBE',
  'MOBIL',
  'TOTAL',
];

// Item categories for Add Item. Items added before categories existed have ''.
const CATEGORIES = [
  'TIRES',
  'MOTORCYCLE TIRES',
  'RECAP TIRES',
  'TUBES',
  'FLAPS',
  'BATTERIES',
  'JUNK BATTERIES',
  'OIL',
  'LUBRICANT',
  'CHEMICAL',
  'FLUID',
  'GASES',
  'WELDING ROD',
  'PARTS & ACCESSORIES',
  'BOSCH PRODUCT',
  'SERVICES',
  'OTHERS',
];

// Trim, collapse inner spaces and uppercase, so "155 R12  arisun " and "155 R12 ARISUN" are the same item.
const normalize = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

const itemSchema = new mongoose.Schema(
  {
    // The cost center the item (and so its ledger) belongs to. Set when the item is added; never changes.
    costCenter: { type: String, enum: COST_CENTER_VALUES, required: true, default: DEFAULT_COST_CENTER },
    // Permanent, human-readable ID such as ITM-00001, unique across all cost centers.
    // Set by services/itemId.service.js.
    itemId: { type: String },
    category: { type: String, enum: ['', ...CATEGORIES], default: '' },
    code: { type: String, required: true, maxlength: 80, set: normalize },
    brand: { type: String, default: '', maxlength: 60, set: normalize },
    typeDesign: { type: String, default: '', maxlength: 60, set: normalize },
    // The opening stock. Can be negative (more went out than was on hand), as in the Excel sheet.
    balanceForwarded: {
      type: Number,
      default: 0,
      validate: { validator: Number.isInteger, message: 'Balance forwarded must be a whole number' },
    },

    // Kept in sync by services/balance.service.js. Never set these directly.
    balance: { type: Number, default: 0 },
    transactionCount: { type: Number, default: 0 },
    lastTransactionDate: Date,
    lastTransactionType: { type: String, enum: ['IN', 'OUT', 'RESERVE'] },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Set when an admin archives ("deletes") the item. Archived items are hidden from every
    // list and can't get new transactions, but keep their ledger and item ID.
    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

// One item = ITEM CODE + BRAND NAME + TYPE / DESIGN in a cost center, the same key the Excel macros use.
// The same code can belong to different items, e.g. "2.25-17" is a STAR tire, a CHAMP tire and an IZUMI tube,
// and each cost center can have its own item with the same key.
itemSchema.index({ costCenter: 1, code: 1, brand: 1, typeDesign: 1 }, { unique: true });
itemSchema.index({ costCenter: 1, lastTransactionDate: -1, updatedAt: -1 });
itemSchema.index({ costCenter: 1, itemId: 1 });
// Sparse, so items saved before IDs existed don't clash until the startup backfill runs.
itemSchema.index({ itemId: 1 }, { unique: true, sparse: true });

itemSchema.statics.normalize = normalize;

// Not archived. Also matches items saved before archiving existed (no archivedAt field).
const ACTIVE = { archivedAt: null };

module.exports = mongoose.model('Item', itemSchema);
module.exports.DEFAULT_TYPES = DEFAULT_TYPES;
module.exports.DEFAULT_BRANDS = DEFAULT_BRANDS;
module.exports.CATEGORIES = CATEGORIES;
module.exports.ACTIVE = ACTIVE;
