const Item = require('../models/Item');

// "Do you mean this item?" for Add Item: existing items whose description is close to what's
// being typed, so the same item isn't added twice under a slightly different description.

const MIN_LENGTH = 3; // shorter text matches too much to be useful
const MIN_SCORE = 0.55;
const MAX_RESULTS = 3;

// Letters and digits only: "185/65 R14" and "185-65R14" compare the same.
const compact = (text) => text.toUpperCase().replace(/[^A-Z0-9]/g, '');
const words = (text) => text.toUpperCase().split(/[^A-Z0-9.]+/).filter(Boolean);

// Overlapping letter pairs: "VAN01" → VA AN N0 01.
function pairs(text) {
  const list = [];
  for (let i = 0; i < text.length - 1; i++) list.push(text.slice(i, i + 2));
  return list;
}

// Dice coefficient of the letter pairs: 1 = same letters in the same order, 0 = nothing alike.
// Forgives missing spaces, swapped characters and small typos.
function pairSimilarity(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const counts = new Map();
  for (const p of pairs(a)) counts.set(p, (counts.get(p) ?? 0) + 1);
  let shared = 0;
  for (const p of pairs(b)) {
    const n = counts.get(p);
    if (n) {
      shared++;
      counts.set(p, n - 1);
    }
  }
  return (2 * shared) / (a.length - 1 + b.length - 1);
}

// Share of the typed words found in the item's description, whatever their order.
function wordCoverage(typedWords, itemWords) {
  if (!typedWords.length) return 0;
  const have = new Set(itemWords);
  return typedWords.filter((w) => have.has(w)).length / typedWords.length;
}

// 0–1. Same letters ignoring spaces and punctuation counts as a match outright.
function similarity(typed, code) {
  const a = compact(typed);
  const b = compact(code);
  if (a === b) return 1;
  return 0.6 * pairSimilarity(a, b) + 0.4 * wordCoverage(words(typed), words(code));
}

// The closest items in the cost center (archived ones too: re-adding one is refused), best first.
async function findSimilarItems(costCenter, typed) {
  const text = String(typed ?? '').trim();
  if (compact(text).length < MIN_LENGTH) return [];
  const items = await Item.find({ costCenter }).select('itemId category code brand typeDesign archivedAt').lean();
  return items
    .map((item) => ({ item, score: similarity(text, item.code) }))
    .filter((match) => match.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || a.item.code.localeCompare(b.item.code))
    .slice(0, MAX_RESULTS)
    .map(({ item, score }) => ({ ...item, isArchived: Boolean(item.archivedAt), score: Math.round(score * 100) / 100 }));
}

module.exports = { findSimilarItems, similarity };
