const Item = require('../models/Item');
const { ACTIVE } = require('../models/Item');
const Transaction = require('../models/Transaction');
const { reservationMatch, countReservations } = require('./transactions.controller');
const { can } = require('../config/permissions');
const { today } = require('../utils/parse');

const RECENT_ENTRIES = 6;

// Stock counts are shown wherever balances already are: Transactions, the Items page's stock
// details and the reports.
const SEES_STOCK = ['addTransactions', 'viewItemStock', 'viewDailyReport', 'viewTransactionReport'];

// Today's IN and OUT quantities in the cost center. Like the Transaction Report, pending
// reservations and opening balances are not movements.
async function todayTotals(itemIds, day) {
  const totals = await Transaction.aggregate([
    { $match: { item: { $in: itemIds }, date: day, type: { $in: ['IN', 'OUT'] }, isBalanceForwarded: { $ne: true } } },
    { $group: { _id: '$type', quantity: { $sum: '$quantity' } } },
  ]);
  const byType = Object.fromEntries(totals.map((t) => [t._id, t.quantity]));
  return { in: byType.IN ?? 0, out: byType.OUT ?? 0 };
}

async function recentEntries(itemIds) {
  return Transaction.find({ item: { $in: itemIds }, isBalanceForwarded: { $ne: true } })
    .sort({ createdAt: -1, _id: -1 })
    .limit(RECENT_ENTRIES)
    .select('item date type quantity customerName createdAt')
    .populate('item', 'itemId code brand')
    .lean();
}

// GET /api/dashboard — the home page's numbers for the cost center. Each section is only
// included for users who can see that data elsewhere in the app (null otherwise).
async function dashboard(req, res) {
  const user = req.user;
  const itemFilter = { costCenter: req.costCenter, ...ACTIVE };
  const seesStock = SEES_STOCK.some((p) => can(user, p));
  const seesItems = seesStock || can(user, 'viewItems');
  const seesToday = can(user, 'addTransactions') || can(user, 'viewTransactionReport');
  const seesEntries = can(user, 'addTransactions');
  const day = today();

  const itemIds = seesToday || seesEntries ? await Item.distinct('_id', itemFilter) : [];
  const [items, outOfStock, totals, reservations, recent] = await Promise.all([
    seesItems ? Item.countDocuments(itemFilter) : null,
    seesStock ? Item.countDocuments({ ...itemFilter, balance: 0 }) : null,
    seesToday ? todayTotals(itemIds, day) : null,
    seesEntries ? reservationMatch(req.costCenter, '').then((match) => countReservations(match, day)) : null,
    seesEntries ? recentEntries(itemIds) : null,
  ]);

  res.json({
    date: day,
    stock: seesItems ? { items, outOfStock } : null,
    today: totals,
    reservations: reservations && { pending: reservations.all, overdue: reservations.overdue, dueToday: reservations.today },
    recent,
  });
}

module.exports = { dashboard };
