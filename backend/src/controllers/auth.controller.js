const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const HttpError = require('../utils/httpError');
const { AUTH_COOKIE } = require('../middleware/auth');
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
  if (!userId || !password) throw new HttpError(400, 'Enter your ID and password');

  const user = await User.findOne({ userId }).select('+passwordHash');
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) throw new HttpError(401, 'Incorrect ID or password');
  if (!user.isActive) throw new HttpError(403, 'This account is disabled. Contact your administrator.');

  const token = jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: jwtExpiresIn });
  const { exp } = jwt.decode(token);

  user.lastLoginAt = new Date();
  await user.save();

  res.cookie(AUTH_COOKIE, token, { ...cookieOptions, maxAge: exp * 1000 - Date.now() });
  res.json({ user });
}

function logout(req, res) {
  res.clearCookie(AUTH_COOKIE, cookieOptions);
  res.status(204).end();
}

function me(req, res) {
  res.json({ user: req.user });
}

module.exports = { login, logout, me };
