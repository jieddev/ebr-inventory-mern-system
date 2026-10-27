const mongoose = require('mongoose');
const Item = require('../models/Item');
const Transaction = require('../models/Transaction');
const { DEFAULT_TYPES } = require('../models/Item');
const { BALANCE_FORWARDED } = require('../models/Transaction');
const { recalculateItem } = require('../services/balance.service');
const HttpError = require('../utils/httpError');
const { today, parseWholeNumber, parseObjectId, containsRegex } = require('../utils/parse');

const ITEM_FIELDS = 'code brand typeDesign balance balanceForwarded transactionCount lastTransactionDate lastTransactionType';

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

// POST /api/items — Add Item. A balance forwarded above 0 is also saved as an IN entry
// marked BALANCE FORWARDED, like the opening row of each item in the Excel sheet.
async function createItem(req, res) {
  const code = Item.normalize(req.body?.code);
  const brand = Item.normalize(req.body?.brand);
  const typeDesign = Item.normalize(req.body?.typeDesign);
  if (!code) throw new HttpError(400, 'Enter an item code');
  const balanceForwarded = parseWholeNumber(req.body?.balanceForwarded ?? 0, 'Balance forwarded');

  if (await Item.exists({ code, brand, typeDesign })) {
    throw new HttpError(409, `${describe({ code, brand, typeDesign })} already exists`);
  }

  const item = await mongoose.connection.transaction(async (session) => {
    const [created] = await Item.create([{ code, brand, typeDesign, balanceForwarded, createdBy: req.user._id }], {
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

  res.status(201).json({ item });
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

function describe({ code, brand, typeDesign }) {
  return [code, brand, typeDesign].filter(Boolean).join(' · ');
}

module.exports = { searchItems, listTypes, createItem, listItemTransactions };
