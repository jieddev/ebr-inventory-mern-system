const mongoose = require('mongoose');
const User = require('../models/User');
const { ROLES } = require('../models/User');
const { COST_CENTERS, isCostCenter } = require('../config/costCenters');
const HttpError = require('../utils/httpError');
const { record } = require('../services/audit.service');
const { parseObjectId } = require('../utils/parse');

const MIN_PASSWORD_LENGTH = 8;

// GET /api/users — every account, for the admin User management page.
async function listUsers(req, res) {
  const users = await User.find()
    .sort({ name: 1, userId: 1 })
    .select('userId name role costCenter isActive lastLoginAt createdAt')
    .lean();
  res.json({ users });
}

// PATCH /api/users/:id { costCenter } — moves a warehouse user or encoder to another cost
// center (admin). It applies from their next request, since every request reloads the user.
// Admins have no cost center: they switch between all of them.
async function updateUser(req, res) {
  const id = parseObjectId(req.params.id, 'User');
  const costCenter = String(req.body?.costCenter ?? '');
  if (!isCostCenter(costCenter)) {
    throw new HttpError(400, `Cost center must be one of: ${COST_CENTERS.map((c) => c.label).join(', ')}`);
  }

  const user = await User.findById(id);
  if (!user) throw new HttpError(404, 'User not found');
  if (user.role === 'admin') throw new HttpError(409, 'Admins switch between every cost center, so they have none to set.');

  const from = user.costCenter ?? '';
  if (from !== costCenter) {
    user.costCenter = costCenter;
    await user.save();
    await record(req, {
      action: 'user.update',
      target: { type: 'user', id: user._id, label: `${user.name} (${user.userId})` },
      changes: { costCenter: { from, to: costCenter } },
    });
  }
  res.json({ user });
}

async function createUser(req, res) {
  const userId = String(req.body?.userId ?? '').trim().toLowerCase();
  const name = String(req.body?.name ?? '').trim();
  const password = String(req.body?.password ?? '');
  const role = String(req.body?.role ?? 'warehouse');
  // Admins switch between every cost center; everyone else works in one.
  const costCenter = role === 'admin' ? null : String(req.body?.costCenter ?? '');

  if (!userId || !name || !password) throw new HttpError(400, 'Enter an ID, name, and password');
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (!ROLES.includes(role)) throw new HttpError(400, `Role must be one of: ${ROLES.join(', ')}`);
  if (costCenter !== null && !isCostCenter(costCenter)) {
    throw new HttpError(400, `Cost center must be one of: ${COST_CENTERS.map((c) => c.label).join(', ')}`);
  }
  if (await User.exists({ userId })) throw new HttpError(409, 'That ID is already taken');

  const user = new User({ userId, name, role, costCenter });
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
    details: { userId, name: user.name, role, costCenter },
  });
  res.status(201).json({ user });
}

module.exports = { listUsers, createUser, updateUser };
