const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;
const ROLES = ['admin', 'warehouse', 'encoder'];

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
    // admin: everything. warehouse: items and transactions. encoder: the Items page and Add Item.
    role: { type: String, enum: ROLES, default: 'warehouse' },
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
