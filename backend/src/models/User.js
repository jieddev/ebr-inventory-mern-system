const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { COST_CENTER_VALUES } = require('../config/costCenters');
const { PERMISSION_VALUES } = require('../config/permissions');

const SALT_ROUNDS = 12;
const ROLES = ['admin', 'warehouse', 'encoder', 'accounting'];

const userSchema = new mongoose.Schema(
  {
    // The "ID" typed on the login screen. Stored lowercase so login is case-insensitive.
    userId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 32,
    },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    passwordHash: { type: String, required: true, select: false },
    // admin: everything. warehouse, encoder and accounting: what `permissions` allows.
    role: { type: String, enum: ROLES, default: 'warehouse' },
    // Ticked per account by an admin, starting from the role's defaults (config/permissions.js).
    // Empty for admins, who can do everything. Missing on accounts saved before permissions.
    permissions: { type: [{ type: String, enum: PERMISSION_VALUES }], default: undefined },
    // The cost centers a warehouse user or encoder may work in (and switch between when there
    // are several). Admins have none: they switch between all of them (see middleware/auth.js
    // resolveCostCenter and config/costCenters.js userCostCenters).
    costCenters: { type: [{ type: String, enum: COST_CENTER_VALUES }], default: undefined },
    // Before costCenters: the single cost center. Only read on accounts not yet migrated
    // (scripts/migrate-user-cost-centers.js).
    costCenter: { type: String, enum: [...COST_CENTER_VALUES, null], default: undefined },
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date,
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
  },
);

userSchema.methods.setPassword = async function setPassword(password) {
  this.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
};

userSchema.methods.checkPassword = function checkPassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
