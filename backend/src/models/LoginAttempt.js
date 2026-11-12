const mongoose = require('mongoose');

// How long a counter is kept after its last failed login. Then it starts over (services/loginThrottle.service.js).
const FORGET_AFTER_SECONDS = 24 * 60 * 60;

// Failed login counters, one per username ("user:<id>") and one per computer ("ip:<address>").
const loginAttemptSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    // Failed logins since the last lockout (or success).
    failures: { type: Number, default: 0 },
    // Lockouts so far; each one is longer than the last.
    lockouts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

loginAttemptSchema.index({ updatedAt: 1 }, { expireAfterSeconds: FORGET_AFTER_SECONDS });

module.exports = mongoose.model('LoginAttempt', loginAttemptSchema);
