import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const { parseItemId } = require('../../../src/services/itemId.service');

describe('parseItemId', () => {
  it.each([
    ['12', 'ITM-00012'],
    ['00012', 'ITM-00012'],
    ['itm-12', 'ITM-00012'],
    ['ITM 12', 'ITM-00012'],
    ['  ITM-00012  ', 'ITM-00012'],
    [12, 'ITM-00012'],
    ['123456', 'ITM-123456'],
  ])('reads %j as %s', (text, expected) => {
    expect(parseItemId(text)).toBe(expected);
  });

  it.each(['0', 'ITM-0', 'abc', 'ITM--12', '12a', '', null, undefined])('returns null for %j', (text) => {
    expect(parseItemId(text)).toBeNull();
  });
});
