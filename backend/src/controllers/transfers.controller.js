const mongoose = require('mongoose');
const Item = require('../models/Item');
const Transaction = require('../models/Transaction');
const StockTransfer = require('../models/StockTransfer');
const { LINE_LIMIT } = require('../models/StockTransfer');
const { recalculateItem } = require('../services/balance.service');
const { record, describe } = require('../services/audit.service');
const HttpError = require('../utils/httpError');
const { parseDay, parseWholeNumber, parseObjectId } = require('../utils/parse');
const { costCenterLabel, isCostCenter, userCostCenters } = require('../config/costCenters');
const { announceIn, inCostCenter } = require('./transactions.controller');

// The CUSTOMER NAME on each leg: "TRANSFER TO SERVITEK (#2 - #7) - No. 1234".
function legText(direction, costCenter, reference) {
  const text = `TRANSFER ${direction} ${costCenterLabel(costCenter).toUpperCase()}`;
  return (reference ? `${text} - No. ${reference}` : text).slice(0, 120);
}

const lineDetails = (line, fromItem, toItem) => ({
  outQuantity: line.outQuantity,
  inQuantity: line.inQuantity,
  from: { itemId: fromItem.itemId, code: describe(fromItem) },
  to: { itemId: toItem.itemId, code: describe(toItem) },
});

// POST /api/transfers { fromCostCenter, toCostCenter, date, reference, notes,
//   lines: [{ fromItemId, toItemId, outQuantity, inQuantity }] } (quantity alone: the same on both sides)
// Moves stock between two of the user's cost centers (admins: any two). Every line becomes an OUT
// on the From item and an IN on the To item, linked to each other and to the transfer, all in one
// MongoDB transaction so a transfer is never half saved. Items are never created here: both sides
// are items the user picked.
async function createTransfer(req, res) {
  const body = req.body ?? {};
  const from = String(body.fromCostCenter ?? '');
  const to = String(body.toCostCenter ?? '');
  if (!isCostCenter(from) || !isCostCenter(to)) throw new HttpError(400, 'Choose the From and To cost centers');
  if (from === to) throw new HttpError(400, 'From and To must be different cost centers');
  const allowed = userCostCenters(req.user);
  if (!allowed.includes(from) || !allowed.includes(to)) {
    throw new HttpError(403, "You can only transfer between cost centers you're assigned to");
  }

  const date = parseDay(body.date);
  const reference = String(body.reference ?? '').trim();
  if (reference && !/^\d{1,12}$/.test(reference)) throw new HttpError(400, 'Reference no.: type only the number (e.g. 1234)');
  const notes = String(body.notes ?? '').trim().slice(0, 300);

  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  if (!rawLines.length) throw new HttpError(400, 'Enter at least one item to transfer');
  if (rawLines.length > LINE_LIMIT) throw new HttpError(400, `A transfer has at most ${LINE_LIMIT} lines`);
  const lines = rawLines.map((line, i) => ({
    fromItem: parseObjectId(line?.fromItemId, `Line ${i + 1}: From item`),
    toItem: parseObjectId(line?.toItemId, `Line ${i + 1}: To item`),
    outQuantity: parseWholeNumber(line?.outQuantity ?? line?.quantity, `Line ${i + 1}: quantity out`, { min: 1 }),
    inQuantity: parseWholeNumber(line?.inQuantity ?? line?.quantity, `Line ${i + 1}: quantity in`, { min: 1 }),
  }));

  const result = await mongoose.connection.transaction(async (session) => {
    const load = (costCenter, ids) =>
      Item.find({ _id: { $in: [...new Set(ids.map(String))] }, costCenter })
        .select('itemId code brand typeDesign archivedAt')
        .session(session)
        .lean()
        .then((items) => new Map(items.map((item) => [String(item._id), item])));
    // One after the other: a MongoDB transaction can't run operations in parallel.
    const fromItems = await load(from, lines.map((l) => l.fromItem));
    const toItems = await load(to, lines.map((l) => l.toItem));
    lines.forEach((line, i) => {
      for (const [side, map, id, costCenter] of [
        ['From', fromItems, line.fromItem, from],
        ['To', toItems, line.toItem, to],
      ]) {
        const item = map.get(String(id));
        if (!item) throw new HttpError(404, `Line ${i + 1}: the ${side} item isn't in ${costCenterLabel(costCenter)}`);
        if (item.archivedAt) {
          throw new HttpError(409, `Line ${i + 1}: ${item.itemId} is archived. Restore it on the Items page first.`);
        }
      }
    });

    const transferId = new mongoose.Types.ObjectId();
    const legs = await Transaction.create(
      lines.flatMap((line) => [
        { item: line.fromItem, date, type: 'OUT', quantity: line.outQuantity, customerName: legText('TO', to, reference), transfer: transferId, createdBy: req.user._id },
        { item: line.toItem, date, type: 'IN', quantity: line.inQuantity, customerName: legText('FROM', from, reference), transfer: transferId, createdBy: req.user._id },
      ]),
      { session, ordered: true },
    );
    lines.forEach((line, i) => {
      line.outTransaction = legs[i * 2]._id;
      line.inTransaction = legs[i * 2 + 1]._id;
    });
    const [transfer] = await StockTransfer.create(
      [{ _id: transferId, fromCostCenter: from, toCostCenter: to, date, reference, notes, lines, createdBy: req.user._id }],
      { session },
    );

    const fromIds = [...fromItems.keys()];
    const toIds = [...toItems.keys()];
    const fromSaved = [];
    const toSaved = [];
    for (const id of fromIds) fromSaved.push(await recalculateItem(id, session));
    for (const id of toIds) toSaved.push(await recalculateItem(id, session));

    const totalOut = lines.reduce((sum, line) => sum + line.outQuantity, 0);
    const totalIn = lines.reduce((sum, line) => sum + line.inQuantity, 0);
    const label = reference ? `Stock transfer No. ${reference}` : 'Stock transfer';
    const details = {
      fromCostCenter: from,
      toCostCenter: to,
      date,
      reference,
      notes,
      lineCount: lines.length,
      totalOut,
      totalIn,
      lines: lines.map((line) => lineDetails(line, fromItems.get(String(line.fromItem)), toItems.get(String(line.toItem)))),
    };
    // Both cost centers' Activity logs show it.
    for (const costCenter of [from, to]) {
      await record(
        inCostCenter(req, costCenter),
        { action: 'transfer.create', target: { type: 'transfer', id: transfer._id, label }, details },
        session,
      );
    }
    return { transfer: transfer.toObject(), fromSaved, toSaved, totalOut, totalIn };
  });

  const activity = { kind: 'transfer', fromCostCenter: from, toCostCenter: to, totalOut: result.totalOut, totalIn: result.totalIn, lineCount: lines.length };
  announceIn(req, from, result.fromSaved, activity);
  announceIn(req, to, result.toSaved, activity);
  res.status(201).json({ transfer: result.transfer });
}

module.exports = { createTransfer };
