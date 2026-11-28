const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../../src/models/User');
const { AUTH_COOKIE } = require('../../src/middleware/auth');
const { jwtSecret } = require('../../src/config/env');

const PASSWORD = 'password123';
// Hashed once with few rounds: the app's 12 rounds would make every test user take ~250 ms.
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

let seq = 0;

// A saved user. Pass role, permissions, costCenters, isActive... to override the defaults.
async function createUser(overrides = {}) {
  seq += 1;
  return User.create({
    userId: `user${seq}`,
    name: `Test User ${seq}`,
    passwordHash: PASSWORD_HASH,
    role: 'warehouse',
    costCenters: ['servitek'],
    ...overrides,
  });
}

// The Cookie header that signs `user` in, for supertest: request(app).get(...).set('Cookie', authCookie(user)).
function authCookie(user) {
  const token = jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: '1h' });
  return `${AUTH_COOKIE}=${token}`;
}

module.exports = { PASSWORD, createUser, authCookie };
