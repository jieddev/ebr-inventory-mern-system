const mongoose = require('mongoose');
const { COST_CENTER_VALUES, DEFAULT_COST_CENTER } = require('../config/costCenters');

// A batch slip entered from Add Transaction: the Bodega Receiving Report (BRR template, kind IN)
// or a Batch Out slip (kind OUT). Each line is also saved as an IN or OUT transaction; this record
// keeps what the transactions have no field for (Ref. No., received / released by, unit), like the
// workbook's "Receiving Log" sheet. Slips saved before Batch Out existed have no kind: they're IN.
const KINDS = ['IN', 'OUT'];
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
    costCenter: { type: String, enum: COST_CENTER_VALUES, required: true, default: DEFAULT_COST_CENTER },
    // The red number printed on the slip. Optional; digits only.
    reportNo: { type: String, default: '' },
    date: { type: Date, required: true },
    customerName: { type: String, default: '', maxlength: 120 },
    lines: {
      type: [lineSchema],
      validate: { validator: (lines) => lines.length >= 1 && lines.length <= LINE_LIMIT, message: `1 to ${LINE_LIMIT} lines` },
    },
    kind: { type: String, enum: KINDS, default: 'IN' },
    receivedBy: { type: String, default: '', maxlength: 80 }, // IN slips
    releasedBy: { type: String, default: '', maxlength: 80 }, // OUT slips
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

receivingReportSchema.index({ costCenter: 1, reportNo: 1 });
receivingReportSchema.index({ date: -1 });
// Finds the report a transaction came from (transaction details panel).
receivingReportSchema.index({ 'lines.transaction': 1 });

module.exports = mongoose.model('ReceivingReport', receivingReportSchema);
module.exports.LINE_LIMIT = LINE_LIMIT;
module.exports.UNITS = UNITS;
module.exports.KINDS = KINDS;
// Slips of one kind; IN also matches slips saved before kinds existed.
module.exports.kindFilter = (kind) => (kind === 'OUT' ? { kind: 'OUT' } : { kind: { $ne: 'OUT' } });
