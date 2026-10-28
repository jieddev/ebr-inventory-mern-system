const mongoose = require('mongoose');
const Item = require('../models/Item');
const Transaction = require('../models/Transaction');
const { DEFAULT_TYPES, CATEGORIES } = require('../models/Item');
const { BALANCE_FORWARDED } = require('../models/Transaction');
const { recalculateItem } = require('../services/balance.service');
const { nextItemIds } = require('../services/itemId.service');
const { readSummaryReport, buildSummaryReport } = require('../services/summaryReport.service');
const { broadcast } = require('../services/events.service');
const HttpError = require('../utils/httpError');
const { today, parseWholeNumber, parseObjectId, containsRegex, parsePage } = require('../utils/parse');

const ITEM_FIELDS = 'itemId category code brand typeDesign balance balanceForwarded transactionCount lastTransactionDate lastTransactionType';

// GET /api/items?search=&category=&page=&limit= — every item, by item ID (admin Items page).
async function listItems(req, res) {
  const { page, limit, skip } = parsePage(req.query, { defaultLimit: 25, maxLimit: 100 });
  const search = String(req.query.search ?? '').trim();
  const category = Item.normalize(req.query.category);

  const filter = {};
  if (category) filter.category = category;
  if (search) {
    const rx = containsRegex(search);
    filter.$or = [{ itemId: rx }, { code: rx }, { brand: rx }, { typeDesign: rx }];
  }

  const [total, items] = await Promise.all([
    Item.countDocuments(filter),
    Item.find(filter).sort({ itemId: 1, _id: 1 }).skip(skip).limit(limit).select(ITEM_FIELDS).lean(),
  ]);
  res.json({ items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
}

// GET /api/items/search?q= — item code lookup for Add Transaction.
async function searchItems(req, res) {
  const q = Item.normalize(req.query.q);
  if (!q) return res.json({ items: [] });

  const items = await Item.find({ code: containsRegex(q) })
    .select(ITEM_FIELDS)
    .sort({ code: 1, brand: 1, typeDesign: 1 })
    .limit(20)
    .lean();

  // Codes that start with what was typed come first.
  items.sort((a, b) => b.code.startsWith(q) - a.code.startsWith(q));
  res.json({ items });
}

// GET /api/items/types — Type / Design choices for Add Item.
async function listTypes(req, res) {
  const used = await Item.distinct('typeDesign');
  const types = [...new Set([...DEFAULT_TYPES, ...used.filter(Boolean)])].sort();
  res.json({ types });
}

// GET /api/items/categories — Category choices for Add Item.
function listCategories(req, res) {
  res.json({ categories: CATEGORIES });
}

// POST /api/items — Add Item. A balance forwarded above 0 is also saved as an IN entry
// marked BALANCE FORWARDED, like the opening row of each item in the Excel sheet.
async function createItem(req, res) {
  const category = Item.normalize(req.body?.category);
  const code = Item.normalize(req.body?.code);
  const brand = Item.normalize(req.body?.brand);
  const typeDesign = Item.normalize(req.body?.typeDesign);
  if (!CATEGORIES.includes(category)) throw new HttpError(400, 'Select a category');
  if (!code) throw new HttpError(400, 'Enter an item code');
  const balanceForwarded = parseWholeNumber(req.body?.balanceForwarded ?? 0, 'Balance forwarded');

  if (await Item.exists({ code, brand, typeDesign })) {
    throw new HttpError(409, `${describe({ code, brand, typeDesign })} already exists`);
  }

  const item = await mongoose.connection.transaction(async (session) => {
    const [itemId] = await nextItemIds(1, session);
    const [created] = await Item.create([{ itemId, category, code, brand, typeDesign, balanceForwarded, createdBy: req.user._id }], {
      session,
    });
    if (balanceForwarded === 0) return created;

    await Transaction.create(
      [
        {
          item: created._id,
          date: today(),
          type: 'IN',
          quantity: balanceForwarded,
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
  broadcast('item-changed', { itemId: String(item._id) });
  res.status(201).json({ item });
}

// POST /api/items/import — body is an Excel file in the Summary Report format.
// Adds every new item with its ending balance as BALANCE FORWARDED. Items that already
// exist, repeats within the file and invalid rows are skipped and reported back.
async function importItems(req, res) {
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, 'Choose an Excel file to import');
  const { rows, invalid, asOf } = await readSummaryReport(req.body);

  const existing = await Item.find().select('code brand typeDesign').lean();
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
  await mongoose.connection.transaction(async (session) => {
    const itemIds = await nextItemIds(toAdd.length, session);
    const items = await Item.insertMany(
      toAdd.map((row, i) => ({
        itemId: itemIds[i],
        category: row.category,
        code: row.code,
        brand: row.brand,
        typeDesign: row.typeDesign,
        balanceForwarded: row.balance,
        // What recalculateItem() would give for a ledger with just the opening entry.
        balance: row.balance,
        transactionCount: row.balance > 0 ? 1 : 0,
        lastTransactionDate: row.balance > 0 ? date : undefined,
        lastTransactionType: row.balance > 0 ? 'IN' : undefined,
        createdBy: req.user._id,
      })),
      { session },
    );
    await Transaction.insertMany(
      items
        .filter((item) => item.balanceForwarded > 0)
        .map((item) => ({
          item: item._id,
          date,
          type: 'IN',
          quantity: item.balanceForwarded,
          customerName: BALANCE_FORWARDED,
          isBalanceForwarded: true,
          endingBalance: item.balanceForwarded,
          createdBy: req.user._id,
        })),
      { session },
    );
  });

  if (toAdd.length) broadcast('item-changed', { imported: toAdd.length });
  res.status(201).json({
    added: toAdd.length,
    asOf: date,
    skippedExisting,
    skippedDuplicates,
    invalid,
  });
}

// GET /api/items/export — every item as an Excel file in the Summary Report layout.
async function exportItems(req, res) {
  const items = await Item.find().sort({ itemId: 1, _id: 1 }).select(ITEM_FIELDS).lean();
  const asOf = today();
  const buffer = await buildSummaryReport(items, asOf);
  res
    .attachment(`EBR_Items_${asOf.toISOString().slice(0, 10)}.xlsx`)
    .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .send(Buffer.from(buffer));
}

// GET /api/items/:id/transactions — the item's full ledger, newest first ("View all").
async function listItemTransactions(req, res) {
  const id = parseObjectId(req.params.id, 'Item');
  const item = await Item.findById(id).select(ITEM_FIELDS).lean();
  if (!item) throw new HttpError(404, 'Item not found');

  const transactions = await Transaction.find({ item: id })
    .sort({ isBalanceForwarded: 1, date: -1, _id: -1 })
    .select('date type quantity customerName endingBalance isBalanceForwarded')
    .lean();

  res.json({ item, transactions });
}

function itemKey({ code, brand, typeDesign }) {
  return `${code}\u0000${brand}\u0000${typeDesign}`;
}

function pick({ row, code, brand, typeDesign }) {
  return { row, code, brand, typeDesign };
}

function describe({ code, brand, typeDesign }) {
  return [code, brand, typeDesign].filter(Boolean).join(' · ');
}

module.exports = {
  listItems,
  searchItems,
  listTypes,
  listCategories,
  createItem,
  importItems,
  exportItems,
  listItemTransactions,
};
