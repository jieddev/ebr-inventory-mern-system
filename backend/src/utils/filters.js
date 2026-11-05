const Item = require('../models/Item');
const HttpError = require('./httpError');
const { parseDay } = require('./parse');
const { TYPES } = require('../models/Transaction');

// Stock status → Item filter. Negative balances are allowed (see balance.service.js).
const STOCK_FILTERS = {
  in: { balance: { $gt: 0 } },
  out: { balance: 0 },
  negative: { balance: { $lt: 0 } },
};

// A query value that may be repeated (?brand=A&brand=B) → normalized, de-duplicated list.
function listParam(value) {
  return [...new Set([].concat(value ?? []).map(Item.normalize).filter(Boolean))];
}

// Item-level filters shared by the Transactions and Items pages:
// ?stock=in|out|negative&category=…&typeDesign=…&brand=… (the last three repeatable).
// Returns a list of Item conditions to combine with $and.
function itemConditions(query) {
  const conditions = [];
  const stock = String(query.stock ?? '').toLowerCase();
  if (stock) {
    if (!STOCK_FILTERS[stock]) throw new HttpError(400, 'Stock status must be in, out or negative');
    conditions.push(STOCK_FILTERS[stock]);
  }
  for (const field of ['category', 'typeDesign', 'brand']) {
    const values = listParam(query[field]);
    if (values.length) conditions.push({ [field]: { $in: values } });
  }
  return conditions;
}

// Entry-level filters for the Transactions page: ?type=IN|OUT|RESERVE&from=YYYY-MM-DD&to=YYYY-MM-DD.
// Returns a Transaction match, or null when none are set.
function entryMatch(query) {
  const match = {};
  const type = String(query.type ?? '').toUpperCase();
  if (type) {
    if (!TYPES.includes(type)) throw new HttpError(400, 'Transaction type must be IN, OUT or RESERVE');
    match.type = type;
  }
  if (query.from || query.to) {
    match.date = {};
    if (query.from) match.date.$gte = parseDay(query.from, 'From date');
    if (query.to) match.date.$lte = parseDay(query.to, 'To date');
    if (match.date.$gte && match.date.$lte && match.date.$gte > match.date.$lte) {
      throw new HttpError(400, 'The From date must be on or before the To date');
    }
  }
  return Object.keys(match).length ? match : null;
}

const andFilter = (conditions) => (conditions.length ? { $and: conditions } : {});

// Alphabetical item orders shared by the Transactions and Items pages (?sort=). Each ends on _id
// so pages don't overlap. Keep in step with frontend utils/sorts.js.
const ALPHABETICAL_SORTS = {
  description: { code: 1, brand: 1, typeDesign: 1, _id: 1 },
  'description-desc': { code: -1, brand: -1, typeDesign: -1, _id: -1 },
  brand: { brand: 1, code: 1, typeDesign: 1, _id: 1 },
};

// "Natural" order: numbers inside the text sort by value, so "2" comes before "10", and
// "23.5-25" before "155 R12". Case doesn't matter (codes and brands are uppercase anyway).
const NATURAL_ORDER = { locale: 'en', numericOrdering: true };

// ?sort= → { sort, collation } for Item.find(). An empty sort is the page's own default order.
// The default collation (simple binary order) is passed for it, so callers can always chain both.
function itemSort(query, defaultSort) {
  const value = String(query.sort ?? '');
  if (!value) return { sort: defaultSort, collation: { locale: 'simple' } };
  if (!ALPHABETICAL_SORTS[value]) throw new HttpError(400, 'Sort must be description, description-desc or brand');
  return { sort: ALPHABETICAL_SORTS[value], collation: NATURAL_ORDER };
}

module.exports = { itemConditions, entryMatch, andFilter, itemSort };
