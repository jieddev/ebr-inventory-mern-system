const mongoose = require('mongoose');

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

// Item categories for Add Item. Items added before categories existed have ''.
const CATEGORIES = [
  'TIRES',
  'TUBES',
  'FLAPS',
  'BATTERIES',
  'OILS & LUBRICANTS',
  'CHEMICALS & FLUIDS',
  'OTHERS',
];

// Trim, collapse inner spaces and uppercase, so "155 R12  arisun " and "155 R12 ARISUN" are the same item.
const normalize = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

const itemSchema = new mongoose.Schema(
  {
    category: { type: String, enum: ['', ...CATEGORIES], default: '' },
    code: { type: String, required: true, maxlength: 80, set: normalize },
    brand: { type: String, default: '', maxlength: 60, set: normalize },
    typeDesign: { type: String, default: '', maxlength: 60, set: normalize },
    balanceForwarded: {
      type: Number,
      default: 0,
      min: 0,
      validate: { validator: Number.isInteger, message: 'Balance forwarded must be a whole number' },
    },

    // Kept in sync by services/balance.service.js. Never set these directly.
    balance: { type: Number, default: 0 },
    transactionCount: { type: Number, default: 0 },
    lastTransactionDate: Date,
    lastTransactionType: { type: String, enum: ['IN', 'OUT'] },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

// One item = ITEM CODE + BRAND NAME + TYPE / DESIGN, the same key the Excel macros use.
// The same code can belong to different items, e.g. "2.25-17" is a STAR tire, a CHAMP tire and an IZUMI tube.
itemSchema.index({ code: 1, brand: 1, typeDesign: 1 }, { unique: true });
itemSchema.index({ lastTransactionDate: -1, updatedAt: -1 });

itemSchema.statics.normalize = normalize;

module.exports = mongoose.model('Item', itemSchema);
module.exports.DEFAULT_TYPES = DEFAULT_TYPES;
module.exports.CATEGORIES = CATEGORIES;
