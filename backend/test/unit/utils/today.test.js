import { createRequire } from 'node:module';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { today } = require('../../../src/utils/parse');
const { startOfToday } = require('../../../src/utils/filters');

// Tests run in Asia/Manila (UTC+8), like production (test/setup/env.js). Only Date is faked,
// so nothing else (timers, the database driver) is affected.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('today', () => {
  it("is Manila's calendar day, stored as UTC midnight", () => {
    vi.setSystemTime(new Date('2026-11-28T10:00:00+08:00'));
    expect(today().toISOString()).toBe('2026-11-28T00:00:00.000Z');
  });

  it('has already moved to the next day in Manila while it is still the day before in UTC', () => {
    vi.setSystemTime(new Date('2026-11-28T17:30:00Z')); // 01:30 on Nov 29 in Manila
    expect(today().toISOString()).toBe('2026-11-29T00:00:00.000Z');
  });

  it('is still the same day just before Manila midnight', () => {
    vi.setSystemTime(new Date('2026-11-28T23:59:59+08:00'));
    expect(today().toISOString()).toBe('2026-11-28T00:00:00.000Z');
  });
});

describe('startOfToday', () => {
  it('is midnight in Manila (16:00 UTC the day before), for "added today"', () => {
    vi.setSystemTime(new Date('2026-11-28T09:15:00+08:00'));
    expect(startOfToday().toISOString()).toBe('2026-11-27T16:00:00.000Z');
  });
});
