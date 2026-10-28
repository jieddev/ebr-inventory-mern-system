const mongoose = require('mongoose');
const User = require('../models/User');
const { ROLES } = require('../models/User');
const HttpError = require('../utils/httpError');
const { record } = require('../services/audit.service');

const MIN_PASSWORD_LENGTH = 8;

async function createUser(req, res) {
  const userId = String(req.body?.userId ?? '').trim().toLowerCase();
  const name = String(req.body?.name ?? '').trim();
  const password = String(req.body?.password ?? '');
  const role = String(req.body?.role ?? 'staff');

  if (!userId || !name || !password) throw new HttpError(400, 'Enter an ID, name, and password');
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (!ROLES.includes(role)) throw new HttpError(400, `Role must be one of: ${ROLES.join(', ')}`);
  if (await User.exists({ userId })) throw new HttpError(409, 'That ID is already taken');

  const user = new User({ userId, name, role });
  await user.setPassword(password);

  try {
    await user.save();
  } catch (err) {
    if (err instanceof mongoose.Error.ValidationError) {
      throw new HttpError(400, Object.values(err.errors)[0].message);
    }
    // Another request saved the same ID between the check above and this save.
    if (err.code === 11000) throw new HttpError(409, 'That ID is already taken');
    throw err;
  }

  await record(req, {
    action: 'user.create',
    target: { type: 'user', id: user._id, label: `${user.name} (${user.userId})` },
    details: { userId, name: user.name, role },
  });
  res.status(201).json({ user });
}

module.exports = { createUser };
