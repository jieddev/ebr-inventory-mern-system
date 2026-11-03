const mongoose = require('mongoose');
const User = require('../models/User');
const { ROLES } = require('../models/User');
const { COST_CENTERS, isCostCenter } = require('../config/costCenters');
const { defaultPermissions, isPermission } = require('../config/permissions');
const HttpError = require('../utils/httpError');
const { record } = require('../services/audit.service');
const { parseObjectId } = require('../utils/parse');
const { disconnectUser } = require('../services/events.service');

const MIN_PASSWORD_LENGTH = 8;

// The permissions sent for a user, de-duplicated and sorted so changes compare cleanly.
function parsePermissions(value) {
  if (!Array.isArray(value)) throw new HttpError(400, 'permissions must be a list');
  const unknown = value.find((p) => !isPermission(p));
  if (unknown !== undefined) throw new HttpError(400, `Unknown permission: ${unknown}`);
  return [...new Set(value)].sort();
}

// Accounts saved before permissions existed have their role's defaults (config/permissions.js).
const permissionsOf = (user) => [...(user.permissions ?? defaultPermissions(user.role))].sort();

// GET /api/users — every account, for the admin User management page.
async function listUsers(req, res) {
  const users = await User.find()
    .sort({ name: 1, userId: 1 })
    .select('userId name role permissions costCenter isActive lastLoginAt createdAt')
    .lean();
  res.json({ users });
}

// PATCH /api/users/:id { costCenter?, permissions?, isActive? } — Edit user (admin). All apply
// from the user's next request, since every request reloads the user: a new cost center
// switches the data they see, new permissions change what they can open, and a disabled
// account is signed out (middleware/auth.js) and can't sign in. Admins have no cost center
// (they switch between all) and no permissions (they can do everything), and no one can
// disable themselves, so there is always an active admin.
async function updateUser(req, res) {
  const id = parseObjectId(req.params.id, 'User');
  const body = req.body ?? {};
  const user = await User.findById(id);
  if (!user) throw new HttpError(404, 'User not found');

  const updates = {};
  if (body.costCenter !== undefined) {
    const costCenter = String(body.costCenter);
    if (!isCostCenter(costCenter)) {
      throw new HttpError(400, `Cost center must be one of: ${COST_CENTERS.map((c) => c.label).join(', ')}`);
    }
    if (user.role === 'admin') throw new HttpError(409, 'Admins switch between every cost center, so they have none to set.');
    updates.costCenter = costCenter;
  }
  if (body.permissions !== undefined) {
    const permissions = parsePermissions(body.permissions);
    if (user.role === 'admin') throw new HttpError(409, 'Admins can do everything, so they have no permissions to set.');
    updates.permissions = permissions;
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') throw new HttpError(400, 'isActive must be true or false');
    if (!body.isActive && user._id.equals(req.user._id)) throw new HttpError(409, "You can't disable your own account.");
    updates.isActive = body.isActive;
  }

  const changes = {};
  for (const [field, to] of Object.entries(updates)) {
    if (field === 'permissions') {
      const from = permissionsOf(user);
      if (from.join() !== to.join()) changes.permissions = { from, to };
      continue;
    }
    const from = user[field] ?? '';
    if (from !== to) changes[field] = { from, to };
  }
  if (Object.keys(changes).length) {
    user.set(updates);
    await user.save();
    await record(req, {
      action: 'user.update',
      target: { type: 'user', id: user._id, label: `${user.name} (${user.userId})` },
      changes,
    });
    // Live updates reconnect with the new permissions (or are refused for a disabled account).
    if (changes.isActive?.to === false || changes.permissions) disconnectUser(user._id);
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
  // The role's defaults unless the admin ticked others; admins can do everything.
  let permissions = [];
  if (role !== 'admin') {
    permissions = req.body?.permissions === undefined ? defaultPermissions(role).sort() : parsePermissions(req.body.permissions);
  }
  if (await User.exists({ userId })) throw new HttpError(409, 'That ID is already taken');

  const user = new User({ userId, name, role, permissions, costCenter });
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
    details: { userId, name: user.name, role, permissions, costCenter },
  });
  res.status(201).json({ user });
}

module.exports = { listUsers, createUser, updateUser };
