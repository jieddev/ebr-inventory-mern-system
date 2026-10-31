const mongoose = require('mongoose');

// Every action an audit log entry can record. See services/audit.service.js.
const ACTIONS = [
  'auth.login',
  'auth.login_failed',
  'auth.logout',
  'user.create',
  'item.create',
  'item.update',
  'item.archive',
  'item.restore',
  'item.batch_archive',
  'item.batch_restore',
  'item.import',
  'item.export',
  'transaction.create',
  'transaction.release',
  'transaction.cancel',
  'transaction.rollback',
  'receiving.create',
  'report.export',
];

// How long entries are kept. Changing it also updates an existing database's TTL index
// at startup (services/audit.service.js syncAuditRetention).
const RETENTION_SECONDS = 30 * 24 * 60 * 60; // 30 days

// Who did what, to what, and when. Append-only: entries are never edited or deleted
// by the app; MongoDB removes them after RETENTION_SECONDS (TTL index below).
const auditLogSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    action: { type: String, enum: ACTIONS, required: true },
    // A copy of the user at the time, so the entry stays readable if they're renamed.
    // Empty for failed logins (the attempted ID is in details).
    actor: {
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      userId: String,
      name: String,
      role: String,
    },
    target: {
      type: { type: String, enum: ['item', 'user', 'transaction', 'receiving'] },
      id: mongoose.Schema.Types.ObjectId,
      label: String,
    },
    // Edits: { field: { from, to } } for the fields that changed.
    changes: mongoose.Schema.Types.Mixed,
    details: mongoose.Schema.Types.Mixed,
    ip: String,
    userAgent: String,
  },
  { versionKey: false },
);

auditLogSchema.index({ action: 1, at: -1 });
auditLogSchema.index({ 'actor.user': 1, at: -1 });
auditLogSchema.index({ 'target.id': 1, at: -1 });
auditLogSchema.index({ at: 1 }, { expireAfterSeconds: RETENTION_SECONDS });

// Append-only. (TTL expiry runs inside MongoDB, so it isn't blocked by this.)
const WRITE_OPS = [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'replaceOne',
  'findOneAndReplace',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
];
auditLogSchema.pre(WRITE_OPS, { document: true, query: true }, function refuse() {
  throw new Error('Audit log entries cannot be changed or deleted');
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
module.exports.ACTIONS = ACTIONS;
module.exports.RETENTION_SECONDS = RETENTION_SECONDS;
