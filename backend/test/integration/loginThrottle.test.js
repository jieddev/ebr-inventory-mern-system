import { createRequire } from 'node:module';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi, inject } from 'vitest';

const require = createRequire(import.meta.url);
const db = require('../helpers/db');
const { lockRemaining, recordFailure, clearFailures } = require('../../src/services/loginThrottle.service');

beforeAll(() => db.connect(inject('mongoUri')));
afterAll(() => db.disconnect());
beforeEach(async () => {
  await db.clearDb();
  // Only Date is faked: the database driver's own timers keep running normally.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-28T09:00:00+08:00'));
});
afterEach(() => vi.useRealTimers());

const MINUTE = 60 * 1000;
const IP = '10.0.0.5';
const later = (ms) => vi.setSystemTime(new Date(Date.now() + ms));

async function fail(times, userId = 'juan', ip = IP) {
  let result;
  for (let i = 0; i < times; i++) result = await recordFailure(userId, ip);
  return result;
}

describe('login throttle', () => {
  it('counts down the attempts left for a username', async () => {
    expect(await fail(1)).toEqual({ lockedMs: 0, attemptsLeft: 2 });
    expect(await fail(1)).toEqual({ lockedMs: 0, attemptsLeft: 1 });
    expect(await lockRemaining('juan', IP)).toBe(0);
  });

  it('locks the username for a minute on the 3rd wrong password', async () => {
    expect(await fail(3)).toEqual({ lockedMs: MINUTE, attemptsLeft: 0 });
    expect(await lockRemaining('juan', IP)).toBe(MINUTE);

    later(45 * 1000);
    expect(await lockRemaining('juan', IP)).toBe(15 * 1000);

    later(15 * 1000);
    expect(await lockRemaining('juan', IP)).toBe(0);
  });

  it('doubles the wait after each lockout, up to 15 minutes', async () => {
    const waits = [];
    for (let i = 0; i < 6; i++) {
      waits.push((await fail(3)).lockedMs / MINUTE);
      later(16 * MINUTE);
    }
    expect(waits).toEqual([1, 2, 4, 8, 15, 15]);
  });

  it('locks a computer trying many usernames after 10 failures', async () => {
    for (let i = 0; i < 9; i++) await fail(1, `user${i}`);
    expect(await lockRemaining('someone-new', IP)).toBe(0);

    expect((await fail(1, 'user9')).lockedMs).toBe(MINUTE);
    expect(await lockRemaining('someone-new', IP)).toBe(MINUTE);
    expect(await lockRemaining('someone-new', '10.0.0.6')).toBe(0);
  });

  it('starts the counts over after a successful login', async () => {
    await fail(2);
    await clearFailures('juan', IP);
    expect(await fail(1)).toEqual({ lockedMs: 0, attemptsLeft: 2 });
  });
});
