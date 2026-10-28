const Item = require('../models/Item');
const { ACTIVE } = require('../models/Item');
const Transaction = require('../models/Transaction');
const { parseDay, today } = require('../utils/parse');

// GET /api/reports/daily?date=YYYY-MM-DD — the Daily Report: every active item's ending
// balance at the end of that day, and the date of its last transaction up to then.
// Each entry's endingBalance is the running balance in ledger order (balance.service.js),
// so an item's balance on a day is the endingBalance of its last entry on or before it.
// Items with no entries by then show 0 and no date. All rows are returned (≈1,800), so
// the page can print the whole report; it pages them on screen.
async function dailyReport(req, res) {
  const asOf = req.query.date ? parseDay(req.query.date, 'Report date') : today();

  const [items, balances] = await Promise.all([
    Item.find(ACTIVE).sort({ itemId: 1, _id: 1 }).select('itemId code brand typeDesign').lean(),
    Transaction.aggregate([
      { $match: { date: { $lte: asOf } } },
      // Ledger order (models/Transaction.js LEDGER_ORDER), per item.
      { $sort: { item: 1, isBalanceForwarded: -1, date: 1, _id: 1 } },
      { $group: { _id: '$item', endingBalance: { $last: '$endingBalance' }, lastTransactionDate: { $max: '$date' } } },
    ]),
  ]);
  const byItem = new Map(balances.map((b) => [String(b._id), b]));

  const rows = items.map((item) => {
    const b = byItem.get(String(item._id));
    return { ...item, endingBalance: b?.endingBalance ?? 0, lastTransactionDate: b?.lastTransactionDate ?? null };
  });

  res.json({
    asOf,
    generatedAt: new Date(),
    preparedBy: req.user.name,
    rows,
    negativeCount: rows.filter((row) => row.endingBalance < 0).length,
  });
}

module.exports = { dailyReport };
