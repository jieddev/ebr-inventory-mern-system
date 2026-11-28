import { createRequire } from 'node:module';
import { describe, it, expect, beforeAll, afterAll, beforeEach, inject } from 'vitest';

const require = createRequire(import.meta.url);
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../src/app');
const db = require('../helpers/db');
const { PASSWORD, createUser, authCookie } = require('../helpers/factories');

// Proves the test setup itself: in-memory replica set, transactions, the API and signing in.
beforeAll(() => db.connect(inject('mongoUri')));
afterAll(() => db.disconnect());
beforeEach(() => db.clearDb());

describe('test setup', () => {
  it('reports the database as connected', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.db).toBe('connected');
  });

  it('supports transactions (needs a replica set)', async () => {
    const User = mongoose.model('User');
    await expect(
      mongoose.connection.transaction(async (session) => {
        await User.create([{ userId: 'rollmeback', name: 'Gone', passwordHash: 'x' }], { session });
        throw new Error('roll back');
      }),
    ).rejects.toThrow('roll back');
    expect(await User.countDocuments()).toBe(0);
  });

  it('signs a user in with the login form', async () => {
    const user = await createUser({ userId: 'juan' });
    const res = await request(app).post('/api/auth/login').send({ userId: 'JUAN', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.userId).toBe('juan');
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.headers['set-cookie'][0]).toMatch(/^ebr_token=.+HttpOnly/);
    expect(String(user._id)).toBe(res.body.user._id);
  });

  it('signs a user in with the test cookie helper', async () => {
    const user = await createUser();
    const res = await request(app).get('/api/auth/me').set('Cookie', authCookie(user));
    expect(res.status).toBe(200);
  });

  it('refuses requests without a session', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Not signed in');
  });
});
