const Item = require('../models/Item');
const { ACTIVE } = require('../models/Item');
const Transaction = require('../models/Transaction');
const { LEDGER_ORDER } = require('../models/Transaction');
const { buildSummaryReport, buildTransactionReport, buildReconcileReport, buildStockcard } = require('../services/summaryReport.service');
const { record } = require('../services/audit.service');
const { parseDay, today, parseObjectId } = require('../utils/parse');
const { entryMatch } = require('../utils/filters');
const { costCenterFileName, costCenterLabel } = require('../config/costCenters');
const HttpError = require('../utils/httpError');

// Each item's balance and last transaction date over its entries matching `dateMatch` (a
// condition on `date`). Each entry's endingBalance is the running balance in ledger order
// (balance.service.js), so an item's balance on a day is the endingBalance of its last entry
// on or before it.
async function balancesBy(itemIds, dateMatch) {
  const balances = await Transaction.aggregate([
    { $match: { item: { $in: itemIds }, date: dateMatch } },
    // Ledger order (models/Transaction.js LEDGER_ORDER), per item.
    { $sort: { item: 1, isBalanceForwarded: -1, date: 1, _id: 1 } },
    { $group: { _id: '$item', balance: { $last: '$endingBalance' }, lastTransactionDate: { $max: '$date' } } },
  ]);
  return new Map(balances.map((b) => [String(b._id), b]));
}

// Every active item in the cost center with its ending balance at the end of `to` and the date of
// its last transaction up to then. For a range (from < to) also its beginning balance: the stock
// on hand when `from` starts, i.e. at the end of the day before. Items with no entries show 0.
async function dailyRows(costCenter, from, to) {
  const items = await Item.find({ costCenter, ...ACTIVE })
    .sort({ itemId: 1, _id: 1 })
    .select('itemId category code brand typeDesign')
    .lean();
  const itemIds = items.map((item) => item._id);
  const isRange = from < to;
  const [ending, beginning] = await Promise.all([
    balancesBy(itemIds, { $lte: to }),
    isRange ? balancesBy(itemIds, { $lt: from }) : null,
  ]);

  return items.map((item) => {
    const end = ending.get(String(item._id));
    const row = { ...item, endingBalance: end?.balance ?? 0, lastTransactionDate: end?.lastTransactionDate ?? null };
    if (isRange) row.beginningBalance = beginning.get(String(item._id))?.balance ?? 0;
    return row;
  });
}

// ?date=YYYY-MM-DD (one day) or ?from=&to= (a range) for the Daily Report.
const dailyPeriod = (query) => reportPeriod({ from: query.from || query.date, to: query.to || query.date });

const dayText = (date) => date.toISOString().slice(0, 10);

// GET /api/reports/daily?date=YYYY-MM-DD or ?from=&to= — the Daily Report. All rows are returned
// (≈1,800), so the page can print the whole report; it pages them on screen.
async function dailyReport(req, res) {
  const { from, to } = dailyPeriod(req.query);
  const rows = await dailyRows(req.costCenter, from, to);

  res.json({
    from,
    to,
    asOf: to,
    generatedAt: new Date(),
    preparedBy: req.user.name,
    rows,
    negativeCount: rows.filter((row) => row.endingBalance < 0).length,
  });
}

// GET /api/reports/daily/export?date= or ?from=&to= — the same report as an .xlsx, in the
// Summary Report layout of the Items export (plus beginning balance and net change for a range).
async function exportDailyReport(req, res) {
  const { from, to } = dailyPeriod(req.query);
  const rows = await dailyRows(req.costCenter, from, to);
  const buffer = await buildSummaryReport(
    rows.map((row) => ({ ...row, balance: row.endingBalance })),
    to,
    {
      beginningOf: from < to ? from : null,
      title: 'Daily Report',
      costCenterName: costCenterLabel(req.costCenter),
      preparedBy: req.user.name,
    },
  );
  const period = from < to ? `${dayText(from)}_to_${dayText(to)}` : dayText(to);
  const details = { date: dayText(to), count: rows.length };
  if (from < to) details.from = dayText(from);
  await record(req, { action: 'report.export', details });
  res
    .attachment(`EBR_Daily_Report_${costCenterFileName(req.costCenter)}_${period}.xlsx`)
    .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .send(Buffer.from(buffer));
}

// The report period from ?from=&to= (YYYY-MM-DD). One of them alone is a single day; neither is today.
function reportPeriod(query) {
  const from = query.from ? parseDay(query.from, 'Start date') : null;
  const to = query.to ? parseDay(query.to, 'End date') : null;
  const period = { from: from ?? to ?? today(), to: to ?? from ?? today() };
  if (period.from > period.to) throw new HttpError(400, 'Start date must be on or before end date');
  return period;
}

// The active items in the cost center with IN or OUT entries from `from` to `to` (both days included):
// their IN and OUT totals for the period and their ending balance at the end of `to`. Pending
// reservations and the opening balance forwarded entry are not movements, so they aren't counted.
async function transactionRows(costCenter, from, to) {
  const items = await Item.find({ costCenter, ...ACTIVE })
    .sort({ itemId: 1, _id: 1 })
    .select('itemId category code brand typeDesign')
    .lean();
  const inPeriod = { $gte: ['$date', from] };
  const quantityIf = (condition) => ({ $sum: { $cond: [{ $and: [inPeriod, condition] }, '$quantity', 0] } });
  const totals = await Transaction.aggregate([
    { $match: { item: { $in: items.map((item) => item._id) }, date: { $lte: to } } },
    // Ledger order (models/Transaction.js LEDGER_ORDER), per item, so $last is the balance at the end of `to`.
    { $sort: { item: 1, isBalanceForwarded: -1, date: 1, _id: 1 } },
    {
      $group: {
        _id: '$item',
        in: quantityIf({ $and: [{ $eq: ['$type', 'IN'] }, { $ne: ['$isBalanceForwarded', true] }] }),
        out: quantityIf({ $and: [{ $eq: ['$type', 'OUT'] }, { $ne: ['$isBalanceForwarded', true] }] }),
        endingBalance: { $last: '$endingBalance' },
      },
    },
    { $match: { $or: [{ in: { $gt: 0 } }, { out: { $gt: 0 } }] } },
  ]);
  const byItem = new Map(totals.map((t) => [String(t._id), t]));

  const rows = items
    .filter((item) => byItem.has(String(item._id)))
    .map((item) => {
      const t = byItem.get(String(item._id));
      return { ...item, in: t.in, out: t.out, endingBalance: t.endingBalance };
    });
  return {
    rows,
    totals: rows.reduce((sum, row) => ({ in: sum.in + row.in, out: sum.out + row.out }), { in: 0, out: 0 }),
  };
}

// GET /api/reports/transactions?from=YYYY-MM-DD&to=YYYY-MM-DD — the Transaction Report: what moved
// in the period, with a total. All rows are returned so the page can print the whole report.
async function transactionReport(req, res) {
  const { from, to } = reportPeriod(req.query);
  const { rows, totals } = await transactionRows(req.costCenter, from, to);
  res.json({ from, to, generatedAt: new Date(), preparedBy: req.user.name, rows, totals });
}

// GET /api/reports/transactions/export?from=&to= — the same report as an .xlsx.
async function exportTransactionReport(req, res) {
  const { from, to } = reportPeriod(req.query);
  const { rows, totals } = await transactionRows(req.costCenter, from, to);
  const buffer = await buildTransactionReport(rows, totals, from, to, {
    costCenterName: costCenterLabel(req.costCenter),
    preparedBy: req.user.name,
  });
  const fromDay = from.toISOString().slice(0, 10);
  const toDay = to.toISOString().slice(0, 10);
  const period = fromDay === toDay ? fromDay : `${fromDay}_to_${toDay}`;
  await record(req, { action: 'report.transactions_export', details: { from: fromDay, to: toDay, count: rows.length } });
  res
    .attachment(`EBR_Transaction_Report_${costCenterFileName(req.costCenter)}_${period}.xlsx`)
    .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .send(Buffer.from(buffer));
}

// One item of the cost center (archived too, so old stock can still be reconciled) and its ledger,
// oldest first, with who recorded each entry. ?from=&to= (YYYY-MM-DD, both optional) limit the entries.
async function reconcileRows(costCenter, itemParam, query) {
  const id = parseObjectId(itemParam, 'Item');
  const match = entryMatch({ from: query.from, to: query.to });
  const item = await Item.findOne({ _id: id, costCenter }).select('itemId category code brand typeDesign balance archivedAt').lean();
  if (!item) throw new HttpError(404, 'Item not found');
  const transactions = await Transaction.find({ item: id, ...match })
    .sort(LEDGER_ORDER)
    .select('date type quantity customerName neededBy notes endingBalance isBalanceForwarded createdBy createdAt')
    .populate('createdBy', 'userId name')
    .lean();
  return { item, transactions, from: match?.date?.$gte ?? null, to: match?.date?.$lte ?? null };
}

// GET /api/reports/reconcile/:itemId?from=&to= — the Reconcile page: one item's transactions.
async function reconcileReport(req, res) {
  const { item, transactions, from, to } = await reconcileRows(req.costCenter, req.params.itemId, req.query);
  res.json({ item, transactions, from, to, generatedAt: new Date(), preparedBy: req.user.name });
}

// GET /api/reports/reconcile/:itemId/export?from=&to= — the same transactions as an .xlsx.
async function exportReconcileReport(req, res) {
  const { item, transactions, from, to } = await reconcileRows(req.costCenter, req.params.itemId, req.query);
  const buffer = await buildReconcileReport(item, transactions, {
    from,
    to,
    costCenterName: costCenterLabel(req.costCenter),
    preparedBy: req.user.name,
  });
  const fromDay = from && dayText(from);
  const toDay = to && dayText(to);
  const period = fromDay || toDay ? `${fromDay ?? 'start'}_to_${toDay ?? 'latest'}` : 'all';
  const details = { itemId: item.itemId, code: item.code, count: transactions.length };
  if (fromDay) details.from = fromDay;
  if (toDay) details.to = toDay;
  await record(req, { action: 'report.reconcile_export', details });
  res
    .attachment(`EBR_Reconcile_${costCenterFileName(req.costCenter)}_${item.itemId}_${period}.xlsx`)
    .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .send(Buffer.from(buffer));
}

// The active items in the cost center with entries from `from` to `to` (both days included): those
// entries in ledger order, who recorded each, and each item's balance when `from` starts (the end of
// the day before). Items with no entries in the period are left out.
async function stockcardRows(costCenter, from, to) {
  const allItems = await Item.find({ costCenter, ...ACTIVE })
    .sort({ itemId: 1, _id: 1 })
    .select('itemId category code brand typeDesign')
    .lean();
  const withEntries = new Set(
    (await Transaction.distinct('item', { item: { $in: allItems.map((item) => item._id) }, date: { $gte: from, $lte: to } })).map(String),
  );
  const items = allItems.filter((item) => withEntries.has(String(item._id)));
  const itemIds = items.map((item) => item._id);
  const [beginning, transactions] = await Promise.all([
    balancesBy(itemIds, { $lt: from }),
    Transaction.find({ item: { $in: itemIds }, date: { $gte: from, $lte: to } })
      .sort({ item: 1, ...LEDGER_ORDER })
      .select('item date type quantity customerName notes endingBalance isBalanceForwarded createdBy')
      .populate('createdBy', 'name')
      .lean(),
  ]);
  const transactionsByItem = new Map();
  for (const t of transactions) {
    const key = String(t.item);
    if (!transactionsByItem.has(key)) transactionsByItem.set(key, []);
    transactionsByItem.get(key).push(t);
  }
  const beginningByItem = new Map([...beginning].map(([key, b]) => [key, b.balance]));
  return { items, transactionsByItem, beginningByItem, count: transactions.length };
}

// GET /api/reports/stockcard/export?from=&to= — every item's stockcard for the period as an .xlsx.
async function exportStockcard(req, res) {
  const { from, to } = reportPeriod(req.query);
  const { items, transactionsByItem, beginningByItem, count } = await stockcardRows(req.costCenter, from, to);
  const buffer = await buildStockcard(items, transactionsByItem, beginningByItem, from, to, {
    costCenterName: costCenterLabel(req.costCenter),
    preparedBy: req.user.name,
  });
  const fromDay = dayText(from);
  const toDay = dayText(to);
  const period = fromDay === toDay ? fromDay : `${fromDay}_to_${toDay}`;
  await record(req, {
    action: 'report.stockcard_export',
    details: { from: fromDay, to: toDay, count: items.length, transactions: count },
  });
  res
    .attachment(`EBR_Stockcard_${costCenterFileName(req.costCenter)}_${period}.xlsx`)
    .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .send(Buffer.from(buffer));
}

module.exports = {
  dailyReport,
  exportDailyReport,
  transactionReport,
  exportTransactionReport,
  reconcileReport,
  exportReconcileReport,
  exportStockcard,
};
