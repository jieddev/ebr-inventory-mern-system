import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const { parseBisNumber, parseBrrNumber, bisRegex } = require('../../../src/controllers/transactions.controller');
const { parseItemFields } = require('../../../src/controllers/items.controller');
const { parsePermissions, parseCostCenters } = require('../../../src/controllers/users.controller');

describe('parseBisNumber / parseBrrNumber', () => {
  it.each(['92479', 'BIS-92479', 'BIS# 92479', 'bis #92479', '#92479', 'BIS NO. 92479', ' BIS:92479 '])(
    'reads the BIS number in %j',
    (value) => {
      expect(parseBisNumber(value)).toBe('92479');
    },
  );

  it.each(['46954', 'BRR 46954', 'BRR# 46954', 'No. 46954'])('reads the BRR number in %j', (value) => {
    expect(parseBrrNumber(value)).toBe('46954');
  });

  it.each(['', 'BIS', '92479A', '1234567890123', null])('refuses %j', (value) => {
    expect(() => parseBisNumber(value)).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => parseBrrNumber(value)).toThrow(expect.objectContaining({ status: 400 }));
  });
});

describe('bisRegex (finds a BIS number in a customer name)', () => {
  const re = bisRegex('92479');

  it.each([
    'BIS-92479',
    'BIS# 92479',
    'BIS #92479',
    'bis 92479',
    'BIS NO. 92479',
    'BIS-092479',
    'BIS-92479/ JO-55772/ FATIMA FUNERAL - No. 46954',
    'JUAN DELA CRUZ BIS-92479',
  ])('matches %j', (name) => {
    expect(re.test(name)).toBe(true);
  });

  it.each(['BIS-924790', 'No. 92479', 'XBIS-92479', 'BIS-9247', '92479'])('does not match %j', (name) => {
    expect(re.test(name)).toBe(false);
  });

  it('ignores leading zeros in the number searched for', () => {
    expect(bisRegex('092479').test('BIS-92479')).toBe(true);
  });
});

describe('parseItemFields', () => {
  const valid = { category: 'tires', code: ' 185/65  r14 ', brand: 'good year', typeDesign: 'tire' };

  it('normalizes the text fields', () => {
    expect(parseItemFields(valid)).toEqual({
      category: 'TIRES',
      code: '185/65 R14',
      brand: 'GOODYEAR',
      typeDesign: 'TIRE',
      balanceForwarded: 0,
      lowStockThreshold: null,
    });
  });

  it('accepts a negative opening balance and a 0 threshold', () => {
    expect(parseItemFields({ ...valid, balanceForwarded: '-4', lowStockThreshold: '0' })).toMatchObject({
      balanceForwarded: -4,
      lowStockThreshold: 0,
    });
  });

  it.each([
    [{ category: 'WEAPONS' }, 'Select a category'],
    [{ category: '' }, 'Select a category'],
    [{ code: '   ' }, 'Enter an item description'],
    [{ balanceForwarded: '2.5' }, 'Balance forwarded must be a whole number'],
    [{ lowStockThreshold: '-1' }, 'Low stock threshold must be a whole number of 0 or more'],
    [{ lowStockThreshold: 'x' }, 'Low stock threshold must be a whole number of 0 or more'],
  ])('refuses %j', (change, message) => {
    expect(() => parseItemFields({ ...valid, ...change })).toThrow(expect.objectContaining({ status: 400, message }));
  });
});

describe('parsePermissions', () => {
  it('de-duplicates and sorts', () => {
    expect(parsePermissions(['viewItems', 'addItems', 'viewItems'])).toEqual(['addItems', 'viewItems']);
    expect(parsePermissions([])).toEqual([]);
  });

  it('refuses unknown permissions and non-lists', () => {
    expect(() => parsePermissions(['viewItems', 'deleteEverything'])).toThrow('Unknown permission: deleteEverything');
    expect(() => parsePermissions('viewItems')).toThrow('permissions must be a list');
  });
});

describe('parseCostCenters', () => {
  it('de-duplicates and puts them in the standard order', () => {
    expect(parseCostCenters(['carlota', 'warehouse-1', 'carlota'])).toEqual(['warehouse-1', 'carlota']);
  });

  it.each([[[]], [['mars']], [['servitek', 'mars']], ['servitek'], [undefined]])('refuses %j', (value) => {
    expect(() => parseCostCenters(value)).toThrow(expect.objectContaining({ status: 400 }));
  });
});
