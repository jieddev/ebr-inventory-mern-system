const jwt = require('jsonwebtoken');
const User = require('../models/User');
const HttpError = require('../utils/httpError');
const { jwtSecret } = require('../config/env');

const AUTH_COOKIE = 'ebr_token';

async function requireAuth(req, res, next) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) throw new HttpError(401, 'Not signed in');

  let payload;
  try {
    payload = jwt.verify(token, jwtSecret);
  } catch {
    throw new HttpError(401, 'Session expired, please sign in again');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw new HttpError(401, 'Not signed in');

  req.user = user;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) throw new HttpError(403, 'You do not have access to this action');
    next();
  };
}

// Everyone but encoders, who may only add items (see routes/items.routes.js).
const requireStaff = requireRole('admin', 'staff');

module.exports = { AUTH_COOKIE, requireAuth, requireRole, requireStaff };
