import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const { walkLedger } = require('../../../src/services/balance.service');

const IN = (quantity) => ({ type: 'IN', quantity });
const OUT = (quantity) => ({ type: 'OUT', quantity });
const RESERVE = (quantity) => ({ type: 'RESERVE', quantity });
const ADJUST = (countedQuantity) => ({ type: 'ADJUST', quantity: 0, countedQuantity });

// walkLedger takes an item's entries already in ledger order (balance forwarded first, then by
// date) and gives the balance after each one, plus the final balance and pending reservations.
describe('walkLedger', () => {
  it('starts from nothing', () => {
    expect(walkLedger([])).toEqual({ balance: 0, reserved: 0, steps: [] });
  });

  it('adds IN and deducts OUT', () => {
    const result = walkLedger([IN(10), OUT(3), IN(2)]);
    expect(result.steps.map((s) => s.endingBalance)).toEqual([10, 7, 9]);
    expect(result.balance).toBe(9);
  });

  it('can go negative', () => {
    expect(walkLedger([OUT(3), IN(1)]).balance).toBe(-2);
  });

  it('deducts a reservation like OUT and keeps count of it', () => {
    const result = walkLedger([IN(10), RESERVE(2), RESERVE(1)]);
    expect(result.balance).toBe(7);
    expect(result.reserved).toBe(3);
  });

  it('sets the balance to the count less the reservations before it', () => {
    // 10 in, 2 reserved (still on the shelf, so counted): a count of 7 means 5 available.
    const result = walkLedger([IN(10), RESERVE(2), ADJUST(7)]);
    expect(result.steps[2]).toEqual({ endingBalance: 5, adjustment: -3 });
    expect(result.balance).toBe(5);
  });

  it('ignores reservations made after a count when applying that count', () => {
    const result = walkLedger([IN(10), ADJUST(10), RESERVE(4)]);
    expect(result.steps.map((s) => s.endingBalance)).toEqual([10, 10, 6]);
    expect(result.steps[1].adjustment).toBe(0);
  });

  it('records a count that raises the balance as a positive change', () => {
    expect(walkLedger([IN(2), ADJUST(6)]).steps[1]).toEqual({ endingBalance: 6, adjustment: 4 });
  });

  it('gives no adjustment for entries that are not counts', () => {
    expect(walkLedger([IN(1)]).steps[0]).toEqual({ endingBalance: 1 });
  });

  it('does not change the entries it is given', () => {
    const entries = [IN(5), ADJUST(3)];
    const copy = structuredClone(entries);
    walkLedger(entries);
    expect(entries).toEqual(copy);
  });
});
