import { createRequire } from 'node:module';
import { describe, it, expect, beforeAll, afterAll, beforeEach, inject } from 'vitest';

const require = createRequire(import.meta.url);
const db = require('../helpers/db');
const Item = require('../../src/models/Item');
const Transaction = require('../../src/models/Transaction');
const { recalculateItem, balanceOn } = require('../../src/services/balance.service');

beforeAll(() => db.connect(inject('mongoUri')));
afterAll(() => db.disconnect());
beforeEach(() => db.clearDb());

const day = (text) => new Date(`${text}T00:00:00.000Z`);

// Saves entries for one item in the order given (later _id = entered later) and returns them.
async function ledger(item, entries) {
  const saved = [];
  for (const entry of entries) {
    saved.push(await Transaction.create({ item: item._id, ...entry, date: day(entry.date) }));
  }
  return saved;
}

async function endingBalances(item) {
  const entries = await Transaction.find({ item: item._id }).sort(Transaction.LEDGER_ORDER).lean();
  return entries.map((e) => [e.type, e.endingBalance]);
}

describe('recalculateItem', () => {
  let item;
  beforeEach(async () => {
    item = await Item.create({ code: '2.25-17 TUBE', brand: 'IZUMI' });
  });

  it('writes running balances and the item totals', async () => {
    await ledger(item, [
      { date: '2026-11-01', type: 'IN', quantity: 10, isBalanceForwarded: true },
      { date: '2026-11-02', type: 'OUT', quantity: 3 },
      { date: '2026-11-03', type: 'RESERVE', quantity: 2 },
      { date: '2026-11-04', type: 'IN', quantity: 5 },
    ]);

    const updated = await recalculateItem(item._id);

    expect(await endingBalances(item)).toEqual([['IN', 10], ['OUT', 7], ['RESERVE', 5], ['IN', 10]]);
    expect(updated.balance).toBe(10);
    expect(updated.transactionCount).toBe(4);
    expect(updated.lastTransactionDate).toEqual(day('2026-11-04'));
    expect(updated.lastTransactionType).toBe('IN');
  });

  it('puts a back-dated entry in date order and fixes the balances after it', async () => {
    await ledger(item, [
      { date: '2026-11-01', type: 'IN', quantity: 10 },
      { date: '2026-11-05', type: 'OUT', quantity: 4 },
      { date: '2026-11-03', type: 'OUT', quantity: 1 }, // entered last, dated earlier
    ]);

    await recalculateItem(item._id);

    const entries = await Transaction.find({ item: item._id }).sort(Transaction.LEDGER_ORDER).lean();
    expect(entries.map((e) => [e.date.toISOString().slice(0, 10), e.endingBalance])).toEqual([
      ['2026-11-01', 10],
      ['2026-11-03', 9],
      ['2026-11-05', 5],
    ]);
    expect((await Item.findById(item._id)).lastTransactionDate).toEqual(day('2026-11-05'));
  });

  it('keeps the balance forwarded first, whatever its date', async () => {
    await ledger(item, [
      { date: '2026-11-01', type: 'OUT', quantity: 2 },
      { date: '2026-11-10', type: 'IN', quantity: 5, isBalanceForwarded: true },
    ]);

    await recalculateItem(item._id);

    expect(await endingBalances(item)).toEqual([['IN', 5], ['OUT', 3]]);
  });

  it('handles a negative opening balance', async () => {
    await ledger(item, [
      { date: '2026-11-01', type: 'OUT', quantity: 3, isBalanceForwarded: true },
      { date: '2026-11-02', type: 'IN', quantity: 1 },
    ]);

    const updated = await recalculateItem(item._id);

    expect(await endingBalances(item)).toEqual([['OUT', -3], ['IN', -2]]);
    expect(updated.balance).toBe(-2);
  });

  it('sets the balance to the count less the reservations before it, and records the change', async () => {
    await ledger(item, [
      { date: '2026-11-01', type: 'IN', quantity: 10 },
      { date: '2026-11-02', type: 'RESERVE', quantity: 2 }, // still on the shelf: counted
      { date: '2026-11-03', type: 'ADJUST', quantity: 0, countedQuantity: 7 },
      { date: '2026-11-04', type: 'RESERVE', quantity: 1 }, // after the count: not part of it
    ]);

    await recalculateItem(item._id);

    const entries = await Transaction.find({ item: item._id }).sort(Transaction.LEDGER_ORDER).lean();
    expect(entries.map((e) => [e.type, e.endingBalance])).toEqual([
      ['IN', 10],
      ['RESERVE', 8],
      ['ADJUST', 5], // counted 7 - reserved 2
      ['RESERVE', 4],
    ]);
    const count = entries[2];
    expect(count.adjustment).toBe(-3); // 8 → 5
    expect(count.quantity).toBe(3);
  });

  it('on a date tie, takes the entry entered last as the latest', async () => {
    await ledger(item, [
      { date: '2026-11-02', type: 'IN', quantity: 5 },
      { date: '2026-11-02', type: 'RESERVE', quantity: 1 },
    ]);

    const updated = await recalculateItem(item._id);

    expect(updated.lastTransactionType).toBe('RESERVE');
  });

  it('empties the totals when the ledger is empty', async () => {
    await Item.updateOne({ _id: item._id }, { balance: 9, transactionCount: 2, lastTransactionType: 'IN' });

    const updated = await recalculateItem(item._id);

    expect(updated.balance).toBe(0);
    expect(updated.transactionCount).toBe(0);
    expect(updated.lastTransactionDate).toBeNull();
    expect(updated.lastTransactionType).toBeNull();
  });
});

describe('balanceOn', () => {
  let item;
  beforeEach(async () => {
    item = await Item.create({ code: 'OIL FILTER', brand: 'BOSCH' });
    await ledger(item, [
      { date: '2026-11-10', type: 'IN', quantity: 8, isBalanceForwarded: true },
      { date: '2026-11-02', type: 'IN', quantity: 2 },
      { date: '2026-11-05', type: 'RESERVE', quantity: 3 },
      { date: '2026-11-08', type: 'OUT', quantity: 1 },
    ]);
  });

  it('gives the balance and pending reservations at the end of a day', async () => {
    expect(await balanceOn(item._id, day('2026-11-05'))).toEqual({ balance: 7, reserved: 3 });
    expect(await balanceOn(item._id, day('2026-11-09'))).toEqual({ balance: 6, reserved: 3 });
  });

  it('always counts the balance forwarded, even when dated later', async () => {
    expect(await balanceOn(item._id, day('2026-11-01'))).toEqual({ balance: 8, reserved: 0 });
  });
});
