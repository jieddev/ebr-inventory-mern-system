const jwt = require('jsonwebtoken');
const User = require('../models/User');
const HttpError = require('../utils/httpError');
const { jwtSecret } = require('../config/env');
const { DEFAULT_COST_CENTER, isCostCenter, userCostCenters } = require('../config/costCenters');
const { can } = require('../config/permissions');

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

// Sets req.costCenter, the cost center whose data the request reads and writes, picked with the
// X-Cost-Center header (frontend api/client.js). Warehouse users and encoders may only pick one
// of their assigned cost centers (their first when the header is missing); admins may pick any,
// the default cost center (Servitek) when it's missing.
function resolveCostCenter(req, res, next) {
  const requested = req.get('X-Cost-Center');
  if (req.user.role !== 'admin') {
    const allowed = userCostCenters(req.user);
    if (!allowed.length) throw new HttpError(403, 'Your account has no cost center. Ask an admin to set one.');
    if (requested && !allowed.includes(requested)) throw new HttpError(403, "You don't have access to that cost center");
    req.costCenter = requested || allowed[0];
    return next();
  }
  if (requested && !isCostCenter(requested)) throw new HttpError(400, `Unknown cost center: ${requested}`);
  req.costCenter = requested || DEFAULT_COST_CENTER;
  next();
}

// Lets the request through when the user has any of `permissions` (admins always do).
function requirePermission(...permissions) {
  return (req, res, next) => {
    if (!permissions.some((p) => can(req.user, p))) throw new HttpError(403, 'You do not have access to this action');
    next();
  };
}

module.exports = { AUTH_COOKIE, requireAuth, requireRole, requirePermission, resolveCostCenter };
