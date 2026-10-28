const mongoose = require('mongoose');

// Named running numbers, e.g. { _id: 'itemId', seq: 1131 }. See services/itemId.service.js.
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model('Counter', counterSchema);
