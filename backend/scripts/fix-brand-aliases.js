// One-time fix for items saved under another spelling of a brand (see BRAND_ALIASES in
// src/models/Item.js), e.g. "GOOD YEAR": renames their brand to the main one (GOODYEAR), so the
// Brand list shows it once. Only the item's brand changes; its ledger stays as it is.
//
//   node scripts/fix-brand-aliases.js --by=<admin user ID>
//
// Without --apply it only prints what it would do. With --apply it renames them all in one
// MongoDB transaction (all or nothing) and records the brand change in the Activity log.
// An item is skipped when its cost center already has the same item (code + type / design) under
// the main brand: those two would have to be merged, which this script doesn't do.
// Safe to re-run: renamed items no longer match.
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Item = require('../src/models/Item');
const { BRAND_ALIASES } = require('../src/models/Item');
const User = require('../src/models/User');
const AuditLog = require('../src/models/AuditLog');
const { costCenterLabel } = require('../src/config/costCenters');
const { itemTarget } = require('../src/services/audit.service');

function readArgs(argv) {
  const args = { apply: false };
  for (const arg of argv) {
    if (arg === '--apply') args.apply = true;
    const match = arg.match(/^--(by)=(.*)$/);
    if (match) args[match[1]] = match[2];
  }
  if (!args.by) throw new Error('Usage: node scripts/fix-brand-aliases.js --by=<admin user ID> [--apply]');
  return args;
}

async function planRenames() {
  // The raw collection: through the model, the brand setter would turn "GOOD YEAR" in the query
  // into "GOODYEAR" and match the items that are already right.
  const items = await Item.collection.find({ brand: { $in: Object.keys(BRAND_ALIASES) } }).sort({ itemId: 1 }).toArray();
  const plans = [];
  for (const item of items) {
    const to = BRAND_ALIASES[item.brand];
    const match = await Item.findOne({ costCenter: item.costCenter, code: item.code, brand: to, typeDesign: item.typeDesign }).lean();
    plans.push({ item, to, match, action: match ? 'skip' : 'rename' });
  }
  return plans;
}

function printPlan(plans) {
  console.table(
    plans.map(({ item, to, match, action }) => ({
      'Item ID': item.itemId,
      'Cost center': costCenterLabel(item.costCenter),
      Description: item.code,
      Brand: item.brand,
      Archived: item.archivedAt ? 'yes' : '',
      Action: action === 'skip' ? `skip: same item ${match.itemId} already under ${to}` : `rename to ${to}`,
    })),
  );
  const count = (action) => plans.filter((p) => p.action === action).length;
  console.log(`Rename: ${count('rename')} · Skip: ${count('skip')}`);
}

async function applyRenames(plans, admin) {
  const actor = { user: admin._id, userId: admin.userId, name: admin.name, role: admin.role };
  await mongoose.connection.transaction(async (session) => {
    const logs = [];
    for (const { item, to, action } of plans) {
      if (action !== 'rename') continue;
      await Item.updateOne({ _id: item._id }, { brand: to }, { session });
      logs.push({
        action: 'item.update',
        actor,
        costCenter: item.costCenter,
        target: itemTarget({ ...item, brand: to }),
        changes: { brand: { from: item.brand, to } },
        userAgent: 'scripts/fix-brand-aliases.js',
      });
    }
    if (logs.length) await AuditLog.create(logs, { session, ordered: true });
  });
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  await connectDB();

  const admin = await User.findOne({ userId: String(args.by).toLowerCase(), role: 'admin', isActive: true }).lean();
  if (!admin) throw new Error(`--by: no active admin account with the ID "${args.by}".`);

  const plans = await planRenames();
  if (!plans.length) {
    console.log(`Nothing to fix: no items use ${Object.keys(BRAND_ALIASES).join(' or ')}.`);
    return;
  }
  printPlan(plans);

  if (!args.apply) {
    console.log('\nDry run: nothing was changed. Run again with --apply to do it.');
    return;
  }
  await applyRenames(plans, admin);
  console.log('\nDone. Refresh the app on other PCs to see the change.');
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}
