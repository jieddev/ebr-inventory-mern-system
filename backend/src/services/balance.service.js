const Item = require('../models/Item');
const Transaction = require('../models/Transaction');
const { LEDGER_ORDER } = require('../models/Transaction');

// Walks an item's ledger in order and rewrites every entry's ending balance, then
// refreshes the item's balance and last-transaction fields. Running the whole ledger
// (instead of "previous balance ± quantity") keeps back-dated entries correct.
// Items have tens of entries, so this stays cheap.
async function recalculateItem(itemId, session) {
  const entries = await Transaction.find({ item: itemId })
    .sort(LEDGER_ORDER)
    .select('date type quantity endingBalance')
    .session(session)
    .lean();

  let balance = 0;
  const updates = [];
  for (const entry of entries) {
    balance += entry.type === 'IN' ? entry.quantity : -entry.quantity;
    if (entry.endingBalance !== balance) {
      updates.push({ updateOne: { filter: { _id: entry._id }, update: { endingBalance: balance } } });
    }
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
    },
    { returnDocument: 'after', session },
  );
}

module.exports = { recalculateItem };
