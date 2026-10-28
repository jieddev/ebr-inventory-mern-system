const mongoose = require('mongoose');
const Item = require('../models/Item');
const { ACTIVE } = require('../models/Item');
const Transaction = require('../models/Transaction');
const { recalculateItem } = require('../services/balance.service');
const { broadcast, sourceClientId, ENCODER_ROLES } = require('../services/events.service');
const { record, itemTarget } = require('../services/audit.service');
const HttpError = require('../utils/httpError');
const { parseDay, parseWholeNumber, parseObjectId, containsRegex, parsePage } = require('../utils/parse');
const { itemConditions, entryMatch, andFilter } = require('../utils/filters');

// Entries shown under each item group before "View all".
const PREVIEW_ENTRIES = 2;

// GET /api/transactions?search=&page=&limit= plus the filters in utils/filters.js.
// One group per item, most recent activity first, each with its latest entries.
// With a type or date filter, only items with matching entries are listed, and only
// those entries are shown. `summary` totals the matching entries across all pages.
async function listTransactions(req, res) {
  const { page, limit, skip } = parsePage(req.query);
  const search = String(req.query.search ?? '').trim();
  const match = entryMatch(req.query);

  const conditions = [ACTIVE, ...itemConditions(req.query)];
  if (search) {
    const rx = containsRegex(search);
    const customerItemIds = await Transaction.distinct('item', { customerName: rx });
    conditions.push({ $or: [{ itemId: rx }, { code: rx }, { brand: rx }, { _id: { $in: customerItemIds } }] });
  }
  if (match) conditions.push({ _id: { $in: await Transaction.distinct('item', match) } });
  const filter = andFilter(conditions);

  const [total, items] = await Promise.all([
    Item.countDocuments(filter),
    Item.find(filter)
      .sort({ lastTransactionDate: -1, updatedAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .select('itemId code brand typeDesign balance transactionCount lastTransactionDate lastTransactionType')
      .lean(),
  ]);

  const previews = await Transaction.aggregate([
    { $match: { item: { $in: items.map((item) => item._id) }, ...match } },
    { $sort: { isBalanceForwarded: 1, date: -1, _id: -1 } },
    {
      $group: {
        _id: '$item',
        matchCount: { $sum: 1 },
        entries: {
          $push: {
            _id: '$_id',
            date: '$date',
            type: '$type',
            quantity: '$quantity',
            customerName: '$customerName',
            endingBalance: '$endingBalance',
          },
        },
      },
    },
    { $project: { matchCount: 1, entries: { $slice: ['$entries', PREVIEW_ENTRIES] } } },
  ]);
  const previewByItem = new Map(previews.map((p) => [String(p._id), p]));

  res.json({
    groups: items.map((item) => {
      const preview = previewByItem.get(String(item._id));
      return { item, entries: preview?.entries ?? [], matchCount: preview?.matchCount ?? 0 };
    }),
    summary: await summarize(filter, match),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
}

// IN and OUT quantity totals of the entries behind a filtered list.
async function summarize(itemFilter, match) {
  const entryFilter = { ...match };
  if (Object.keys(itemFilter).length) entryFilter.item = { $in: await Item.distinct('_id', itemFilter) };
  const totals = await Transaction.aggregate([
    { $match: entryFilter },
    { $group: { _id: '$type', quantity: { $sum: '$quantity' } } },
  ]);
  const byType = Object.fromEntries(totals.map((t) => [t._id, t.quantity]));
  return { in: byType.IN ?? 0, out: byType.OUT ?? 0 };
}

// POST /api/transactions — Add Transaction. Saves the entry and updates the item's
// balance in one MongoDB transaction; back-dated entries re-run the item's ledger.
async function createTransaction(req, res) {
  const body = req.body ?? {};
  const itemId = parseObjectId(body.itemId, 'Item');
  const date = parseDay(body.date);
  const type = String(body.type ?? '').toUpperCase();
  if (type !== 'IN' && type !== 'OUT') throw new HttpError(400, 'Choose IN or OUT');
  const quantity = parseWholeNumber(body.quantity, 'Quantity', { min: 1 });
  const customerName = String(body.customerName ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

  const result = await mongoose.connection.transaction(async (session) => {
    const target = await Item.findById(itemId).select('itemId code brand typeDesign archivedAt').session(session).lean();
    if (!target) throw new HttpError(404, 'Item not found');
    if (target.archivedAt) throw new HttpError(409, 'This item is archived. Restore it on the Items page first.');

    const [transaction] = await Transaction.create(
      [{ item: itemId, date, type, quantity, customerName, createdBy: req.user._id }],
      { session },
    );
    await record(
      req,
      {
        action: 'transaction.create',
        target: itemTarget(target),
        details: { transactionId: transaction._id, date, type, quantity, customerName },
      },
      session,
    );
    const item = await recalculateItem(itemId, session);
    const saved = await Transaction.findById(transaction._id).session(session).lean();
    return { transaction: saved, item };
  });

  // Sent after the MongoDB transaction commits, so other PCs re-fetch the saved data.
  // `activity` is shown to everyone else as "[name] has added a transaction".
  broadcast('item-changed', {
    itemId: String(result.item._id),
    activity: {
      kind: 'transaction',
      actorName: req.user.name,
      type,
      quantity,
      itemCode: result.item.code,
    },
    sourceClientId: sourceClientId(req),
  });
  // Encoders only learn that the item changed (its balance), not the transaction.
  broadcast('item-changed', { itemId: String(result.item._id) }, { roles: ENCODER_ROLES });
  res.status(201).json(result);
}

module.exports = { listTransactions, createTransaction };
