// One-time fix for items added in the wrong cost center: moves every item of a category from one
// cost center to another, with its whole ledger (transactions point to the item, not to a cost
// center), keeping its item ID (unique across all cost centers). When the target cost center
// already has the same item (code + brand + type / design), the item is merged into it: its
// entries move onto that item, the opening balances are added up into one BALANCE FORWARDED
// entry, and the emptied item is archived so its item ID stays in the history.
//
//   node scripts/move-items-cost-center.js --category="JUNK BATTERIES" --from=servitek --to=warehouse-1 --by=<admin user ID>
//
// Without --apply it only prints what it would do. With --apply it does it all in one MongoDB
// transaction (all or nothing) and records "Moved item to another cost center" in both cost
// centers' Activity logs. Safe to re-run: moved items are no longer in --from.
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Item = require('../src/models/Item');
const { CATEGORIES } = require('../src/models/Item');
const Transaction = require('../src/models/Transaction');
const { BALANCE_FORWARDED, openingEntry } = require('../src/models/Transaction');
const ReceivingReport = require('../src/models/ReceivingReport');
const User = require('../src/models/User');
const AuditLog = require('../src/models/AuditLog');
const { isCostCenter, costCenterLabel } = require('../src/config/costCenters');
const { recalculateItem } = require('../src/services/balance.service');
const { itemTarget, describe } = require('../src/services/audit.service');

function readArgs(argv) {
  const args = { apply: false };
  for (const arg of argv) {
    if (arg === '--apply') args.apply = true;
    const match = arg.match(/^--(category|from|to|by)=(.*)$/);
    if (match) args[match[1]] = match[2];
  }
  const usage =
    'Usage: node scripts/move-items-cost-center.js --category="JUNK BATTERIES" --from=servitek --to=warehouse-1 --by=<admin user ID> [--apply]';
  const category = Item.normalize(args.category);
  if (!CATEGORIES.includes(category)) throw new Error(`Unknown category "${args.category ?? ''}".\n${usage}`);
  if (!isCostCenter(args.from) || !isCostCenter(args.to)) throw new Error(`--from and --to must be cost centers.\n${usage}`);
  if (args.from === args.to) throw new Error('--from and --to must be different cost centers.');
  if (!args.by) throw new Error(`--by is required (the admin doing the move, for the Activity log).\n${usage}`);
  return { ...args, category };
}

// What to do with each item: move, merge into an item of the target cost center, or skip.
async function planMoves({ category, from, to }) {
  const items = await Item.find({ costCenter: from, category }).sort({ itemId: 1 }).lean();
  const plans = [];
  for (const item of items) {
    const [transactionCount, transferLegs, match] = await Promise.all([
      Transaction.countDocuments({ item: item._id }),
      Transaction.countDocuments({ item: item._id, transfer: { $ne: null } }),
      Item.findOne({ costCenter: to, code: item.code, brand: item.brand, typeDesign: item.typeDesign }).lean(),
    ]);
    let action = match ? 'merge' : 'move';
    let reason = '';
    if (transferLegs) {
      action = 'skip';
      reason = `has ${transferLegs} stock transfer entr${transferLegs === 1 ? 'y' : 'ies'}`;
    } else if (match?.archivedAt) {
      action = 'skip';
      reason = `same item ${match.itemId} in ${costCenterLabel(to)} is archived; restore it first`;
    }
    plans.push({ item, match, action, reason, transactionCount });
  }
  return plans;
}

function printPlan(plans, { from, to }) {
  console.log(`\n${costCenterLabel(from)} → ${costCenterLabel(to)}\n`);
  const rows = plans.map(({ item, match, action, reason, transactionCount }) => ({
    'Item ID': item.itemId,
    Description: item.code,
    Brand: item.brand || '—',
    Balance: item.balance,
    Entries: transactionCount,
    Archived: item.archivedAt ? 'yes' : '',
    Action: action === 'merge' ? `merge into ${match.itemId}` : action === 'skip' ? `skip: ${reason}` : 'move',
  }));
  console.table(rows);
  const count = (action) => plans.filter((p) => p.action === action).length;
  console.log(`Move: ${count('move')} · Merge: ${count('merge')} · Skip: ${count('skip')}`);
}

// Folds S's opening balance into W's, so W keeps a single BALANCE FORWARDED entry.
async function mergeOpening(source, target, session) {
  const total = (target.balanceForwarded ?? 0) + (source.balanceForwarded ?? 0);
  // One after the other: a MongoDB transaction can't run operations in parallel.
  const targetOpening = await Transaction.findOne({ item: target._id, isBalanceForwarded: true }).session(session);
  const sourceOpening = await Transaction.findOne({ item: source._id, isBalanceForwarded: true }).session(session);
  if (total === 0) {
    if (targetOpening) await targetOpening.deleteOne({ session });
    if (sourceOpening) await sourceOpening.deleteOne({ session });
  } else if (targetOpening) {
    targetOpening.set(openingEntry(total));
    await targetOpening.save({ session });
    if (sourceOpening) await sourceOpening.deleteOne({ session });
  } else if (sourceOpening) {
    // W had none: S's opening entry (with its date) becomes W's.
    sourceOpening.set({ item: target._id, ...openingEntry(total) });
    await sourceOpening.save({ session });
  } else {
    // Balance forwarded set but no entry (shouldn't happen): create one dated today.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await Transaction.create(
      [{ item: target._id, date: today, ...openingEntry(total), customerName: BALANCE_FORWARDED, isBalanceForwarded: true }],
      { session },
    );
  }
  await Item.updateOne({ _id: target._id }, { balanceForwarded: total }, { session });
}

async function applyMoves(plans, { from, to }, admin) {
  const actor = { user: admin._id, userId: admin.userId, name: admin.name, role: admin.role };
  await mongoose.connection.transaction(async (session) => {
    const logs = [];
    for (const { item, match, action, transactionCount } of plans) {
      if (action === 'skip') continue;
      const details = { fromCostCenter: from, toCostCenter: to, transactionCount };
      if (action === 'move') {
        await Item.updateOne({ _id: item._id }, { costCenter: to }, { session });
      } else {
        await Transaction.updateMany({ item: item._id, isBalanceForwarded: { $ne: true } }, { item: match._id }, { session });
        await mergeOpening(item, match, session);
        await recalculateItem(match._id, session);
        await Item.updateOne(
          { _id: item._id },
          { archivedAt: item.archivedAt ?? new Date(), archivedBy: item.archivedBy ?? admin._id, balanceForwarded: 0 },
          { session },
        );
        await recalculateItem(item._id, session);
        details.mergedInto = match.itemId;
        details.mergedIntoCode = describe(match);
      }
      for (const costCenter of [from, to]) {
        logs.push({ action: 'item.move', actor, costCenter, target: itemTarget(item), details, userAgent: 'scripts/move-items-cost-center.js' });
      }
    }
    if (logs.length) await AuditLog.create(logs, { session, ordered: true });
  });
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  await connectDB();

  const admin = await User.findOne({ userId: String(args.by).toLowerCase(), role: 'admin', isActive: true }).lean();
  if (!admin) throw new Error(`--by: no active admin account with the ID "${args.by}".`);

  const plans = await planMoves(args);
  if (!plans.length) {
    console.log(`Nothing to move: no ${args.category} items in ${costCenterLabel(args.from)}.`);
    return;
  }
  printPlan(plans, args);

  const ids = plans.filter((p) => p.action !== 'skip').map((p) => p.item._id);
  const entryIds = await Transaction.distinct('_id', { item: { $in: ids } });
  const slipLines = await ReceivingReport.countDocuments({ 'lines.transaction': { $in: entryIds } });
  if (slipLines) {
    console.log(
      `${slipLines} receiving report / batch out slip(s) include these items. The slips stay filed under ` +
        `${costCenterLabel(args.from)}; their entries move with the items.`,
    );
  }

  if (!args.apply) {
    console.log('\nDry run: nothing was changed. Run again with --apply to do it.');
    return;
  }
  await applyMoves(plans, args, admin);
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
