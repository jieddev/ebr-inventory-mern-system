const Counter = require('../models/Counter');
const Item = require('../models/Item');

const COUNTER = 'itemId';

const formatItemId = (n) => `ITM-${String(n).padStart(5, '0')}`;

// Reserves `count` new item IDs in one step, e.g. ['ITM-00012', 'ITM-00013'].
// Numbers are never handed out twice, even if the item is later removed.
async function nextItemIds(count, session) {
  if (count <= 0) return [];
  const counter = await Counter.findOneAndUpdate(
    { _id: COUNTER },
    { $inc: { seq: count } },
    { upsert: true, returnDocument: 'after', session },
  );
  const first = counter.seq - count + 1;
  return Array.from({ length: count }, (_, i) => formatItemId(first + i));
}

// Gives an ID to items saved before item IDs existed, oldest first. Runs at startup.
async function backfillItemIds() {
  const items = await Item.find({ itemId: { $exists: false } })
    .sort({ createdAt: 1, _id: 1 })
    .select('_id')
    .lean();
  if (!items.length) return 0;

  const ids = await nextItemIds(items.length);
  await Item.bulkWrite(
    items.map((item, i) => ({ updateOne: { filter: { _id: item._id }, update: { itemId: ids[i] } } })),
  );
  return items.length;
}

module.exports = { nextItemIds, backfillItemIds };
