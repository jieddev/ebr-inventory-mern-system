import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const { assertLocalUri } = require('../helpers/db');

// The only thing between the test suite and the production database: keep this test.
describe('test database guard', () => {
  it.each([
    'mongodb://127.0.0.1:52011/?replicaSet=testset',
    'mongodb://localhost:27017/ebr_test',
    'mongodb://127.0.0.1:1,127.0.0.1:2/?replicaSet=rs0',
    'mongodb://user:pass@localhost:27017/ebr_test',
  ])('allows the local database %s', (uri) => {
    expect(() => assertLocalUri(uri)).not.toThrow();
  });

  it.each([
    'mongodb+srv://cluster0.example.mongodb.net/ebr_inventory',
    'mongodb://192.168.1.10:27017/?replicaSet=rs0',
    'mongodb://127.0.0.1:27017,db.example.com:27017/?replicaSet=rs0',
    'mongodb://user:pass@db.example.com:27017/ebr',
    '',
    undefined,
  ])('refuses %s', (uri) => {
    expect(() => assertLocalUri(uri)).toThrow(/Refusing to use a non-local database/);
  });

  it('never sees the real .env values', () => {
    expect(process.env.MONGO_URI).toMatch(/^mongodb:\/\/127\.0\.0\.1/);
    expect(process.env.NODE_ENV).toBe('test');
  });
});
