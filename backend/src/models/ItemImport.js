const mongoose = require('mongoose');
const { COST_CENTER_VALUES } = require('../config/costCenters');

// One Excel import that added items, so the newest one can be undone (items.controller.js undoImport).
// Imports that added nothing aren't saved. Kept after an undo, with undoneAt set.
const itemImportSchema = new mongoose.Schema(
  {
    costCenter: { type: String, enum: COST_CENTER_VALUES, required: true },
    fileName: { type: String, default: '' },
    // The day the opening balances are dated.
    asOf: Date,
    // The items the import added.
    items: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Item' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    undoneAt: { type: Date, default: null },
    undoneBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

itemImportSchema.index({ costCenter: 1, undoneAt: 1, createdAt: -1 });

module.exports = mongoose.model('ItemImport', itemImportSchema);
