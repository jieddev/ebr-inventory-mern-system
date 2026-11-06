// Permanently deletes a cost center's archived items, with everything that points to them:
// their transactions (ledger entries and reservations) and their lines on receiving report /
// batch out slips (a slip left with no lines is deleted too). Audit log entries are kept.
//
//   node scripts/delete-archived-items.js <cost-center>            preview: counts only, changes nothing
//   node scripts/delete-archived-items.js <cost-center> --confirm  deletes
//
// Cannot be undone. Back up the database first (mongodump).
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Item = require('../src/models/Item');
const Transaction = require('../src/models/Transaction');
const ReceivingReport = require('../src/models/ReceivingReport');
const { COST_CENTER_VALUES, isCostCenter } = require('../src/config/costCenters');

async function main() {
  const costCenter = process.argv[2];
  const confirm = process.argv.includes('--confirm');
  if (!isCostCenter(costCenter)) {
    console.error(`Usage: node scripts/delete-archived-items.js <${COST_CENTER_VALUES.join('|')}> [--confirm]`);
    process.exitCode = 1;
    return;
  }

  await connectDB();
  const items = await Item.find({ costCenter, archivedAt: { $ne: null } }).select('_id itemId code').lean();
  const itemIds = items.map((item) => item._id);
  const transactionCount = await Transaction.countDocuments({ item: { $in: itemIds } });
  const reports = await ReceivingReport.find({ 'lines.item': { $in: itemIds } }).select('lines.item').lean();
  const ids = new Set(itemIds.map(String));
  const emptied = reports.filter((report) => report.lines.every((line) => ids.has(String(line.item))));

  console.log(`Cost center: ${costCenter}`);
  console.log(`Archived items: ${items.length}`);
  for (const item of items.slice(0, 20)) console.log(`  ${item.itemId ?? '(no ID)'}  ${item.code}`);
  if (items.length > 20) console.log(`  … and ${items.length - 20} more`);
  console.log(`Transactions: ${transactionCount}`);
  console.log(`Slips with their lines: ${reports.length} (${emptied.length} would be left empty and deleted)`);

  if (!confirm) {
    console.log('\nPreview only. Nothing was deleted. Run again with --confirm to delete.');
    return;
  }
  if (!items.length) return;

  await mongoose.connection.transaction(async (session) => {
    const tx = await Transaction.deleteMany({ item: { $in: itemIds } }, { session });
    // Pulling lines skips the "1 to 12 lines" validator; slips left with no lines go next.
    await ReceivingReport.updateMany(
      { 'lines.item': { $in: itemIds } },
      { $pull: { lines: { item: { $in: itemIds } } } },
      { session },
    );
    const slips = await ReceivingReport.deleteMany({ _id: { $in: emptied.map((r) => r._id) } }, { session });
    const deleted = await Item.deleteMany({ _id: { $in: itemIds } }, { session });
    console.log(
      `\nDeleted ${deleted.deletedCount} items, ${tx.deletedCount} transactions, ${slips.deletedCount} empty slips.`,
    );
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
