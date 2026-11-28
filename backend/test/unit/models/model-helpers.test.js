import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const Item = require('../../../src/models/Item');
const { openingEntry, LEDGER_ORDER } = require('../../../src/models/Transaction');
const { lineQuantities } = require('../../../src/models/StockTransfer');

describe('Item.normalize', () => {
  it('trims, collapses spaces and uppercases', () => {
    expect(Item.normalize('  155 R12   arisun ')).toBe('155 R12 ARISUN');
    expect(Item.normalize(null)).toBe('');
  });

  it.each(['good year', 'GOOD-YEAR', ' Goodyear '])('saves the brand %j as GOODYEAR', (brand) => {
    expect(Item.normalizeBrand(brand)).toBe('GOODYEAR');
  });

  it('leaves other brands alone apart from normalizing', () => {
    expect(Item.normalizeBrand(' izumi ')).toBe('IZUMI');
  });
});

describe('openingEntry', () => {
  it('records stock on hand as IN', () => {
    expect(openingEntry(25)).toEqual({ type: 'IN', quantity: 25 });
  });

  it('records a negative opening balance as OUT with a positive quantity', () => {
    expect(openingEntry(-3)).toEqual({ type: 'OUT', quantity: 3 });
  });
});

describe('LEDGER_ORDER', () => {
  it('puts the balance forwarded first, then date, then entry order', () => {
    expect(LEDGER_ORDER).toEqual({ isBalanceForwarded: -1, date: 1, _id: 1 });
  });
});

describe('lineQuantities', () => {
  it('reads both sides of a transfer line', () => {
    expect(lineQuantities({ outQuantity: 5, inQuantity: 4 })).toEqual({ out: 5, in: 4 });
  });

  it('uses the single quantity of lines saved before there were two', () => {
    expect(lineQuantities({ quantity: 7 })).toEqual({ out: 7, in: 7 });
  });
});
