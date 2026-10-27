const mongoose = require('mongoose');
const Item = require('../models/Item');
const Transaction = require('../models/Transaction');
const { recalculateItem } = require('../services/balance.service');
const { broadcast } = require('../services/events.service');
const HttpError = require('../utils/httpError');
const { parseDay, parseWholeNumber, parseObjectId, containsRegex, parsePage } = require('../utils/parse');

// Entries shown under each item group before "View all".
const PREVIEW_ENTRIES = 2;

// GET /api/transactions?search=&page=&limit=
// One group per item, most recent activity first, each with its latest entries.
async function listTransactions(req, res) {
  const { page, limit, skip } = parsePage(req.query);
  const search = String(req.query.search ?? '').trim();

  const filter = {};
  if (search) {
    const rx = containsRegex(search);
    const customerItemIds = await Transaction.distinct('item', { customerName: rx });
    filter.$or = [{ code: rx }, { brand: rx }, { _id: { $in: customerItemIds } }];
  }

  const [total, items] = await Promise.all([
    Item.countDocuments(filter),
    Item.find(filter)
      .sort({ lastTransactionDate: -1, updatedAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .select('code brand typeDesign balance transactionCount lastTransactionDate lastTransactionType')
      .lean(),
  ]);

  const previews = await Transaction.aggregate([
    { $match: { item: { $in: items.map((item) => item._id) } } },
    { $sort: { isBalanceForwarded: 1, date: -1, _id: -1 } },
    {
      $group: {
        _id: '$item',
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
    { $project: { entries: { $slice: ['$entries', PREVIEW_ENTRIES] } } },
  ]);
  const entriesByItem = new Map(previews.map((p) => [String(p._id), p.entries]));

  res.json({
    groups: items.map((item) => ({ item, entries: entriesByItem.get(String(item._id)) ?? [] })),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
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
    if (!(await Item.exists({ _id: itemId }).session(session))) throw new HttpError(404, 'Item not found');

    const [transaction] = await Transaction.create(
      [{ item: itemId, date, type, quantity, customerName, createdBy: req.user._id }],
      { session },
    );
    const item = await recalculateItem(itemId, session);
    const saved = await Transaction.findById(transaction._id).session(session).lean();
    return { transaction: saved, item };
  });

  // Sent after the MongoDB transaction commits, so other PCs re-fetch the saved data.
  broadcast('item-changed', { itemId: String(result.item._id) });
  res.status(201).json(result);
}

module.exports = { listTransactions, createTransaction };
