const Item = require('../models/Item');
const { ACTIVE } = require('../models/Item');
const Transaction = require('../models/Transaction');
const { buildSummaryReport, buildTransactionReport } = require('../services/summaryReport.service');
const { record } = require('../services/audit.service');
const { parseDay, today } = require('../utils/parse');
const { costCenterFileName } = require('../config/costCenters');
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
    { beginningOf: from < to ? from : null },
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
        out: quantityIf({ $eq: ['$type', 'OUT'] }),
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
  const buffer = await buildTransactionReport(rows, totals, from, to);
  const fromDay = from.toISOString().slice(0, 10);
  const toDay = to.toISOString().slice(0, 10);
  const period = fromDay === toDay ? fromDay : `${fromDay}_to_${toDay}`;
  await record(req, { action: 'report.transactions_export', details: { from: fromDay, to: toDay, count: rows.length } });
  res
    .attachment(`EBR_Transaction_Report_${costCenterFileName(req.costCenter)}_${period}.xlsx`)
    .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .send(Buffer.from(buffer));
}

module.exports = { dailyReport, exportDailyReport, transactionReport, exportTransactionReport };
