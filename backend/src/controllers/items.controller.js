const mongoose = require('mongoose');
const Item = require('../models/Item');
const Transaction = require('../models/Transaction');
const ItemImport = require('../models/ItemImport');
const ReceivingReport = require('../models/ReceivingReport');
const User = require('../models/User');
const { DEFAULT_TYPES, DEFAULT_BRANDS, CATEGORIES, ACTIVE } = require('../models/Item');
const { BALANCE_FORWARDED, openingEntry } = require('../models/Transaction');
const { recalculateItem } = require('../services/balance.service');
const { nextItemIds, parseItemId } = require('../services/itemId.service');
const { readSummaryReport, buildSummaryReport, buildItemList } = require('../services/summaryReport.service');
const { broadcast, sourceClientId, EVERYONE } = require('../services/events.service');
const { record, diff, describe, itemTarget } = require('../services/audit.service');
const HttpError = require('../utils/httpError');
const { today, parseWholeNumber, parseObjectId, allWordsFilter, parsePage } = require('../utils/parse');
const { itemConditions, entryMatch, andFilter, itemSort, startOfToday } = require('../utils/filters');
const { findSimilarItems } = require('../services/similarItems.service');
const { costCenterFileName, costCenterLabel } = require('../config/costCenters');
const { can } = require('../config/permissions');

// What users without viewItemStock see of an item: its details and current ending balance,
// but nothing about its transactions (no last transaction date or type, no count).
const BASIC_ITEM_FIELDS = 'itemId category code brand typeDesign balance';
const ITEM_FIELDS =
  'itemId category code brand typeDesign balance balanceForwarded transactionCount lastTransactionDate lastTransactionType archivedAt';

// GET /api/items?search=&stock=&category=&typeDesign=&brand=&archived=&sort=&page=&limit=
// Every item in the cost center, by item ID or ?sort= (see utils/filters.js itemSort) (Items page). See utils/filters.js for the filters.
// ?archived=1 lists the archived items instead.
async function listItems(req, res) {
  const { page, limit, skip } = parsePage(req.query, { defaultLimit: 25, maxLimit: 100 });
  const seesStock = can(req.user, 'viewItemStock');
  if (req.query.archived === '1' && req.user.role !== 'admin') throw new HttpError(403, 'You do not have access to this action');
  // Without stock details they can't filter by stock either.
  const filter = itemsPageFilter(req.costCenter, seesStock ? req.query : { ...req.query, stock: '' });

  const { sort, collation } = itemSort(req.query, { itemId: 1, _id: 1 });

  const [total, items] = await Promise.all([
    Item.countDocuments(filter),
    Item.find(filter)
      .sort(sort)
      .collation(collation)
      .skip(skip)
      .limit(limit)
      .select(seesStock ? ITEM_FIELDS : BASIC_ITEM_FIELDS)
      .lean(),
  ]);
  res.json({
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    addedByNames: await addedByNames(req.query.addedBy),
  });
}

// { userId: name } for the Added by filter's chips, or undefined when it isn't set.
async function addedByNames(addedBy) {
  const ids = [].concat(addedBy ?? []).filter(Boolean);
  if (!ids.length) return undefined;
  const users = await User.find({ _id: { $in: ids } }).select('name').lean();
  return Object.fromEntries(users.map((user) => [String(user._id), user.name]));
}

// The Items page's cost center, search, filters and Active / Archived view as one Item filter.
// Shared by the list and the batch actions, so "all matching" means what the page shows.
function itemsPageFilter(costCenter, query) {
  const conditions = [{ costCenter }, ...itemConditions(query)];
  conditions.push(query.archived === '1' ? { archivedAt: { $ne: null } } : ACTIVE);
  const search = allWordsFilter(query.search, ['itemId', 'code', 'brand', 'typeDesign']);
  if (search) conditions.push(search);
  return andFilter(conditions);
}

// GET /api/items/search?q= — item code lookup for Add Transaction.
async function searchItems(req, res) {
  const q = Item.normalize(req.query.q);
  if (!q) return res.json({ items: [] });

  const items = await Item.find({ costCenter: req.costCenter, ...ACTIVE, ...allWordsFilter(q, ['code', 'itemId']) })
    .select(ITEM_FIELDS)
    .sort({ code: 1, brand: 1, typeDesign: 1 })
    .limit(20)
    .lean();

  // Codes that start with what was typed come first.
  items.sort((a, b) => b.code.startsWith(q) - a.code.startsWith(q));
  res.json({ items });
}

// GET /api/items/similar?code= — Add Item's "Do you mean this item?": up to 3 existing items in the
// cost center (archived too) whose description is close to `code`. No stock details.
async function similarItems(req, res) {
  res.json({ items: await findSimilarItems(req.costCenter, req.query.code) });
}

// GET /api/items/by-item-id/:itemId — Add Transaction's Item ID field. Accepts "ITM-00012" or just "12".
async function findByItemId(req, res) {
  const itemId = parseItemId(req.params.itemId);
  if (!itemId) throw new HttpError(400, 'Enter an item ID like ITM-00012');
  const item = await Item.findOne({ costCenter: req.costCenter, itemId }).select(ITEM_FIELDS).lean();
  if (!item) throw new HttpError(404, `No item has the ID ${itemId} in this cost center`);
  if (item.archivedAt) throw new HttpError(409, `${itemId} is archived. Restore it on the Items page first.`);
  res.json({ item });
}

// GET /api/items/types — Type / Design choices for Add Item.
async function listTypes(req, res) {
  const used = await Item.distinct('typeDesign', { costCenter: req.costCenter });
  const types = [...new Set([...DEFAULT_TYPES, ...used.filter(Boolean)])].sort();
  res.json({ types });
}

// GET /api/items/brands — Brand name choices for Add Item and Edit Item: the default brands and
// every brand already used in the cost center, A–Z.
async function listBrands(req, res) {
  const used = await Item.distinct('brand', { costCenter: req.costCenter });
  const brands = [...new Set([...DEFAULT_BRANDS, ...used.filter(Boolean)])].sort();
  res.json({ brands });
}

// GET /api/items/facets — choices and counts for the filter dropdown.
async function listFacets(req, res) {
  const countBy = (field) => [
    { $match: { [field]: { $nin: ['', null] } } },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, value: '$_id', count: 1 } },
  ];
  const whenBalance = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });
  const [facets] = await Item.aggregate([
    { $match: { costCenter: req.costCenter, ...ACTIVE } },
    {
      $facet: {
        categories: countBy('category'),
        typeDesigns: countBy('typeDesign'),
        brands: countBy('brand'),
        stock: [
          {
            $group: {
              _id: null,
              in: whenBalance({ $gt: ['$balance', 0] }),
              out: whenBalance({ $eq: ['$balance', 0] }),
              negative: whenBalance({ $lt: ['$balance', 0] }),
            },
          },
          { $project: { _id: 0 } },
        ],
        addedToday: [{ $match: { createdAt: { $gte: startOfToday() } } }, { $count: 'count' }],
        addedBy: countBy('createdBy'),
        addedByToday: [{ $match: { createdAt: { $gte: startOfToday() } } }, ...countBy('createdBy')],
      },
    },
  ]);

  // Who added items, by name: count is all of their items, todayCount the ones added today.
  const users = await User.find({ _id: { $in: facets.addedBy.map((u) => u.value) } }).select('name').lean();
  const nameOf = new Map(users.map((user) => [String(user._id), user.name]));
  const todayCountOf = new Map(facets.addedByToday.map((u) => [String(u.value), u.count]));
  const addedBy = facets.addedBy
    .map(({ value, count }) => ({
      value: String(value),
      label: nameOf.get(String(value)) ?? 'Removed user',
      count,
      todayCount: todayCountOf.get(String(value)) ?? 0,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Every category is listed, even ones no item uses yet.
  const categoryCounts = new Map(facets.categories.map((c) => [c.value, c.count]));
  res.json({
    categories: CATEGORIES.map((value) => ({ value, count: categoryCounts.get(value) ?? 0 })),
    typeDesigns: facets.typeDesigns,
    brands: facets.brands,
    addedToday: facets.addedToday[0]?.count ?? 0,
    addedBy,
    ...((can(req.user, 'viewItemStock') || can(req.user, 'addTransactions')) && { stock: facets.stock[0] ?? { in: 0, out: 0, negative: 0 } }),
  });
}

// GET /api/items/categories — Category choices for Add Item.
function listCategories(req, res) {
  res.json({ categories: CATEGORIES });
}

// The fields Add Item and Edit Item accept.
function parseItemFields(body = {}) {
  const fields = {
    category: Item.normalize(body.category),
    code: Item.normalize(body.code),
    brand: Item.normalize(body.brand),
    typeDesign: Item.normalize(body.typeDesign),
  };
  if (!CATEGORIES.includes(fields.category)) throw new HttpError(400, 'Select a category');
  if (!fields.code) throw new HttpError(400, 'Enter an item description');
  // Any whole number: a negative opening balance is allowed, as imports can bring them in.
  const balanceForwarded = body.balanceForwarded === '' || body.balanceForwarded == null ? 0 : Number(body.balanceForwarded);
  if (!Number.isInteger(balanceForwarded)) throw new HttpError(400, 'Balance forwarded must be a whole number');
  fields.balanceForwarded = balanceForwarded;
  return fields;
}

// 409 when another item in the cost center already has this code + brand + type / design.
async function assertKeyIsFree(costCenter, key, exceptId) {
  const filter = { costCenter, code: key.code, brand: key.brand, typeDesign: key.typeDesign };
  if (exceptId) filter._id = { $ne: exceptId };
  const other = await Item.findOne(filter).select('itemId archivedAt').lean();
  if (!other) return;
  if (other.archivedAt) {
    throw new HttpError(409, `${describe(key)} matches archived item ${other.itemId}. Restore it on the Items page instead.`);
  }
  throw new HttpError(409, `${describe(key)} already exists`);
}

// POST /api/items — Add Item. A balance forwarded other than 0 is also saved as an entry marked
// BALANCE FORWARDED (IN, or OUT when negative), like the opening row of each item in the Excel sheet.
async function createItem(req, res) {
  const { category, code, brand, typeDesign, balanceForwarded } = parseItemFields(req.body);
  const { costCenter } = req;
  await assertKeyIsFree(costCenter, { code, brand, typeDesign });

  const item = await mongoose.connection.transaction(async (session) => {
    const [itemId] = await nextItemIds(1, session);
    const [created] = await Item.create(
      [{ costCenter, itemId, category, code, brand, typeDesign, balanceForwarded, createdBy: req.user._id }],
      { session },
    );
    await record(req, { action: 'item.create', target: itemTarget(created), details: { category, balanceForwarded } }, session);
    if (balanceForwarded === 0) return created;

    await Transaction.create(
      [
        {
          item: created._id,
          date: today(),
          ...openingEntry(balanceForwarded),
          customerName: BALANCE_FORWARDED,
          isBalanceForwarded: true,
          createdBy: req.user._id,
        },
      ],
      { session },
    );
    return recalculateItem(created._id, session);
  });

  // Sent after the MongoDB transaction commits, so other PCs re-fetch the saved data.
  // `activity` is shown to everyone else as "[name] has added an item".
  broadcast(
    'item-changed',
    {
      itemId: String(item._id),
      activity: { kind: 'item', actorName: req.user.name, itemId: item.itemId, itemCode: describe(item) },
      sourceClientId: sourceClientId(req),
    },
    { permission: EVERYONE, costCenter: req.costCenter },
  );
  res.status(201).json({ item });
}

// PATCH /api/items/:id — Edit Item (admin). A new balance forwarded rewrites the item's
// BALANCE FORWARDED entry (adds or removes it when it goes from or to 0), then re-runs the ledger.
async function updateItem(req, res) {
  const id = parseObjectId(req.params.id, 'Item');
  const fields = parseItemFields(req.body);

  const item = await mongoose.connection.transaction(async (session) => {
    const current = await Item.findOne({ _id: id, costCenter: req.costCenter }).session(session);
    if (!current) throw new HttpError(404, 'Item not found');
    if (current.archivedAt) throw new HttpError(409, 'This item is archived. Restore it before editing.');
    await assertKeyIsFree(req.costCenter, fields, id);

    const changes = diff(current, fields, ['category', 'code', 'brand', 'typeDesign', 'balanceForwarded']);
    const balanceChanged = current.balanceForwarded !== fields.balanceForwarded;
    current.set(fields);
    await current.save({ session });
    if (changes) await record(req, { action: 'item.update', target: itemTarget(current), changes }, session);
    if (!balanceChanged) return current;

    const opening = await Transaction.findOne({ item: id, isBalanceForwarded: true }).session(session);
    if (fields.balanceForwarded === 0) {
      if (opening) await opening.deleteOne({ session });
    } else if (opening) {
      opening.set(openingEntry(fields.balanceForwarded));
      await opening.save({ session });
    } else {
      await Transaction.create(
        [
          {
            item: id,
            date: today(),
            ...openingEntry(fields.balanceForwarded),
            customerName: BALANCE_FORWARDED,
            isBalanceForwarded: true,
            createdBy: req.user._id,
          },
        ],
        { session },
      );
    }
    return recalculateItem(id, session);
  });

  broadcast('item-changed', { itemId: String(item._id) }, { permission: EVERYONE, costCenter: req.costCenter });
  res.json({ item: pickFields(item) });
}

// DELETE /api/items/:id — "Delete" archives the item (admin). Its ledger and item ID are kept.
async function archiveItem(req, res) {
  const id = parseObjectId(req.params.id, 'Item');
  const item = await Item.findOneAndUpdate(
    { _id: id, costCenter: req.costCenter, ...ACTIVE },
    { archivedAt: new Date(), archivedBy: req.user._id },
    { returnDocument: 'after' },
  )
    .select(ITEM_FIELDS)
    .lean();
  // Already archived: nothing to do.
  const result = item ?? (await Item.findOne({ _id: id, costCenter: req.costCenter }).select(ITEM_FIELDS).lean());
  if (!result) throw new HttpError(404, 'Item not found');

  if (item) {
    await record(req, { action: 'item.archive', target: itemTarget(item) });
    broadcast('item-changed', { itemId: String(id) }, { permission: EVERYONE, costCenter: req.costCenter });
  }
  res.json({ item: result });
}

// POST /api/items/:id/restore — bring an archived item back (admin).
async function restoreItem(req, res) {
  const id = parseObjectId(req.params.id, 'Item');
  const item = await Item.findOneAndUpdate(
    { _id: id, costCenter: req.costCenter, archivedAt: { $ne: null } },
    { archivedAt: null, $unset: { archivedBy: 1 } },
    { returnDocument: 'after' },
  )
    .select(ITEM_FIELDS)
    .lean();
  // Not archived: nothing to do.
  const result = item ?? (await Item.findOne({ _id: id, costCenter: req.costCenter }).select(ITEM_FIELDS).lean());
  if (!result) throw new HttpError(404, 'Item not found');

  if (item) {
    await record(req, { action: 'item.restore', target: itemTarget(item) });
    broadcast('item-changed', { itemId: String(id) }, { permission: EVERYONE, costCenter: req.costCenter });
  }
  res.json({ item: result });
}

const MAX_BATCH_IDS = 1000;

// POST /api/items/batch — archive or restore many items at once (admin).
// Body: { action: 'archive' | 'restore', ids: [...] } for picked items, or
// { action, all: true, query: { search, stock, added, addedBy, category, typeDesign, brand } } for every
// item matching the Items page's current search and filters.
async function batchItems(req, res) {
  const { action, ids, all, query = {} } = req.body ?? {};
  if (action !== 'archive' && action !== 'restore') throw new HttpError(400, 'Action must be archive or restore');

  // Archive acts on active items, restore on archived ones: the view the action comes from.
  const filter = itemsPageFilter(req.costCenter, { ...(all ? query : {}), archived: action === 'restore' ? '1' : '' });
  if (!all) {
    if (!Array.isArray(ids) || !ids.length) throw new HttpError(400, 'Select at least one item');
    if (ids.length > MAX_BATCH_IDS) throw new HttpError(400, `Select at most ${MAX_BATCH_IDS} items, or use "Select all"`);
    filter._id = { $in: ids.map((id) => parseObjectId(id, 'Item')) };
  }

  const update =
    action === 'archive'
      ? { archivedAt: new Date(), archivedBy: req.user._id }
      : { archivedAt: null, $unset: { archivedBy: 1 } };
  const { modifiedCount } = await Item.updateMany(filter, update);

  if (modifiedCount) {
    await record(req, {
      action: `item.batch_${action}`,
      details: all ? { count: modifiedCount, all: true, query } : { count: modifiedCount, selected: ids.length },
    });
    broadcast('item-changed', { batch: action, count: modifiedCount }, { permission: EVERYONE, costCenter: req.costCenter });
  }
  res.json({ action, count: modifiedCount });
}

// POST /api/items/import — body is an Excel file in the Summary Report format.
// Adds every new item to the cost center with its ending balance as BALANCE FORWARDED. Items that already
// exist, repeats within the file and invalid rows are skipped and reported back.
async function importItems(req, res) {
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, 'Choose an Excel file to import');
  const { rows, invalid, asOf } = await readSummaryReport(req.body);

  const existing = await Item.find({ costCenter: req.costCenter }).select('code brand typeDesign').lean();
  const keys = new Set(existing.map(itemKey));
  const toAdd = [];
  const skippedExisting = [];
  const skippedDuplicates = [];
  const firstRowByKey = new Map();
  for (const row of rows) {
    const key = itemKey(row);
    if (firstRowByKey.has(key)) skippedDuplicates.push({ ...pick(row), sameAsRow: firstRowByKey.get(key) });
    else if (keys.has(key)) skippedExisting.push(pick(row));
    else toAdd.push(row);
    if (!firstRowByKey.has(key)) firstRowByKey.set(key, row.row);
  }

  // The opening entry is dated the report's "as of" day, like the first row of an item's ledger.
  const date = asOf ?? today();
  let importId = null;
  await mongoose.connection.transaction(async (session) => {
    const itemIds = await nextItemIds(toAdd.length, session);
    const items = await Item.insertMany(
      toAdd.map((row, i) => ({
        costCenter: req.costCenter,
        itemId: itemIds[i],
        category: row.category,
        code: row.code,
        brand: row.brand,
        typeDesign: row.typeDesign,
        balanceForwarded: row.balance,
        // What recalculateItem() would give for a ledger with just the opening entry.
        balance: row.balance,
        transactionCount: row.balance !== 0 ? 1 : 0,
        lastTransactionDate: row.balance !== 0 ? date : undefined,
        lastTransactionType: row.balance !== 0 ? openingEntry(row.balance).type : undefined,
        createdBy: req.user._id,
      })),
      { session },
    );
    await Transaction.insertMany(
      items
        .filter((item) => item.balanceForwarded !== 0)
        .map((item) => ({
          item: item._id,
          date,
          ...openingEntry(item.balanceForwarded),
          customerName: BALANCE_FORWARDED,
          isBalanceForwarded: true,
          endingBalance: item.balanceForwarded,
          createdBy: req.user._id,
        })),
      { session },
    );
    // Remembered so it can be undone (undoImport).
    if (items.length) {
      const [saved] = await ItemImport.create(
        [
          {
            costCenter: req.costCenter,
            fileName: fileNameOf(req),
            asOf: date,
            items: items.map((item) => item._id),
            createdBy: req.user._id,
          },
        ],
        { session },
      );
      importId = saved._id;
    }
    await record(
      req,
      {
        action: 'item.import',
        details: {
          fileName: fileNameOf(req),
          added: toAdd.length,
          skippedExisting: skippedExisting.length,
          skippedDuplicates: skippedDuplicates.length,
          invalid: invalid.length,
        },
      },
      session,
    );
  });

  if (toAdd.length) {
    broadcast(
      'item-changed',
      {
        imported: toAdd.length,
        activity: { kind: 'import', actorName: req.user.name, count: toAdd.length },
        sourceClientId: sourceClientId(req),
      },
      { permission: EVERYONE, costCenter: req.costCenter },
    );
  }
  res.status(201).json({
    importId,
    added: toAdd.length,
    asOf: date,
    skippedExisting,
    skippedDuplicates,
    invalid,
  });
}

// The cost center's newest import that hasn't been undone: the only one that can be.
function newestImport(costCenter) {
  return ItemImport.findOne({ costCenter, undoneAt: null }).sort({ createdAt: -1, _id: -1 });
}

// GET /api/items/imports/latest — the import Undo import would undo, or null.
async function latestImport(req, res) {
  const found = await newestImport(req.costCenter).populate('createdBy', 'name').lean();
  res.json({
    import: found && {
      _id: found._id,
      fileName: found.fileName,
      asOf: found.asOf,
      added: found.items.length,
      createdAt: found.createdAt,
      createdByName: found.createdBy?.name ?? '',
    },
  });
}

// POST /api/items/imports/:id/undo — permanently removes the items the newest import added, with
// their opening balance entries. Refused when any of them has had other transactions or is on a
// receiving report / batch out slip since: those are real stock movements. Item IDs aren't reused.
async function undoImport(req, res) {
  const id = parseObjectId(req.params.id, 'Import');
  const newest = await newestImport(req.costCenter).select('_id').lean();
  if (!newest || !newest._id.equals(id)) throw new HttpError(409, 'Only the newest import can be undone');

  let undone;
  let removed = 0;
  await mongoose.connection.transaction(async (session) => {
    undone = await ItemImport.findOneAndUpdate(
      { _id: id, costCenter: req.costCenter, undoneAt: null },
      { undoneAt: new Date(), undoneBy: req.user._id },
      { returnDocument: 'after', session },
    );
    if (!undone) throw new HttpError(409, 'This import was already undone');

    const itemIds = undone.items;
    const [moved, onSlips] = await Promise.all([
      Transaction.distinct('item', { item: { $in: itemIds }, isBalanceForwarded: { $ne: true } }).session(session),
      ReceivingReport.distinct('lines.item', { 'lines.item': { $in: itemIds } }).session(session),
    ]);
    const usedIds = [...new Set([...moved, ...onSlips].map(String))];
    if (usedIds.length) {
      const used = await Item.find({ _id: { $in: usedIds } })
        .sort({ itemId: 1 })
        .limit(5)
        .select('itemId')
        .session(session)
        .lean();
      const names = used.map((item) => item.itemId).join(', ');
      const more = usedIds.length > used.length ? ` and ${usedIds.length - used.length} more` : '';
      throw new HttpError(
        409,
        `Can't undo this import: ${usedIds.length === 1 ? '1 of its items has' : `${usedIds.length} of its items have`} transactions since (${names}${more}). Roll those back first, or archive the items instead.`,
      );
    }

    await Transaction.deleteMany({ item: { $in: itemIds } }, { session });
    ({ deletedCount: removed } = await Item.deleteMany({ _id: { $in: itemIds }, costCenter: req.costCenter }, { session }));
    await record(
      req,
      {
        action: 'item.import_undo',
        details: { fileName: undone.fileName || undefined, removed, importedAt: undone.createdAt },
      },
      session,
    );
  });

  if (removed) {
    broadcast(
      'item-changed',
      {
        importUndone: removed,
        activity: { kind: 'import_undo', actorName: req.user.name, count: removed },
        sourceClientId: sourceClientId(req),
      },
      { permission: EVERYONE, costCenter: req.costCenter },
    );
  }
  res.json({ removed, fileName: undone.fileName });
}

// GET /api/items/export — every item in the cost center as an Excel file in the Summary Report layout.
async function exportItems(req, res) {
  const items = await Item.find({ costCenter: req.costCenter, ...ACTIVE }).sort({ itemId: 1, _id: 1 }).select(ITEM_FIELDS).lean();
  const asOf = today();
  const buffer = await buildSummaryReport(items, asOf, {
    title: 'Items Report',
    costCenterName: costCenterLabel(req.costCenter),
    preparedBy: req.user.name,
  });
  await record(req, { action: 'item.export', details: { count: items.length } });
  res
    .attachment(`EBR_Items_${costCenterFileName(req.costCenter)}_${asOf.toISOString().slice(0, 10)}.xlsx`)
    .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .send(Buffer.from(buffer));
}

// The Items page's sort choices as frontend utils/sorts.js names them, for the item list's title block.
const SORT_LABELS = {
  '': 'Item ID',
  description: 'Item description (A–Z)',
  'description-desc': 'Item description (Z–A)',
  brand: 'Brand name (A–Z)',
  'added-desc': 'Date added (newest first)',
  added: 'Date added (oldest first)',
};

// GET /api/items/export/list?search=&stock=&category=&brand=&sort= — the active items the Items page
// shows (same search, filters and sort, every page) as an Excel item list: item ID, category,
// brand name and item description. No stock, so anyone who can view items can export it.
async function exportItemList(req, res) {
  const seesStock = can(req.user, 'viewItemStock');
  const query = { ...req.query, archived: '', ...(seesStock ? {} : { stock: '' }) };
  const filter = itemsPageFilter(req.costCenter, query);
  const { sort, collation } = itemSort(query, { itemId: 1, _id: 1 });
  const items = await Item.find(filter).sort(sort).collation(collation).select('itemId category brand code').lean();
  const isFiltered = Boolean(String(query.search ?? '').trim()) || itemConditions(query).length > 0;
  const buffer = await buildItemList(items, {
    costCenterName: costCenterLabel(req.costCenter),
    preparedBy: req.user.name,
    isFiltered,
    sortLabel: SORT_LABELS[query.sort ?? ''] ?? 'Item ID',
  });
  await record(req, { action: 'item.list_export', details: { count: items.length, filtered: isFiltered } });
  res
    .attachment(`EBR_Item_List_${costCenterFileName(req.costCenter)}_${today().toISOString().slice(0, 10)}.xlsx`)
    .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .send(Buffer.from(buffer));
}

// GET /api/items/:id/transactions?type=&from=&to= — the item's full ledger, newest
// first ("View all"). The Transactions page passes its filters so only matching entries show.
async function listItemTransactions(req, res) {
  const id = parseObjectId(req.params.id, 'Item');
  const match = entryMatch(req.query);
  const item = await Item.findOne({ _id: id, costCenter: req.costCenter }).select(ITEM_FIELDS).lean();
  if (!item) throw new HttpError(404, 'Item not found');

  const transactions = await Transaction.find({ item: id, ...match })
    .sort({ isBalanceForwarded: 1, date: -1, _id: -1 })
    .select('date type quantity customerName neededBy notes endingBalance isBalanceForwarded')
    .lean();

  res.json({ item, transactions });
}

function itemKey({ code, brand, typeDesign }) {
  return `${code}\u0000${brand}\u0000${typeDesign}`;
}

// The ITEM_FIELDS of a saved item document, as the other endpoints return them.
function pickFields(item) {
  const plain = item.toObject ? item.toObject() : item;
  return Object.fromEntries(['_id', ...ITEM_FIELDS.split(' ')].map((key) => [key, plain[key] ?? null]));
}

function pick({ row, code, brand, typeDesign }) {
  return { row, code, brand, typeDesign };
}

// The import's file name, sent by the frontend as X-File-Name (the body is the raw file).
function fileNameOf(req) {
  try {
    return decodeURIComponent(req.get('X-File-Name') ?? '').slice(0, 200) || undefined;
  } catch {
    return undefined;
  }
}

module.exports = {
  listItems,
  searchItems,
  findByItemId,
  listTypes,
  listCategories,
  listBrands,
  similarItems,
  listFacets,
  createItem,
  updateItem,
  archiveItem,
  restoreItem,
  batchItems,
  importItems,
  latestImport,
  undoImport,
  exportItems,
  exportItemList,
  listItemTransactions,
};
