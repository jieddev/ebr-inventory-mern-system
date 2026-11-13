const mongoose = require('mongoose');
const Item = require('../models/Item');
const { ACTIVE } = require('../models/Item');
const Transaction = require('../models/Transaction');
const { ENTRY_TYPES } = require('../models/Transaction');
const ReceivingReport = require('../models/ReceivingReport');
const { recalculateItem, balanceOn } = require('../services/balance.service');
const { broadcast, sourceClientId } = require('../services/events.service');
const { record, diff, itemTarget } = require('../services/audit.service');
const HttpError = require('../utils/httpError');
const { parseDay, today, parseWholeNumber, parseObjectId, containsRegex, searchWords, parsePage } = require('../utils/parse');
const { itemConditions, entryMatch, andFilter, itemSort } = require('../utils/filters');

// Entries shown under each item group before "View all".
const PREVIEW_ENTRIES = 2;

// GET /api/transactions?search=&page=&limit=&sort= plus the filters in utils/filters.js.
// One group per item, most recent activity first (or ?sort=, see itemSort), each with its latest entries.
// With a type or date filter, only items with matching entries are listed, and only
// those entries are shown. `summary` totals the matching entries across all pages.
async function listTransactions(req, res) {
  const { page, limit, skip } = parsePage(req.query);
  const search = String(req.query.search ?? '').trim();
  const match = entryMatch(req.query);

  const conditions = [{ costCenter: req.costCenter }, ACTIVE, ...itemConditions(req.query)];
  // Every word must match the item ID, code, brand or a customer on the item's transactions.
  const words = searchWords(search);
  const customerItemIds = await Promise.all(
    words.map((word) => Transaction.distinct('item', { customerName: containsRegex(word) })),
  );
  words.forEach((word, i) => {
    const rx = containsRegex(word);
    conditions.push({ $or: [{ itemId: rx }, { code: rx }, { brand: rx }, { _id: { $in: customerItemIds[i] } }] });
  });
  if (match) conditions.push({ _id: { $in: await Transaction.distinct('item', match) } });
  const filter = andFilter(conditions);
  const { sort, collation } = itemSort(req.query, { lastTransactionDate: -1, updatedAt: -1, _id: -1 });

  const [total, items] = await Promise.all([
    Item.countDocuments(filter),
    Item.find(filter)
      .sort(sort)
      .collation(collation)
      .skip(skip)
      .limit(limit)
      .select('itemId category code brand typeDesign balance transactionCount lastTransactionDate lastTransactionType')
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
            countedQuantity: '$countedQuantity',
            adjustment: '$adjustment',
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

// IN and OUT quantity totals of the entries behind a filtered list. itemFilter always
// includes the cost center, so only its entries are counted.
async function summarize(itemFilter, match) {
  const entryFilter = { ...match, item: { $in: await Item.distinct('_id', itemFilter) } };
  const totals = await Transaction.aggregate([
    { $match: entryFilter },
    { $group: { _id: '$type', quantity: { $sum: '$quantity' }, adjustment: { $sum: { $ifNull: ['$adjustment', 0] } } } },
  ]);
  const byType = Object.fromEntries(totals.map((t) => [t._id, t]));
  return {
    in: byType.IN?.quantity ?? 0,
    out: byType.OUT?.quantity ?? 0,
    reserve: byType.RESERVE?.quantity ?? 0,
    // The net change made by physical counts.
    adjust: byType.ADJUST?.adjustment ?? 0,
  };
}

// GET /api/transactions/:id — one entry for the details panel: its item, who recorded it
// and when, and the slip it came from (receiving report or Batch Out), if any.
async function getTransaction(req, res) {
  const id = parseObjectId(req.params.id, 'Transaction');
  const [transaction, report] = await Promise.all([
    Transaction.findById(id)
      .select(
        'item date type quantity countedQuantity adjustment customerName neededBy notes endingBalance isBalanceForwarded createdBy createdAt releasedAt releasedBy',
      )
      .populate('item', 'costCenter itemId category code brand typeDesign')
      .populate('createdBy', 'userId name role')
      .populate('releasedBy', 'userId name role')
      .lean(),
    ReceivingReport.findOne({ 'lines.transaction': id }).select({ kind: 1, reportNo: 1, receivedBy: 1, releasedBy: 1, 'lines.$': 1 }).lean(),
  ]);
  // Another cost center's entry is answered like a missing one.
  if (!transaction || transaction.item?.costCenter !== req.costCenter) throw new HttpError(404, 'Transaction not found');

  const receiving = report && {
    kind: report.kind === 'OUT' ? 'OUT' : 'IN',
    reportNo: report.reportNo,
    receivedBy: report.receivedBy,
    releasedBy: report.releasedBy,
    unit: report.lines[0]?.unit,
  };
  res.json({ transaction, receiving: receiving ?? null });
}

// Pending reservations are few, so the Reservations page gets them all at once.
const MAX_RESERVATIONS = 500;
const DUE_FILTERS = ['overdue', 'today', 'upcoming'];

// Pending reservations on the cost center's active items, optionally narrowed by item ID,
// code, brand or customer.
async function reservationMatch(costCenter, search) {
  const itemFilter = { costCenter, ...ACTIVE };
  const match = { type: 'RESERVE' };
  // Every word must match the item (ID, code, brand) or the customer.
  const words = searchWords(search);
  if (words.length) {
    const itemIds = await Promise.all(
      words.map((word) => {
        const rx = containsRegex(word);
        return Item.distinct('_id', { ...itemFilter, $or: [{ itemId: rx }, { code: rx }, { brand: rx }] });
      }),
    );
    match.$and = words.map((word, i) => ({ $or: [{ item: { $in: itemIds[i] } }, { customerName: containsRegex(word) }] }));
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
  const match = await reservationMatch(req.costCenter, search);
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
    .populate('item', 'itemId category code brand typeDesign balance')
    .populate('createdBy', 'name')
    .lean();
  const byId = new Map(found.map((r) => [String(r._id), r]));

  res.json({ reservations: ids.map((id) => byId.get(String(id))).filter(Boolean), counts, today: day });
}

// GET /api/transactions/reservations/count — for the sidebar badge.
async function reservationCounts(req, res) {
  const { all, overdue } = await countReservations(await reservationMatch(req.costCenter, ''), today());
  res.json({ pending: all, overdue });
}

// POST /api/transactions — Add Transaction. Saves the entry and updates the item's
// balance in one MongoDB transaction; back-dated entries re-run the item's ledger.
async function createTransaction(req, res) {
  const body = req.body ?? {};
  const itemId = parseObjectId(body.itemId, 'Item');
  const date = parseDay(body.date);
  const type = String(body.type ?? '').toUpperCase();
  if (!ENTRY_TYPES.includes(type)) throw new HttpError(400, 'Choose IN, OUT or RESERVE');
  const quantity = parseWholeNumber(body.quantity, 'Quantity', { min: 1 });
  const customerName = String(body.customerName ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  // Reservation details; IN and OUT entries don't keep them.
  const isReserve = type === 'RESERVE';
  const neededBy = isReserve && body.neededBy ? parseDay(body.neededBy, 'Needed-by date') : undefined;
  const notes = isReserve ? String(body.notes ?? '').trim().slice(0, 300) : '';

  const result = await mongoose.connection.transaction(async (session) => {
    const target = await Item.findOne({ _id: itemId, costCenter: req.costCenter })
      .select('itemId code brand typeDesign archivedAt')
      .session(session)
      .lean();
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
    const { entry, target } = await loadReservation(req, id, session);
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
    const { entry, target } = await loadReservation(req, id, session);
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

// POST /api/transactions/:id/rollback — admin only. Removes any entry except the balance
// forwarded (changed with Edit Item) as if it was never recorded: its line comes off the
// receiving report it came from (the report goes when it has no lines left) and the item's
// ledger is re-run. Only the Activity log keeps a record of it.
async function rollbackTransaction(req, res) {
  const id = parseObjectId(req.params.id, 'Transaction');

  const result = await mongoose.connection.transaction(async (session) => {
    const entry = await Transaction.findById(id)
      .select('item date type quantity customerName neededBy notes isBalanceForwarded releasedAt')
      .session(session)
      .lean();
    if (!entry) throw new HttpError(404, 'Transaction not found');
    if (entry.isBalanceForwarded) {
      throw new HttpError(409, 'The balance forwarded can only be changed with Edit Item on the Items page.');
    }
    const target = await Item.findOne({ _id: entry.item, costCenter: req.costCenter })
      .select('itemId code brand typeDesign archivedAt')
      .session(session)
      .lean();
    if (!target) throw new HttpError(404, 'Transaction not found');
    if (target.archivedAt) throw new HttpError(409, 'This item is archived. Restore it on the Items page first.');

    await Transaction.deleteOne({ _id: id }, { session });
    const report = await ReceivingReport.findOneAndUpdate(
      { 'lines.transaction': id },
      { $pull: { lines: { transaction: id } } },
      { returnDocument: 'after', session },
    ).lean();
    if (report && !report.lines.length) await ReceivingReport.deleteOne({ _id: report._id }, { session });

    await record(
      req,
      {
        action: 'transaction.rollback',
        target: itemTarget(target),
        details: {
          transactionId: id,
          date: entry.date,
          type: entry.type,
          quantity: entry.quantity,
          customerName: entry.customerName,
          ...(entry.releasedAt && { wasReserved: true }),
          ...(report && { reportNo: report.reportNo }),
        },
      },
      session,
    );
    const item = await recalculateItem(entry.item, session);
    return { item, type: entry.type, quantity: entry.quantity };
  });

  announce(req, result.item, { kind: 'rollback', type: result.type, quantity: result.quantity });
  res.json({ item: result.item });
}

const EDIT_FIELDS = ['date', 'type', 'quantity', 'customerName', 'neededBy', 'notes'];
// An entry's editable fields with dates as YYYY-MM-DD, so diff() compares values and the
// Activity log shows plain days.
const dayText = (date) => (date ? new Date(date).toISOString().slice(0, 10) : '');
const editable = (entry) => ({
  date: dayText(entry.date),
  type: entry.type,
  quantity: entry.quantity,
  customerName: entry.customerName ?? '',
  neededBy: dayText(entry.neededBy),
  notes: entry.notes ?? '',
});

// PATCH /api/transactions/:id { date?, type?, quantity?, customerName?, neededBy?, notes? } — admin only.
// Corrects an entry in place; only the fields sent change. Not the balance forwarded (Edit Item)
// or entries of archived items. IN ↔ OUT only (reservations keep their type: use Confirm out or
// Cancel); needed-by and notes are for pending reservations. Entries on a receiving report /
// batch out slip keep the slip's date and type; a new quantity also goes on the slip's line.
// The item's ledger is re-run.
async function updateTransaction(req, res) {
  const id = parseObjectId(req.params.id, 'Transaction');
  const body = req.body ?? {};
  const has = (field) => body[field] !== undefined;

  const result = await mongoose.connection.transaction(async (session) => {
    const entry = await Transaction.findById(id)
      .select('item date type quantity customerName neededBy notes isBalanceForwarded')
      .session(session)
      .lean();
    if (!entry) throw new HttpError(404, 'Transaction not found');
    if (entry.isBalanceForwarded) {
      throw new HttpError(409, 'The balance forwarded can only be changed with Edit Item on the Items page.');
    }
    if (entry.type === 'ADJUST') {
      throw new HttpError(409, 'A physical count can’t be edited. Roll it back and enter the count again.');
    }
    const target = await Item.findOne({ _id: entry.item, costCenter: req.costCenter })
      .select('itemId code brand typeDesign archivedAt')
      .session(session)
      .lean();
    if (!target) throw new HttpError(404, 'Transaction not found');
    if (target.archivedAt) throw new HttpError(409, 'This item is archived. Restore it on the Items page first.');
    const slip = await ReceivingReport.findOne({ 'lines.transaction': id }).select('kind reportNo').session(session).lean();

    const update = {};
    if (has('date')) update.date = parseDay(body.date);
    if (has('type')) {
      const type = String(body.type).toUpperCase();
      if (type !== entry.type) {
        if (entry.type === 'RESERVE' || type === 'RESERVE' || !ENTRY_TYPES.includes(type)) {
          throw new HttpError(400, 'The type can only change between IN and OUT. Use Confirm out or Cancel for reservations.');
        }
        update.type = type;
      }
    }
    if (has('quantity')) update.quantity = parseWholeNumber(body.quantity, 'Quantity', { min: 1 });
    if (has('customerName')) {
      update.customerName = String(body.customerName ?? '').trim().replace(/\s+/g, ' ').toUpperCase().slice(0, 120);
    }
    if (has('neededBy') || has('notes')) {
      if (entry.type !== 'RESERVE') throw new HttpError(400, 'Needed-by date and notes are only for pending reservations');
      if (has('neededBy')) update.neededBy = body.neededBy ? parseDay(body.neededBy, 'Needed-by date') : null;
      if (has('notes')) update.notes = String(body.notes ?? '').trim().slice(0, 300);
    }

    const changes = diff(editable(entry), editable({ ...entry, ...update }), EDIT_FIELDS);
    if (!changes) {
      const saved = await Transaction.findById(id).session(session).lean();
      return { transaction: saved, item: null };
    }
    if (slip && (changes.date || changes.type)) {
      const slipName = slip.kind === 'OUT' ? 'batch out slip' : 'receiving report';
      throw new HttpError(
        400,
        `This entry is on a ${slipName}, so its date and type follow the slip. Roll it back and add it again to change them.`,
      );
    }

    await Transaction.updateOne({ _id: id }, update, { session, runValidators: true });
    if (slip && changes.quantity) {
      await ReceivingReport.updateOne(
        { 'lines.transaction': id },
        { $set: { 'lines.$.quantity': update.quantity } },
        { session },
      );
    }
    await record(
      req,
      {
        action: 'transaction.update',
        target: itemTarget(target),
        changes,
        details: { transactionId: id, ...(slip && { reportNo: slip.reportNo }) },
      },
      session,
    );
    const item = await recalculateItem(entry.item, session);
    const saved = await Transaction.findById(id).session(session).lean();
    return { transaction: saved, item };
  });

  if (result.item) {
    announce(req, result.item, { kind: 'edit', type: result.transaction.type, quantity: result.transaction.quantity });
  }
  res.json(result);
}

// The count date for Adjust to Count: a day, not in the future. Default today.
function countDay(value) {
  const day = value ? parseDay(value, 'Count date') : today();
  if (day > today()) throw new HttpError(400, 'The count date can’t be in the future');
  return day;
}

// An active item of the cost center, for Adjust to Count.
async function loadCountItem(req, itemId, session) {
  const item = await Item.findOne({ _id: itemId, costCenter: req.costCenter })
    .select('itemId code brand typeDesign archivedAt')
    .session(session)
    .lean();
  if (!item) throw new HttpError(404, 'Item not found');
  if (item.archivedAt) throw new HttpError(409, 'This item is archived. Restore it on the Items page first.');
  return item;
}

// GET /api/transactions/adjust/preview?itemId=&date= — admin only. The item's system balance and
// pending reservations at the end of the count date, so Adjust to Count can show the difference.
async function adjustPreview(req, res) {
  const itemId = parseObjectId(req.query.itemId, 'Item');
  const day = countDay(req.query.date);
  await loadCountItem(req, itemId);
  const { balance, reserved } = await balanceOn(itemId, day);
  res.json({ date: day, systemBalance: balance, reserved });
}

// POST /api/transactions/adjust { itemId, date, countedQuantity, notes } — admin only. Sets the
// item's balance on the count date to a physical count with an ADJUST entry (see balance.service.js).
// A count that matches the system balance saves no entry; it's only logged as verified.
async function adjustToCount(req, res) {
  const body = req.body ?? {};
  const itemId = parseObjectId(body.itemId, 'Item');
  const date = countDay(body.date);
  const countedQuantity = parseWholeNumber(body.countedQuantity, 'Physical count', { min: 0 });
  const notes = String(body.notes ?? '').trim().slice(0, 300);

  const result = await mongoose.connection.transaction(async (session) => {
    const target = await loadCountItem(req, itemId, session);
    const { balance: systemBalance, reserved } = await balanceOn(itemId, date, session);
    const adjustment = countedQuantity - reserved - systemBalance;
    const details = { date, countedQuantity, systemBalance, reserved, adjustment, notes };

    if (adjustment === 0) {
      await record(req, { action: 'transaction.count_verified', target: itemTarget(target), details }, session);
      const item = await Item.findById(itemId).session(session).lean();
      return { verified: true, transaction: null, item, adjustment };
    }

    const [transaction] = await Transaction.create(
      [{ item: itemId, date, type: 'ADJUST', quantity: Math.abs(adjustment), countedQuantity, adjustment, notes, createdBy: req.user._id }],
      { session },
    );
    await record(
      req,
      { action: 'transaction.adjust', target: itemTarget(target), details: { transactionId: transaction._id, ...details } },
      session,
    );
    const item = await recalculateItem(itemId, session);
    const saved = await Transaction.findById(transaction._id).session(session).lean();
    return { verified: false, transaction: saved, item, adjustment };
  });

  if (!result.verified) announce(req, result.item, { kind: 'adjust', adjustment: result.adjustment });
  res.status(result.verified ? 200 : 201).json({ verified: result.verified, transaction: result.transaction, item: result.item });
}

// The reservation and its item; 404 if it's gone or in another cost center, 409 if it's not
// a reservation (any more).
async function loadReservation(req, id, session) {
  const entry = await Transaction.findById(id).select('item date type quantity customerName neededBy notes').session(session).lean();
  const target =
    entry &&
    (await Item.findOne({ _id: entry.item, costCenter: req.costCenter }).select('itemId code brand typeDesign').session(session).lean());
  if (!target) throw new HttpError(404, 'Transaction not found');
  if (entry.type !== 'RESERVE') throw new HttpError(409, 'This entry is not a reservation (it may already be out).');
  return { entry, target };
}

// Sent after the MongoDB transaction commits, so other PCs re-fetch the saved data.
// `activity` is shown to everyone else, e.g. "[name] has added a transaction".
function announce(req, item, activity) {
  broadcast('item-changed', {
    itemId: String(item._id),
    activity: { ...activity, actorName: req.user.name, itemCode: item.code },
    sourceClientId: sourceClientId(req),
  }, { costCenter: req.costCenter });
  // Items page users who don't add transactions only learn that the item changed (its balance).
  broadcast('item-changed', { itemId: String(item._id) }, {
    permission: 'viewItems',
    unless: 'addTransactions',
    costCenter: req.costCenter,
  });
}

module.exports = {
  listTransactions,
  getTransaction,
  createTransaction,
  listReservations,
  reservationCounts,
  releaseReservation,
  cancelReservation,
  rollbackTransaction,
  updateTransaction,
  adjustPreview,
  adjustToCount,
  // For the dashboard (dashboard.controller.js).
  reservationMatch,
  countReservations,
};
