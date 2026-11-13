const mongoose = require('mongoose');

const BALANCE_FORWARDED = 'BALANCE FORWARDED';

// IN adds stock. OUT removes it. RESERVE holds stock for a customer: it deducts like OUT
// until it is confirmed out (becomes OUT) or cancelled (deleted). ADJUST is a physical count
// (Adjust to Count, admins only): it sets the balance to what was counted (see balance.service.js).
const TYPES = ['IN', 'OUT', 'RESERVE', 'ADJUST'];
// The types Add Transaction can enter.
const ENTRY_TYPES = ['IN', 'OUT', 'RESERVE'];

const transactionSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    // Calendar day only, stored as UTC midnight.
    date: { type: Date, required: true },
    type: { type: String, enum: TYPES, required: true },
    // For ADJUST, the size of the change the count made (kept by balance.service.js); it can be 0.
    quantity: {
      type: Number,
      required: true,
      validate: [
        { validator: Number.isInteger, message: 'Quantity must be a whole number' },
        {
          validator(value) {
            return value >= (this.type === 'ADJUST' ? 0 : 1);
          },
          message: 'Quantity must be at least 1',
        },
      ],
    },
    // ADJUST only: the physical count entered, and the signed change it made to the balance
    // (counted − balance before it). adjustment is kept by balance.service.js.
    countedQuantity: {
      type: Number,
      min: [0, 'Physical count cannot be negative'],
      validate: { validator: Number.isInteger, message: 'Physical count must be a whole number' },
    },
    adjustment: Number,
    customerName: { type: String, default: '', trim: true, maxlength: 120 },
    // Reservations only: when the customer will pick it up (calendar day) and free-text notes.
    neededBy: Date,
    notes: { type: String, default: '', trim: true, maxlength: 300 },
    // Set when a reservation is confirmed out.
    releasedAt: Date,
    releasedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // The opening stock entry created by Add Item. It always comes first in the item's ledger.
    isBalanceForwarded: { type: Boolean, default: false },
    // Item balance right after this entry. Recalculated by services/balance.service.js.
    endingBalance: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

// Ledger order for one item: balance forwarded first, then by date, then by entry order.
transactionSchema.index({ item: 1, isBalanceForwarded: -1, date: 1, _id: 1 });
transactionSchema.index({ date: 1 });

// The BALANCE FORWARDED entry's type and quantity for an opening balance: IN for stock on hand,
// OUT for a negative opening balance (quantity is always 1 or more). Call only with a balance other than 0.
const openingEntry = (balance) => ({ type: balance > 0 ? 'IN' : 'OUT', quantity: Math.abs(balance) });

module.exports = mongoose.model('Transaction', transactionSchema);
module.exports.BALANCE_FORWARDED = BALANCE_FORWARDED;
module.exports.TYPES = TYPES;
module.exports.ENTRY_TYPES = ENTRY_TYPES;
module.exports.openingEntry = openingEntry;
module.exports.LEDGER_ORDER = { isBalanceForwarded: -1, date: 1, _id: 1 };
