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

// Walks entries already in ledger order (LEDGER_ORDER) from nothing. Gives the balance after each
// entry (and, for a count, the signed change it made), plus the final balance and the
// reservations still pending. Pure: the stock rules in one place, without the database.
function walkLedger(entries) {
  let balance = 0;
  let reserved = 0;
  const steps = entries.map((entry) => {
    const before = balance;
    balance = step(balance, reserved, entry);
    if (entry.type === 'RESERVE') reserved += entry.quantity;
    return entry.type === 'ADJUST' ? { endingBalance: balance, adjustment: balance - before } : { endingBalance: balance };
  });
  return { balance, reserved, steps };
}

// Walks an item's ledger in order and rewrites every entry's ending balance (and each count's
// change), then refreshes the item's balance and last-transaction fields. Running the whole
// ledger (instead of "previous balance ± quantity") keeps back-dated entries correct.
// Items have tens of entries, so this stays cheap. The "Correct balance" mark is left alone: only
// an admin removes it (Unmark).
async function recalculateItem(itemId, session) {
  const entries = await Transaction.find({ item: itemId })
    .sort(LEDGER_ORDER)
    .select('date type quantity countedQuantity adjustment endingBalance')
    .session(session)
    .lean();

  const { balance, steps } = walkLedger(entries);
  const updates = [];
  entries.forEach((entry, i) => {
    const { endingBalance, adjustment } = steps[i];
    const update = {};
    if (entry.type === 'ADJUST') {
      if (entry.adjustment !== adjustment) update.adjustment = adjustment;
      if (entry.quantity !== Math.abs(adjustment)) update.quantity = Math.abs(adjustment);
    }
    if (entry.endingBalance !== endingBalance) update.endingBalance = endingBalance;
    if (Object.keys(update).length) updates.push({ updateOne: { filter: { _id: entry._id }, update } });
  });
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
  const { balance, reserved } = walkLedger(entries);
  return { balance, reserved };
}

module.exports = { walkLedger, recalculateItem, balanceOn };
