// One-time move to cost centers: everything saved before them belongs to Servitek, and the
// item key becomes cost center + code + brand + type / design. Run it before starting the
// updated API. Safe to re-run: once everything has a cost center, it changes nothing.
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Item = require('../src/models/Item');
const ReceivingReport = require('../src/models/ReceivingReport');
const User = require('../src/models/User');
const { DEFAULT_COST_CENTER } = require('../src/config/costCenters');

const noCostCenter = { $or: [{ costCenter: { $exists: false } }, { costCenter: null }, { costCenter: '' }] };

async function main() {
  await connectDB();

  const items = await Item.updateMany(noCostCenter, { $set: { costCenter: DEFAULT_COST_CENTER } });
  const reports = await ReceivingReport.updateMany(noCostCenter, { $set: { costCenter: DEFAULT_COST_CENTER } });
  // Admins have no cost center: they switch between all of them.
  const users = await User.updateMany(
    { role: { $ne: 'admin' }, ...noCostCenter },
    { $set: { costCenter: DEFAULT_COST_CENTER } },
  );

  // syncIndexes drops indexes the schemas no longer define and builds the new ones. That
  // removes the old unique code + brand + type / design index (code_1_brand_1_typeDesign_1),
  // which would stop two cost centers from having the same item.
  const droppedItem = await Item.syncIndexes();
  const droppedReport = await ReceivingReport.syncIndexes();

  console.log(
    `Set ${DEFAULT_COST_CENTER} on ${items.modifiedCount} item(s), ${reports.modifiedCount} receiving report(s) ` +
      `and ${users.modifiedCount} user(s).`,
  );
  const dropped = [...droppedItem, ...droppedReport];
  console.log(dropped.length ? `Dropped old indexes: ${dropped.join(', ')}.` : 'Indexes were already up to date.');
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
