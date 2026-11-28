import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const { parseDay, parseWholeNumber, parseObjectId, containsRegex, searchWords, allWordsFilter, parsePage } =
  require('../../../src/utils/parse');

describe('parseDay', () => {
  it('turns YYYY-MM-DD into UTC midnight', () => {
    expect(parseDay('2026-11-28').toISOString()).toBe('2026-11-28T00:00:00.000Z');
  });

  it.each(['2026-02-30', '28/11/2026', '2026-1-5', '', null, undefined])('rejects %s with a 400', (value) => {
    expect(() => parseDay(value)).toThrow(expect.objectContaining({ status: 400, message: 'Date is not a valid date' }));
  });

  // Date.UTC rolls month 13 into January of the next year and month 00 into December of the
  // year before, so the month has to be checked as well as the day.
  it.each(['2026-13-01', '2026-00-15'])('rejects the month in %s with a 400', (value) => {
    expect(() => parseDay(value)).toThrow(expect.objectContaining({ status: 400 }));
  });

  it('names the field in the message', () => {
    expect(() => parseDay('nope', 'Needed by')).toThrow('Needed by is not a valid date');
  });
});

describe('parseWholeNumber', () => {
  it('accepts whole numbers given as text or numbers', () => {
    expect(parseWholeNumber('5', 'Quantity')).toBe(5);
    expect(parseWholeNumber(0, 'Quantity')).toBe(0);
  });

  it.each(['', null, undefined, '1.5', 'abc', -1])('rejects %s', (value) => {
    expect(() => parseWholeNumber(value, 'Quantity')).toThrow('Quantity must be a whole number (0 or more)');
  });

  it('enforces a minimum and says so', () => {
    expect(() => parseWholeNumber('0', 'Quantity', { min: 1 })).toThrow('Quantity must be a whole number of at least 1');
  });
});

describe('parseObjectId', () => {
  it('returns a valid id unchanged', () => {
    expect(parseObjectId('64b7f0c2a1b2c3d4e5f60718')).toBe('64b7f0c2a1b2c3d4e5f60718');
  });

  it('rejects anything else with a 400', () => {
    expect(() => parseObjectId('123', 'Item')).toThrow(expect.objectContaining({ status: 400, message: 'Item is not valid' }));
  });
});

describe('search text', () => {
  it('containsRegex matches literally and ignores case', () => {
    const re = containsRegex('185/65 (R14)');
    expect(re.test('tire 185/65 (r14) arisun')).toBe(true);
    expect(re.test('185/65 R14')).toBe(false);
  });

  it('searchWords splits on any whitespace', () => {
    expect(searchWords('  izumi   tube\t17 ')).toEqual(['izumi', 'tube', '17']);
    expect(searchWords(null)).toEqual([]);
  });

  it('allWordsFilter needs every word in some field', () => {
    expect(allWordsFilter('   ', ['code'])).toBeNull();
    const filter = allWordsFilter('tube izumi', ['code', 'brand']);
    expect(filter.$and).toHaveLength(2);
    expect(filter.$and[0].$or.map((c) => Object.keys(c)[0])).toEqual(['code', 'brand']);
    expect(filter.$and[1].$or[1].brand.test('IZUMI')).toBe(true);
  });
});

describe('parsePage', () => {
  it('defaults to page 1 of 10', () => {
    expect(parsePage({})).toEqual({ page: 1, limit: 10, skip: 0 });
  });

  it('works out the skip', () => {
    expect(parsePage({ page: '3', limit: '20' })).toEqual({ page: 3, limit: 20, skip: 40 });
  });

  it('clamps bad and oversized values', () => {
    expect(parsePage({ page: '-2', limit: '500' })).toEqual({ page: 1, limit: 50, skip: 0 });
    expect(parsePage({ page: 'x', limit: '0' }, { defaultLimit: 25, maxLimit: 100 })).toEqual({ page: 1, limit: 25, skip: 0 });
  });
});
