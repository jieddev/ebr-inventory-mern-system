// Moves a cost center's opening balances (BALANCE FORWARDED entries) from one date to another,
// e.g. items added or imported on 2026-11-12 whose opening stock is really as of 2026-10-31.
// Only BALANCE FORWARDED entries move; IN, OUT and RESERVE entries keep their dates. Archived
// items are included. Running balances don't change (the opening entry always comes first in the
// ledger); each item's last transaction date is refreshed. No audit log entries are written.
//
//   node scripts/redate-balance-forwarded.js <cost-center> <old-date> <new-date>            preview: changes nothing
//   node scripts/redate-balance-forwarded.js <cost-center> <old-date> <new-date> --confirm  re-dates
//
// Dates are YYYY-MM-DD. Back up the database first (mongodump).
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Item = require('../src/models/Item');
const Transaction = require('../src/models/Transaction');
const { recalculateItem } = require('../src/services/balance.service');
const { COST_CENTER_VALUES, isCostCenter } = require('../src/config/costCenters');
const { parseDay } = require('../src/utils/parse');

const USAGE = `Usage: node scripts/redate-balance-forwarded.js <${COST_CENTER_VALUES.join('|')}> <old-date> <new-date> [--confirm]
Dates are YYYY-MM-DD, e.g. servitek 2026-11-12 2026-10-31`;

const dayText = (date) => date.toISOString().slice(0, 10);

function parseArgs(argv) {
  const [costCenter, oldText, newText] = argv.filter((arg) => !arg.startsWith('--'));
  if (!isCostCenter(costCenter)) throw new Error(`Unknown cost center "${costCenter ?? ''}".`);
  const oldDate = parseDay(oldText, 'Old date');
  const newDate = parseDay(newText, 'New date');
  if (oldDate.getTime() === newDate.getTime()) throw new Error('The old and new dates are the same.');
  return { costCenter, oldDate, newDate, confirm: argv.includes('--confirm') };
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`${err.message}\n\n${USAGE}`);
    process.exitCode = 1;
    return;
  }
  const { costCenter, oldDate, newDate, confirm } = args;

  await connectDB();
  const itemIds = await Item.distinct('_id', { costCenter });
  const entries = await Transaction.find({ item: { $in: itemIds }, isBalanceForwarded: true, date: oldDate })
    .select('item type quantity')
    .populate('item', 'itemId code brand archivedAt')
    .lean();
  entries.sort((a, b) => String(a.item?.itemId ?? '').localeCompare(String(b.item?.itemId ?? '')));
  const affected = entries.map((entry) => entry.item._id);

  console.log(`Cost center: ${costCenter}`);
  console.log(`Opening balances dated ${dayText(oldDate)} → ${dayText(newDate)}: ${entries.length}`);
  for (const entry of entries.slice(0, 20)) {
    const { itemId, code, brand, archivedAt } = entry.item;
    console.log(`  ${itemId ?? '(no ID)'}  ${code}${brand ? ` · ${brand}` : ''}  ${entry.type} ${entry.quantity}${archivedAt ? '  (archived)' : ''}`);
  }
  if (entries.length > 20) console.log(`  … and ${entries.length - 20} more`);

  // Their other entries before the new date would then come before the opening balance by date.
  // Balances still add up (the opening entry is always first in the ledger), but it reads oddly.
  const earlier = await Transaction.aggregate([
    { $match: { item: { $in: affected }, isBalanceForwarded: { $ne: true }, date: { $lt: newDate } } },
    { $group: { _id: '$item', first: { $min: '$date' } } },
  ]);
  if (earlier.length) {
    const byId = new Map(entries.map((entry) => [String(entry.item._id), entry.item]));
    console.log(`\nWarning: ${earlier.length} of these items have transactions dated before ${dayText(newDate)}:`);
    for (const row of earlier.slice(0, 10)) {
      const item = byId.get(String(row._id));
      console.log(`  ${item?.itemId ?? '(no ID)'}  ${item?.code ?? ''}  first entry ${dayText(row.first)}`);
    }
    if (earlier.length > 10) console.log(`  … and ${earlier.length - 10} more`);
  }

  if (!confirm) {
    console.log('\nPreview only. Nothing was changed. Run again with --confirm to re-date.');
    return;
  }
  if (!entries.length) return;

  await mongoose.connection.transaction(async (session) => {
    const result = await Transaction.updateMany(
      { _id: { $in: entries.map((entry) => entry._id) } },
      { date: newDate },
      { session },
    );
    for (const itemId of affected) await recalculateItem(itemId, session);
    console.log(`\nRe-dated ${result.modifiedCount} opening balances on ${affected.length} items.`);
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
