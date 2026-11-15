const mongoose = require('mongoose');
const { COST_CENTER_VALUES } = require('../config/costCenters');
const { LINE_LIMIT } = require('./ReceivingReport');

// Stock moved from one cost center to another (Stock Transfer on the Transactions page).
// Each line is saved as two linked transactions: an OUT on the From item (in fromCostCenter) and
// an IN on the To item (in toCostCenter), both pointing back here with `transfer`. Rolling back
// either one removes both, and a new date goes on both (transactions.controller.js). Each side has
// its own quantity (e.g. 1 box out, 12 pcs in), and editing one side's quantity changes only that side.
const lineSchema = new mongoose.Schema(
  {
    fromItem: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    toItem: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    // Always set on new lines (transfers.controller.js); not required, so older lines with only
    // `quantity` still save when the transfer changes.
    outQuantity: { type: Number, min: 1 }, // deducted from fromItem
    inQuantity: { type: Number, min: 1 }, // added to toItem
    // Lines saved before outQuantity / inQuantity: one quantity for both sides. See lineQuantities().
    quantity: { type: Number, min: 1 },
    outTransaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    inTransaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
  },
  { _id: false },
);

const stockTransferSchema = new mongoose.Schema(
  {
    fromCostCenter: { type: String, enum: COST_CENTER_VALUES, required: true },
    toCostCenter: { type: String, enum: COST_CENTER_VALUES, required: true },
    date: { type: Date, required: true },
    // An optional slip / reference number, digits only.
    reference: { type: String, default: '' },
    notes: { type: String, default: '', trim: true, maxlength: 300 },
    lines: {
      type: [lineSchema],
      validate: { validator: (lines) => lines.length >= 1 && lines.length <= LINE_LIMIT, message: `1 to ${LINE_LIMIT} lines` },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

stockTransferSchema.index({ 'lines.outTransaction': 1 });
stockTransferSchema.index({ 'lines.inTransaction': 1 });
stockTransferSchema.index({ date: -1 });

// The line holding a transaction, and which side of it the transaction is.
stockTransferSchema.methods.lineOf = function lineOf(transactionId) {
  const id = String(transactionId);
  const index = this.lines.findIndex((l) => String(l.outTransaction) === id || String(l.inTransaction) === id);
  if (index < 0) return null;
  const line = this.lines[index];
  return { index, line, side: String(line.outTransaction) === id ? 'OUT' : 'IN' };
};

// A line's two quantities, also for lines saved with a single quantity.
const lineQuantities = (line) => ({ out: line.outQuantity ?? line.quantity, in: line.inQuantity ?? line.quantity });

module.exports = mongoose.model('StockTransfer', stockTransferSchema);
module.exports.LINE_LIMIT = LINE_LIMIT;
module.exports.lineQuantities = lineQuantities;
