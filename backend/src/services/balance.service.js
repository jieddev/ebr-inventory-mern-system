const Item = require('../models/Item');
const Transaction = require('../models/Transaction');
const { LEDGER_ORDER } = require('../models/Transaction');

// One ledger step: the balance after `entry`, given the balance and the pending reservations
// before it. IN adds, OUT and RESERVE deduct. ADJUST (a physical count) sets the balance to what
// was counted, less the reservations still pending before it: reserved stock is still on the
// shelf, so it was counted, but the balance already leaves it out.
function step(balance, reserved, entry) {
  if (entry.type === 'ADJUST') return entry.countedQuantity - reserved;
  return balance + (entry.type === 'IN' ? entry.quantity : -entry.quantity);
}

// Walks an item's ledger in order and rewrites every entry's ending balance (and each count's
// change), then refreshes the item's balance and last-transaction fields. Running the whole
// ledger (instead of "previous balance ± quantity") keeps back-dated entries correct.
// Items have tens of entries, so this stays cheap. Also clears the "Correct balance" mark when
// the balance at the time it was marked no longer matches.
async function recalculateItem(itemId, session) {
  const [entries, current] = await Promise.all([
    Transaction.find({ item: itemId })
      .sort(LEDGER_ORDER)
      .select('date type quantity countedQuantity adjustment endingBalance isBalanceForwarded createdAt')
      .session(session)
      .lean(),
    Item.findById(itemId).select('balanceCheck').session(session).lean(),
  ]);
  const check = current?.balanceCheck;

  let balance = 0;
  let reserved = 0;
  // The balance when it was marked correct: entries dated before that day, and that day's entries
  // already recorded then. Entries recorded later that day are after the check.
  const isBeforeCheck = (entry) =>
    entry.isBalanceForwarded || entry.date < check.on || (entry.date.getTime() === check.on.getTime() && entry.createdAt <= check.at);
  let balanceAtCheck = 0;
  const updates = [];
  for (const entry of entries) {
    const next = step(balance, reserved, entry);
    if (check && isBeforeCheck(entry)) balanceAtCheck = next;
    const update = {};
    if (entry.type === 'ADJUST') {
      const adjustment = next - balance;
      if (entry.adjustment !== adjustment) update.adjustment = adjustment;
      if (entry.quantity !== Math.abs(adjustment)) update.quantity = Math.abs(adjustment);
    }
    if (entry.type === 'RESERVE') reserved += entry.quantity;
    balance = next;
    if (entry.endingBalance !== balance) update.endingBalance = balance;
    if (Object.keys(update).length) updates.push({ updateOne: { filter: { _id: entry._id }, update } });
  }
  if (updates.length) await Transaction.bulkWrite(updates, { session });

  // The latest entry by date (ties: the one entered last).
  const last = entries.reduce((latest, entry) => (!latest || entry.date >= latest.date ? entry : latest), null);

  return Item.findByIdAndUpdate(
    itemId,
    {
      balance,
      transactionCount: entries.length,
      lastTransactionDate: last?.date ?? null,
      lastTransactionType: last?.type ?? null,
      // A change to the entries before the mark (an edit, rollback or back-dated entry) made the
      // balance then differ: the mark no longer holds. Later entries don't clear it.
      ...(check && balanceAtCheck !== check.balance ? { balanceCheck: null } : {}),
    },
    { returnDocument: 'after', session },
  );
}

// An item's balance and pending reservations at the end of `day` (UTC midnight), from its ledger:
// what Adjust to Count compares a physical count against. The balance forwarded always counts,
// since it comes first in the ledger whatever its date.
async function balanceOn(itemId, day, session) {
  const entries = await Transaction.find({ item: itemId, $or: [{ date: { $lte: day } }, { isBalanceForwarded: true }] })
    .sort(LEDGER_ORDER)
    .select('type quantity countedQuantity')
    .session(session)
    .lean();
  let balance = 0;
  let reserved = 0;
  for (const entry of entries) {
    balance = step(balance, reserved, entry);
    if (entry.type === 'RESERVE') reserved += entry.quantity;
  }
  return { balance, reserved };
}

module.exports = { recalculateItem, balanceOn };
