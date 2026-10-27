const mongoose = require('mongoose');

const BALANCE_FORWARDED = 'BALANCE FORWARDED';

const transactionSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    // Calendar day only, stored as UTC midnight.
    date: { type: Date, required: true },
    type: { type: String, enum: ['IN', 'OUT'], required: true },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Quantity must be at least 1'],
      validate: { validator: Number.isInteger, message: 'Quantity must be a whole number' },
    },
    customerName: { type: String, default: '', trim: true, maxlength: 120 },
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

module.exports = mongoose.model('Transaction', transactionSchema);
module.exports.BALANCE_FORWARDED = BALANCE_FORWARDED;
module.exports.LEDGER_ORDER = { isBalanceForwarded: -1, date: 1, _id: 1 };
