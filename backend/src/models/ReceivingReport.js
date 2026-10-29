const mongoose = require('mongoose');

// Bodega Receiving Report (BRR): the paper receiving slip, entered from Add Transaction's
// "BRR template". Each line is also saved as an IN transaction; this record keeps what the
// transactions have no field for (Ref. No., received by, unit), like the
// workbook's "Receiving Log" sheet.
const LINE_LIMIT = 12; // item lines on the slip
const UNITS = ['pcs', 'sets', 'pairs', 'boxes', 'rolls'];

const lineSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    quantity: { type: Number, required: true, min: 1 },
    unit: { type: String, enum: UNITS, default: 'pcs' },
    transaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
  },
  { _id: false },
);

const receivingReportSchema = new mongoose.Schema(
  {
    // The red number printed on the slip. Optional; digits only.
    reportNo: { type: String, default: '' },
    date: { type: Date, required: true },
    customerName: { type: String, default: '', maxlength: 120 },
    receivedBy: { type: String, default: '', maxlength: 80 },
    lines: {
      type: [lineSchema],
      validate: { validator: (lines) => lines.length >= 1 && lines.length <= LINE_LIMIT, message: `1 to ${LINE_LIMIT} lines` },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

receivingReportSchema.index({ reportNo: 1 });
receivingReportSchema.index({ date: -1 });
// Finds the report a transaction came from (transaction details panel).
receivingReportSchema.index({ 'lines.transaction': 1 });

module.exports = mongoose.model('ReceivingReport', receivingReportSchema);
module.exports.LINE_LIMIT = LINE_LIMIT;
module.exports.UNITS = UNITS;
