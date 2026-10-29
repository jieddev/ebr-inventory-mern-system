const mongoose = require('mongoose');
const Item = require('../models/Item');
const { ACTIVE } = require('../models/Item');
const Transaction = require('../models/Transaction');
const { TYPES } = require('../models/Transaction');
const ReceivingReport = require('../models/ReceivingReport');
const { recalculateItem } = require('../services/balance.service');
const { broadcast, sourceClientId, ENCODER_ROLES } = require('../services/events.service');
const { record, itemTarget } = require('../services/audit.service');
const HttpError = require('../utils/httpError');
const { parseDay, today, parseWholeNumber, parseObjectId, containsRegex, parsePage } = require('../utils/parse');
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
            neededBy: '$neededBy',
            notes: '$notes',
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
  return { in: byType.IN ?? 0, out: byType.OUT ?? 0, reserve: byType.RESERVE ?? 0 };
}

// GET /api/transactions/:id — one entry for the details panel: its item, who recorded it
// and when, and the receiving report (BRR) it came from, if any.
async function getTransaction(req, res) {
  const id = parseObjectId(req.params.id, 'Transaction');
  const [transaction, report] = await Promise.all([
    Transaction.findById(id)
      .select(
        'item date type quantity customerName neededBy notes endingBalance isBalanceForwarded createdBy createdAt releasedAt releasedBy',
      )
      .populate('item', 'itemId category code brand typeDesign')
      .populate('createdBy', 'userId name role')
      .populate('releasedBy', 'userId name role')
      .lean(),
    ReceivingReport.findOne({ 'lines.transaction': id }).select({ reportNo: 1, receivedBy: 1, 'lines.$': 1 }).lean(),
  ]);
  if (!transaction) throw new HttpError(404, 'Transaction not found');

  const receiving = report && { reportNo: report.reportNo, receivedBy: report.receivedBy, unit: report.lines[0]?.unit };
  res.json({ transaction, receiving: receiving ?? null });
}

// Pending reservations are few, so the Reservations page gets them all at once.
const MAX_RESERVATIONS = 500;
const DUE_FILTERS = ['overdue', 'today', 'upcoming'];

// Pending reservations on active items, optionally narrowed by item ID, code, brand or customer.
async function reservationMatch(search) {
  const itemFilter = { ...ACTIVE };
  const match = { type: 'RESERVE' };
  if (search) {
    const rx = containsRegex(search);
    const itemIds = await Item.distinct('_id', { ...itemFilter, $or: [{ itemId: rx }, { code: rx }, { brand: rx }] });
    match.$or = [{ item: { $in: itemIds } }, { customerName: rx }];
  }
  match.item = { $in: await Item.distinct('_id', itemFilter) };
  return match;
}

// The neededBy condition of each due filter. No needed-by date counts as upcoming.
function dueConditions(day) {
  return {
    overdue: { neededBy: { $lt: day } },
    today: { neededBy: day },
    upcoming: { $or: [{ neededBy: { $gt: day } }, { neededBy: null }] },
  };
}

async function countReservations(match, day) {
  const due = dueConditions(day);
  const [all, overdue, dueToday, upcoming] = await Promise.all([
    Transaction.countDocuments(match),
    Transaction.countDocuments({ $and: [match, due.overdue] }),
    Transaction.countDocuments({ $and: [match, due.today] }),
    Transaction.countDocuments({ $and: [match, due.upcoming] }),
  ]);
  return { all, overdue, today: dueToday, upcoming };
}

// GET /api/transactions/reservations?search=&due=overdue|today|upcoming — the Reservations
// page: every pending reservation, soonest needed first (no needed-by date last).
// `counts` ignore `due` but respect `search`, for the due filter's numbers.
async function listReservations(req, res) {
  const search = String(req.query.search ?? '').trim();
  const due = String(req.query.due ?? '').toLowerCase();
  if (due && !DUE_FILTERS.includes(due)) throw new HttpError(400, 'Due must be overdue, today or upcoming');

  const day = today();
  const match = await reservationMatch(search);
  const filter = due ? { $and: [match, dueConditions(day)[due]] } : match;

  const [ordered, counts] = await Promise.all([
    Transaction.aggregate([
      { $match: filter },
      // Far-future stand-in, so reservations without a needed-by date sort last.
      { $addFields: { sortDay: { $ifNull: ['$neededBy', new Date(8.64e15)] } } },
      { $sort: { sortDay: 1, date: 1, _id: 1 } },
      { $limit: MAX_RESERVATIONS },
      { $project: { _id: 1 } },
    ]),
    countReservations(match, day),
  ]);

  const ids = ordered.map((r) => r._id);
  const found = await Transaction.find({ _id: { $in: ids } })
    .select('item date quantity customerName neededBy notes createdBy createdAt')
    .populate('item', 'itemId code brand typeDesign balance')
    .populate('createdBy', 'name')
    .lean();
  const byId = new Map(found.map((r) => [String(r._id), r]));

  res.json({ reservations: ids.map((id) => byId.get(String(id))).filter(Boolean), counts, today: day });
}

// GET /api/transactions/reservations/count — for the sidebar badge.
async function reservationCounts(req, res) {
  const { all, overdue } = await countReservations(await reservationMatch(''), today());
  res.json({ pending: all, overdue });
}

// POST /api/transactions — Add Transaction. Saves the entry and updates the item's
// balance in one MongoDB transaction; back-dated entries re-run the item's ledger.
async function createTransaction(req, res) {
  const body = req.body ?? {};
  const itemId = parseObjectId(body.itemId, 'Item');
  const date = parseDay(body.date);
  const type = String(body.type ?? '').toUpperCase();
  if (!TYPES.includes(type)) throw new HttpError(400, 'Choose IN, OUT or RESERVE');
  const quantity = parseWholeNumber(body.quantity, 'Quantity', { min: 1 });
  const customerName = String(body.customerName ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  // Reservation details; IN and OUT entries don't keep them.
  const isReserve = type === 'RESERVE';
  const neededBy = isReserve && body.neededBy ? parseDay(body.neededBy, 'Needed-by date') : undefined;
  const notes = isReserve ? String(body.notes ?? '').trim().slice(0, 300) : '';

  const result = await mongoose.connection.transaction(async (session) => {
    const target = await Item.findById(itemId).select('itemId code brand typeDesign archivedAt').session(session).lean();
    if (!target) throw new HttpError(404, 'Item not found');
    if (target.archivedAt) throw new HttpError(409, 'This item is archived. Restore it on the Items page first.');

    const [transaction] = await Transaction.create(
      [{ item: itemId, date, type, quantity, customerName, neededBy, notes, createdBy: req.user._id }],
      { session },
    );
    await record(
      req,
      {
        action: 'transaction.create',
        target: itemTarget(target),
        details: { transactionId: transaction._id, date, type, quantity, customerName, ...(isReserve && { neededBy, notes }) },
      },
      session,
    );
    const item = await recalculateItem(itemId, session);
    const saved = await Transaction.findById(transaction._id).session(session).lean();
    return { transaction: saved, item };
  });

  announce(req, result.item, { kind: 'transaction', type, quantity });
  res.status(201).json(result);
}

// POST /api/transactions/:id/release { date } — confirms a reservation is out of stock.
// The entry becomes OUT on the release date (default today), so the Daily Report shows
// the stock leaving on the day it left.
async function releaseReservation(req, res) {
  const id = parseObjectId(req.params.id, 'Transaction');
  const date = req.body?.date ? parseDay(req.body.date, 'Release date') : today();

  const result = await mongoose.connection.transaction(async (session) => {
    const { entry, target } = await loadReservation(id, session);
    await Transaction.updateOne(
      { _id: id },
      { type: 'OUT', date, releasedAt: new Date(), releasedBy: req.user._id },
      { session },
    );
    await record(
      req,
      {
        action: 'transaction.release',
        target: itemTarget(target),
        details: { transactionId: id, reservedOn: entry.date, date, quantity: entry.quantity, customerName: entry.customerName },
      },
      session,
    );
    const item = await recalculateItem(entry.item, session);
    const saved = await Transaction.findById(id).session(session).lean();
    return { transaction: saved, item, quantity: entry.quantity };
  });

  announce(req, result.item, { kind: 'release', quantity: result.quantity });
  res.json({ transaction: result.transaction, item: result.item });
}

// DELETE /api/transactions/:id — cancels a reservation; the stock goes back. Only
// reservations can be deleted: IN and OUT entries stay in the ledger.
async function cancelReservation(req, res) {
  const id = parseObjectId(req.params.id, 'Transaction');

  const result = await mongoose.connection.transaction(async (session) => {
    const { entry, target } = await loadReservation(id, session);
    await Transaction.deleteOne({ _id: id }, { session });
    await record(
      req,
      {
        action: 'transaction.cancel',
        target: itemTarget(target),
        details: {
          transactionId: id,
          date: entry.date,
          quantity: entry.quantity,
          customerName: entry.customerName,
          neededBy: entry.neededBy,
          notes: entry.notes,
        },
      },
      session,
    );
    const item = await recalculateItem(entry.item, session);
    return { item, quantity: entry.quantity };
  });

  announce(req, result.item, { kind: 'cancel', quantity: result.quantity });
  res.json({ item: result.item });
}

// The reservation and its item; 404 if it's gone, 409 if it's not a reservation (any more).
async function loadReservation(id, session) {
  const entry = await Transaction.findById(id).select('item date type quantity customerName neededBy notes').session(session).lean();
  if (!entry) throw new HttpError(404, 'Transaction not found');
  if (entry.type !== 'RESERVE') throw new HttpError(409, 'This entry is not a reservation (it may already be out).');
  const target = await Item.findById(entry.item).select('itemId code brand typeDesign').session(session).lean();
  return { entry, target };
}

// Sent after the MongoDB transaction commits, so other PCs re-fetch the saved data.
// `activity` is shown to everyone else, e.g. "[name] has added a transaction".
function announce(req, item, activity) {
  broadcast('item-changed', {
    itemId: String(item._id),
    activity: { ...activity, actorName: req.user.name, itemCode: item.code },
    sourceClientId: sourceClientId(req),
  });
  // Encoders only learn that the item changed (its balance), not the transaction.
  broadcast('item-changed', { itemId: String(item._id) }, { roles: ENCODER_ROLES });
}

module.exports = {
  listTransactions,
  getTransaction,
  createTransaction,
  listReservations,
  reservationCounts,
  releaseReservation,
  cancelReservation,
};
