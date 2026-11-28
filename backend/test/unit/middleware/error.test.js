import { createRequire } from 'node:module';
import { describe, it, expect, afterEach } from 'vitest';

const require = createRequire(import.meta.url);
const HttpError = require('../../../src/utils/httpError');

function fakeRes() {
  const res = { headers: {} };
  res.status = (code) => Object.assign(res, { statusCode: code });
  res.json = (body) => Object.assign(res, { body });
  res.set = (headers) => Object.assign(res.headers, headers);
  return res;
}

// error.js reads NODE_ENV once, when loaded, so each environment gets a fresh copy.
function loadErrorHandler(nodeEnv) {
  process.env.NODE_ENV = nodeEnv;
  for (const path of ['../../../src/config/env', '../../../src/middleware/error']) delete require.cache[require.resolve(path)];
  return require('../../../src/middleware/error');
}

function handle(err, nodeEnv = 'test') {
  const res = fakeRes();
  loadErrorHandler(nodeEnv).errorHandler(err, { method: 'GET', originalUrl: '/x' }, res, () => {});
  return res;
}

afterEach(() => {
  loadErrorHandler('test');
});

describe('errorHandler', () => {
  it('sends an HttpError with its status, extra fields and headers', () => {
    const res = handle(new HttpError(429, 'Wait', { extra: { retryAfter: 60 }, headers: { 'Retry-After': '60' } }));
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ retryAfter: 60, message: 'Wait' });
    expect(res.headers).toEqual({ 'Retry-After': '60' });
  });

  it('turns a Mongoose validation error into a 400 with its first message', () => {
    const err = Object.assign(new Error('Item validation failed'), {
      name: 'ValidationError',
      errors: { code: { message: 'Code is required' }, brand: { message: 'Brand is too long' } },
    });
    const res = handle(err);
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Code is required');
  });

  it('turns a duplicate key into a 409', () => {
    const res = handle(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe('This record already exists');
  });

  it('keeps extra fields and headers out of server errors', () => {
    const err = Object.assign(new Error('Boom'), { extra: { secret: 1 }, headers: { 'X-A': '1' } });
    const res = handle(err);
    expect(res.statusCode).toBe(500);
    expect(res.body.secret).toBeUndefined();
    expect(res.headers).toEqual({});
    expect(res.err).toBe(err); // for the request log
  });

  it('shows the message and stack of server errors outside production', () => {
    const res = handle(new Error('Boom'));
    expect(res.body.message).toBe('Boom');
    expect(res.body.stack).toContain('Boom');
  });

  it('hides the message and stack of server errors in production', () => {
    const res = handle(new Error('Database password is hunter2'), 'production');
    expect(res.body).toEqual({ message: 'Internal server error' });
  });

  it('still shows client error messages in production', () => {
    const res = handle(new HttpError(404, 'Item not found'), 'production');
    expect(res.body).toEqual({ message: 'Item not found' });
  });
});
