import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const { similarity } = require('../../../src/services/similarItems.service');

// findSimilarItems keeps matches scoring 0.55 or more.
const MIN_SCORE = 0.55;

describe('similarity', () => {
  it('treats the same letters and digits as a match, whatever the spacing or punctuation', () => {
    expect(similarity('185/65 R14', '185-65R14')).toBe(1);
    expect(similarity('izumi tube', 'IZUMI  TUBE')).toBe(1);
  });

  it('scores a small typo above the threshold', () => {
    expect(similarity('2.25-17 TUBE IZUMY', '2.25-17 TUBE IZUMI')).toBeGreaterThanOrEqual(MIN_SCORE);
  });

  it('scores the same words in another order above the threshold', () => {
    expect(similarity('TUBE 2.25-17', '2.25-17 TUBE')).toBeGreaterThanOrEqual(MIN_SCORE);
  });

  it('scores unrelated items below the threshold', () => {
    expect(similarity('BRAKE PAD', '185/65 R14 TIRE')).toBeLessThan(MIN_SCORE);
  });

  it('stays between 0 and 1', () => {
    for (const [a, b] of [['A', 'B'], ['', 'X'], ['OIL FILTER', 'AIR FILTER']]) {
      const score = similarity(a, b);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });
});
