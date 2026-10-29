const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const HttpError = require('../utils/httpError');
const { AUTH_COOKIE } = require('../middleware/auth');
const { recordQuietly } = require('../services/audit.service');
const { jwtSecret, jwtExpiresIn, nodeEnv } = require('../config/env');

// Compared against when the user doesn't exist, so response time doesn't reveal valid IDs.
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 12);

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: nodeEnv === 'production',
  path: '/',
};

async function login(req, res) {
  const userId = String(req.body?.userId ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  if (!userId || !password) throw new HttpError(400, 'Enter your username and password');

  const user = await User.findOne({ userId }).select('+passwordHash');
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  // The log says why; the response doesn't, so it can't be used to find valid IDs.
  const failure = !user ? 'unknown_id' : !valid ? 'wrong_password' : !user.isActive ? 'disabled' : null;
  if (failure) {
    await recordQuietly(req, { action: 'auth.login_failed', actor: null, details: { userId: userId.slice(0, 64), reason: failure } });
    if (failure === 'disabled') throw new HttpError(403, 'This account is disabled. Contact your administrator.');
    throw new HttpError(401, 'Incorrect username or password');
  }

  const token = jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: jwtExpiresIn });
  const { exp } = jwt.decode(token);

  user.lastLoginAt = new Date();
  await user.save();

  res.cookie(AUTH_COOKIE, token, { ...cookieOptions, maxAge: exp * 1000 - Date.now() });
  await recordQuietly(req, { action: 'auth.login', actor: user });
  res.json({ user });
}

// Works without a valid session (so a stale tab can always log out); logged only when the
// cookie still says who is logging out.
async function logout(req, res) {
  const user = await userFromCookie(req);
  if (user) await recordQuietly(req, { action: 'auth.logout', actor: user });
  res.clearCookie(AUTH_COOKIE, cookieOptions);
  res.status(204).end();
}

async function userFromCookie(req) {
  try {
    const { sub } = jwt.verify(req.cookies?.[AUTH_COOKIE], jwtSecret);
    return await User.findById(sub).lean();
  } catch {
    return null;
  }
}

function me(req, res) {
  res.json({ user: req.user });
}

module.exports = { login, logout, me };
