import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const { diff, describe: describeItem, itemTarget } = require('../../../src/services/audit.service');

describe('diff', () => {
  it('lists only the fields that changed', () => {
    const before = { code: 'TUBE', brand: 'IZUMI', notes: 'x' };
    const after = { code: 'TUBE', brand: 'GOODYEAR', notes: 'x' };
    expect(diff(before, after, ['code', 'brand', 'notes'])).toEqual({ brand: { from: 'IZUMI', to: 'GOODYEAR' } });
  });

  it('returns null when nothing changed', () => {
    expect(diff({ code: 'A' }, { code: 'A' }, ['code'])).toBeNull();
  });

  it('treats missing, null and empty text as the same', () => {
    expect(diff({ notes: null }, { notes: '' }, ['notes'])).toBeNull();
    expect(diff({}, { notes: undefined }, ['notes'])).toBeNull();
    expect(diff({}, { notes: 'hi' }, ['notes'])).toEqual({ notes: { from: '', to: 'hi' } });
  });

  it('compares strictly, so 5 and "5" differ', () => {
    expect(diff({ quantity: 5 }, { quantity: '5' }, ['quantity'])).toEqual({ quantity: { from: 5, to: '5' } });
  });
});

describe('item labels', () => {
  it('joins the parts that are set', () => {
    expect(describeItem({ code: '2.25-17 TUBE', brand: 'IZUMI', typeDesign: 'TUBE' })).toBe('2.25-17 TUBE · IZUMI · TUBE');
    expect(describeItem({ code: 'OIL', brand: '', typeDesign: null })).toBe('OIL');
  });

  it('puts the item ID first in the audit target', () => {
    expect(itemTarget({ _id: 'abc', itemId: 'ITM-00012', code: 'OIL', brand: 'SHELL' })).toEqual({
      type: 'item',
      id: 'abc',
      label: 'ITM-00012 · OIL · SHELL',
    });
  });
});
