const mongoose = require('mongoose');
const Item = require('../models/Item');
const Transaction = require('../models/Transaction');
const ReceivingReport = require('../models/ReceivingReport');
const { LINE_LIMIT, UNITS, kindFilter } = require('../models/ReceivingReport');
const { recalculateItem } = require('../services/balance.service');
const { broadcast, sourceClientId, EVERYONE } = require('../services/events.service');
const { record } = require('../services/audit.service');
const HttpError = require('../utils/httpError');
const { parseDay, parseWholeNumber, parseObjectId } = require('../utils/parse');

// Same clean-up as a transaction's customer name: trimmed, single spaces, uppercase.
const clean = (value, max) => String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase().slice(0, max);

// The CUSTOMER NAME saved on each transaction, as the workbook's BRR form writes it:
// both → "BIS# 92479 - No. 46954", only one → just that one.
function customerText(customerName, reportNo) {
  if (customerName && reportNo) return `${customerName} - No. ${reportNo}`;
  return reportNo ? `No. ${reportNo}` : customerName;
}

// What differs between the two slips.
const SLIPS = {
  IN: { person: 'receivedBy', action: 'receiving.create', name: 'Receiving report' },
  OUT: { person: 'releasedBy', action: 'batchout.create', name: 'Batch out' },
};

// The last slip of this kind with this Ref. No. in the cost center.
const findSlip = (costCenter, kind, reportNo) =>
  ReceivingReport.findOne({ costCenter, reportNo, ...kindFilter(kind) }).sort({ createdAt: -1 }).select('createdAt').lean();

// GET /api/receiving-reports/check?reportNo=&kind=IN|OUT — has this slip been saved before in the
// cost center? Receiving reports and Batch Out slips are numbered separately.
async function checkReportNo(req, res) {
  const reportNo = String(req.query.reportNo ?? '').trim();
  const kind = String(req.query.kind ?? 'IN').toUpperCase() === 'OUT' ? 'OUT' : 'IN';
  if (!reportNo) return res.json({ existing: null });
  const existing = await findSlip(req.costCenter, kind, reportNo);
  res.json({ existing: existing && { savedAt: existing.createdAt } });
}

// POST /api/receiving-reports — save a BRR: every line becomes an IN transaction.
// POST /api/receiving-reports/out — save a Batch Out slip: every line becomes an OUT transaction.
// All in one MongoDB transaction, so a slip is never half saved.
// Body: { date, customerName, receivedBy | releasedBy, reportNo, lines: [{ itemId, quantity, unit }],
//         allowDuplicate }. A Ref. No. saved before needs allowDuplicate: true (409 otherwise),
// because saving it again moves the stock a second time.
const createReceivingReport = (req, res) => createSlip(req, res, 'IN');
const createBatchOut = (req, res) => createSlip(req, res, 'OUT');

async function createSlip(req, res, kind) {
  const slip = SLIPS[kind];
  const body = req.body ?? {};
  const date = parseDay(body.date);
  const reportNo = String(body.reportNo ?? '').trim();
  if (reportNo && !/^\d{1,12}$/.test(reportNo)) {
    throw new HttpError(400, 'Ref. No.: type only the number printed on the slip (e.g. 46954)');
  }
  const customerName = clean(body.customerName, 120);
  const person = clean(body[slip.person], 80);

  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  if (!rawLines.length) throw new HttpError(400, 'Enter at least one quantity and item');
  if (rawLines.length > LINE_LIMIT) throw new HttpError(400, `A slip has at most ${LINE_LIMIT} lines`);
  const lines = rawLines.map((line, i) => {
    const label = `Line ${i + 1}`;
    const unit = String(line?.unit ?? 'pcs').toLowerCase();
    if (!UNITS.includes(unit)) throw new HttpError(400, `${label}: unit must be one of ${UNITS.join(', ')}`);
    return {
      item: parseObjectId(line?.itemId, `${label}: item`),
      quantity: parseWholeNumber(line?.quantity, `${label}: quantity`, { min: 1 }),
      unit,
    };
  });

  if (reportNo && !body.allowDuplicate) {
    const existing = await findSlip(req.costCenter, kind, reportNo);
    if (existing) {
      return res.status(409).json({
        code: 'DUPLICATE_REPORT',
        savedAt: existing.createdAt,
        message: `${slip.name} No. ${reportNo} was already saved. Saving it again moves its items a second time.`,
      });
    }
  }

  const custText = customerText(customerName, reportNo);
  const result = await mongoose.connection.transaction(async (session) => {
    const itemIds = [...new Set(lines.map((line) => String(line.item)))];
    const items = await Item.find({ _id: { $in: itemIds }, costCenter: req.costCenter }).select('itemId code brand typeDesign archivedAt').session(session).lean();
    const byId = new Map(items.map((item) => [String(item._id), item]));
    lines.forEach((line, i) => {
      const item = byId.get(String(line.item));
      if (!item) throw new HttpError(404, `Line ${i + 1}: item not found`);
      if (item.archivedAt) throw new HttpError(409, `Line ${i + 1}: ${item.itemId} is archived. Restore it on the Items page first.`);
    });

    const transactions = await Transaction.create(
      lines.map((line) => ({
        item: line.item,
        date,
        type: kind,
        quantity: line.quantity,
        customerName: custText,
        createdBy: req.user._id,
      })),
      { session, ordered: true },
    );
    lines.forEach((line, i) => {
      line.transaction = transactions[i]._id;
    });

    const [report] = await ReceivingReport.create(
      [{ costCenter: req.costCenter, kind, reportNo, date, customerName, [slip.person]: person, lines, createdBy: req.user._id }],
      { session },
    );
    for (const id of itemIds) await recalculateItem(id, session);

    const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
    await record(
      req,
      {
        action: slip.action,
        target: { type: 'receiving', id: report._id, label: reportNo ? `${slip.name} No. ${reportNo}` : slip.name },
        details: {
          reportNo,
          date,
          customerName: custText,
          [slip.person]: person,
          lineCount: lines.length,
          totalQuantity,
          lines: lines.map((line) => ({
            itemId: byId.get(String(line.item)).itemId,
            code: byId.get(String(line.item)).code,
            quantity: line.quantity,
            unit: line.unit,
          })),
          duplicateOf: body.allowDuplicate ? reportNo : undefined,
        },
      },
      session,
    );
    return { report, itemIds, totalQuantity };
  });

  // After the commit: other PCs re-fetch each item, and see one notification for the slip.
  // The per-item refreshes carry no transaction details, so everyone gets them (balances).
  for (const itemId of result.itemIds) {
    broadcast('item-changed', { itemId, sourceClientId: sourceClientId(req) }, { permission: EVERYONE, costCenter: req.costCenter });
  }
  broadcast('item-changed', {
    activity: {
      kind: 'transaction',
      actorName: req.user.name,
      type: kind,
      quantity: result.totalQuantity,
      itemCode: `${result.itemIds.length} item${result.itemIds.length === 1 ? '' : 's'}${reportNo ? ` (${slip.name.toLowerCase()} No. ${reportNo})` : ''}`,
    },
    sourceClientId: sourceClientId(req),
  }, { costCenter: req.costCenter });

  res.status(201).json({ report: result.report, customerName: custText, totalQuantity: result.totalQuantity });
}

module.exports = { checkReportNo, createReceivingReport, createBatchOut, customerText };
