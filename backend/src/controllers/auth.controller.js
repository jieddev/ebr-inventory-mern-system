const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const HttpError = require('../utils/httpError');
const { AUTH_COOKIE } = require('../middleware/auth');
const { recordQuietly } = require('../services/audit.service');
const { lockRemaining, recordFailure, clearFailures } = require('../services/loginThrottle.service');
const { jwtSecret, jwtExpiresIn, nodeEnv } = require('../config/env');

// Compared against when the user doesn't exist, so response time doesn't reveal valid IDs.
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 12);

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: nodeEnv === 'production',
  path: '/',
};

// "1 minute", "2 minutes", "45 seconds".
function waitText(ms) {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

// 429 with how long to wait, in the body (retryAfter, seconds) and the Retry-After header.
function tooManyAttempts(ms) {
  const retryAfter = Math.ceil(ms / 1000);
  return new HttpError(429, `Too many failed login attempts. Please wait ${waitText(ms)} before trying again.`, {
    extra: { retryAfter },
    headers: { 'Retry-After': String(retryAfter) },
  });
}

// POST /api/auth/login. After 3 wrong passwords for a username (or 10 from one computer), logging in
// is blocked for a minute, then longer after each further lockout (services/loginThrottle.service.js).
async function login(req, res) {
  const userId = String(req.body?.userId ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  if (!userId || !password) throw new HttpError(400, 'Enter your username and password');

  // Checked before the password, so waiting can't be skipped by guessing right.
  const waitMs = await lockRemaining(userId, req.ip);
  if (waitMs) {
    await recordQuietly(req, { action: 'auth.login_failed', actor: null, details: { userId: userId.slice(0, 64), reason: 'locked' } });
    throw tooManyAttempts(waitMs);
  }

  const user = await User.findOne({ userId }).select('+passwordHash');
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  // The log says why; the response doesn't, so it can't be used to find valid IDs.
  const failure = !user ? 'unknown_id' : !valid ? 'wrong_password' : !user.isActive ? 'disabled' : null;
  if (failure) {
    await recordQuietly(req, { action: 'auth.login_failed', actor: null, details: { userId: userId.slice(0, 64), reason: failure } });
    if (failure === 'disabled') throw new HttpError(403, 'This account is disabled. Contact your administrator.');
    // Unknown IDs count the same as wrong passwords, so the wait doesn't reveal which IDs exist.
    const { lockedMs, attemptsLeft } = await recordFailure(userId, req.ip);
    if (lockedMs) throw tooManyAttempts(lockedMs);
    const left = attemptsLeft === 1 ? ' 1 attempt left before you have to wait.' : '';
    throw new HttpError(401, `Incorrect username or password.${left}`, { extra: { attemptsLeft } });
  }

  await clearFailures(userId, req.ip);

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
