const ExcelJS = require('exceljs');
const Item = require('../models/Item');
const { CATEGORIES } = require('../models/Item');
const HttpError = require('../utils/httpError');

const SHEET_NAME = 'Summary Report';
// How far down the importer looks for the column headers.
const HEADER_SEARCH_ROWS = 20;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

// TYPE / DESIGN → category, for files that have no CATEGORY column.
const CATEGORY_BY_TYPE = {
  TIRE: 'TIRES',
  TUBE: 'TUBES',
  FLAP: 'FLAPS',
  BATTERY: 'BATTERIES',
  OIL: 'OIL',
  GULF: 'OIL',
  CHEMICAL: 'CHEMICAL',
  'BRAKE FLUID': 'FLUID',
  COOLANT: 'FLUID',
  GAS: 'GASES',
};

// BOSCH rows are mostly parts (filters, brake pads, spark plugs, wipers) plus some batteries ("... BATT BOSCH").
// Anything that isn't a current category falls back to OTHERS, so a renamed category can't break an import.
function categoryFor(code, typeDesign) {
  const category =
    typeDesign === 'BOSCH' ? (/\bBATT/.test(code) ? 'BATTERIES' : 'PARTS & ACCESSORIES') : CATEGORY_BY_TYPE[typeDesign];
  return CATEGORIES.includes(category) ? category : 'OTHERS';
}

// The value Excel shows, whatever the cell holds (formula, rich text, hyperlink, ...).
function cellValue(cell) {
  const value = cell.value;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if ('result' in value) return value.result ?? null;
    if ('richText' in value) return value.richText.map((part) => part.text).join('');
    if ('text' in value) return value.text;
    if ('error' in value) return null;
  }
  return value ?? null;
}

const cellText = (cell) => {
  const value = cellValue(cell);
  return value instanceof Date ? '' : String(value ?? '');
};

// "October 26, 2026" → Date at UTC midnight, or null.
function parseLongDate(text) {
  const match = /([a-z]+)\s+(\d{1,2}),?\s+(\d{4})/i.exec(text);
  const month = match ? MONTHS.indexOf(match[1].toLowerCase()) : -1;
  return month < 0 ? null : new Date(Date.UTC(+match[3], month, +match[2]));
}

// Reads the "Summary Report" sheet: ITEM DESCRIPTION (or ITEM CODE, in older files), BRAND NAME, TYPE / DESIGN and
// "ENDING BALANCE AS OF <date>" (CATEGORY is optional). Columns are found by their
// header, so files exported from the Items page can be imported again.
// Returns the valid rows, the rows that can't be imported, and the "as of" date.
async function readSummaryReport(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new HttpError(400, 'This file could not be read. Choose an Excel file (.xlsx or .xlsm).');
  }

  const sheet =
    workbook.worksheets.find((ws) => ws.name.trim().toLowerCase() === SHEET_NAME.toLowerCase()) ??
    workbook.worksheets[0];
  if (!sheet) throw new HttpError(400, 'This file has no sheets.');

  // Exports start with a title block (report name, dates, prepared by), so the column headers
  // are on the first row that has ITEM DESCRIPTION (or ITEM CODE), not always row 1.
  const isCodeHeader = (cell) => ['ITEM DESCRIPTION', 'ITEM CODE'].includes(Item.normalize(cellText(cell)));
  let headerRow = 1;
  for (let r = 1; r <= Math.min(sheet.rowCount, HEADER_SEARCH_ROWS); r++) {
    let found = false;
    sheet.getRow(r).eachCell((cell) => {
      if (isCodeHeader(cell)) found = true;
    });
    if (found) {
      headerRow = r;
      break;
    }
  }

  const columns = {};
  sheet.getRow(headerRow).eachCell((cell, col) => {
    const header = Item.normalize(cellText(cell));
    if (header === 'ITEM DESCRIPTION' || header === 'ITEM CODE') columns.code = col;
    else if (header === 'BRAND NAME') columns.brand = col;
    else if (header === 'TYPE / DESIGN' || header === 'TYPE/DESIGN') columns.typeDesign = col;
    else if (header === 'CATEGORY') columns.category = col;
    else if (header.startsWith('ENDING BALANCE')) {
      columns.balance = col;
      columns.asOf = parseLongDate(header);
    }
  });
  const missing = [
    ['code', 'ITEM DESCRIPTION'],
    ['brand', 'BRAND NAME'],
    ['typeDesign', 'TYPE / DESIGN'],
    ['balance', 'ENDING BALANCE'],
  ].filter(([key]) => !columns[key]);
  if (missing.length) {
    throw new HttpError(
      400,
      `The "${sheet.name}" sheet doesn't follow the Summary Report format. Missing column: ${missing.map(([, label]) => label).join(', ')}.`,
    );
  }

  const rows = [];
  const invalid = [];
  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const code = Item.normalize(cellText(row.getCell(columns.code)));
    const brand = Item.normalize(cellText(row.getCell(columns.brand)));
    const typeDesign = Item.normalize(cellText(row.getCell(columns.typeDesign)));
    const rawBalance = cellValue(row.getCell(columns.balance));
    if (!code && !brand && !typeDesign && rawBalance == null) continue; // empty row

    const entry = { row: r, code, brand, typeDesign };
    if (!code) {
      invalid.push({ ...entry, reason: 'No item description' });
      continue;
    }

    const balance = rawBalance == null || rawBalance === '' ? 0 : Number(rawBalance);
    // Negative balances are kept: the item starts with more out than on hand, as in the sheet.
    if (!Number.isInteger(balance)) {
      invalid.push({ ...entry, reason: `Ending balance "${rawBalance}" is not a whole number` });
      continue;
    }

    const givenCategory = columns.category && Item.normalize(cellText(row.getCell(columns.category)));
    const category = CATEGORIES.includes(givenCategory) ? givenCategory : categoryFor(code, typeDesign);
    rows.push({ ...entry, category, balance });
  }

  return { rows, invalid, asOf: columns.asOf ?? null };
}

const longDate = (date) =>
  date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

// "11/06/2026, 3:45 PM" in the server's time zone, like the Generated line on the report pages.
const dateTime = (date) =>
  date.toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' });

// The period as the report pages show it: one day, or "<from> – <to>".
const periodText = (from, to) => (from.getTime() === to.getTime() ? longDate(to) : `${longDate(from)} – ${longDate(to)}`);

const MUTED = { argb: 'FF6B7280' };

// Writes the report's title block above the table, like the report page header (without the logo):
//   EBR Inventory System · <cost center>
//   <Title>
//   As of <date> | For <period>
//
//   Report date | Period   <value>
//   Generated              <value>
//   Prepared by            <value>
//
// then the column headers. `header.columns` are the table's columns; returns the header row.
function addReportTable(sheet, columns, header) {
  const { title, subtitle, costCenterName, dateLabel, dateText, generatedAt, preparedBy } = header;
  sheet.columns = columns.map(({ header: _label, ...column }) => column);
  const lastCol = columns.length;
  const fullWidth = (row) => sheet.mergeCells(row.number, 1, row.number, lastCol);

  const eyebrow = sheet.addRow([`EBR Inventory System · ${costCenterName}`]);
  eyebrow.font = { size: 10, color: MUTED };
  fullWidth(eyebrow);
  const titleRow = sheet.addRow([title]);
  titleRow.font = { bold: true, size: 16 };
  titleRow.height = 24;
  fullWidth(titleRow);
  const subtitleRow = sheet.addRow([subtitle]);
  subtitleRow.font = { size: 11, color: MUTED };
  fullWidth(subtitleRow);
  sheet.addRow([]);

  for (const [label, value] of [
    [dateLabel, dateText],
    ['Generated', dateTime(generatedAt)],
    ['Prepared by', preparedBy || '—'],
  ]) {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { bold: true, size: 10, color: MUTED };
    row.getCell(2).alignment = { horizontal: 'left' };
    sheet.mergeCells(row.number, 2, row.number, Math.max(2, Math.min(lastCol, 4)));
  }
  sheet.addRow([]);

  const headerRow = sheet.addRow(columns.map((column) => column.header));
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    cell.border = { bottom: { style: 'thin' } };
  });
  sheet.views = [{ state: 'frozen', ySplit: headerRow.number }];
  sheet.pageSetup.printTitlesRow = `${headerRow.number}:${headerRow.number}`;
  return headerRow;
}

// Builds an .xlsx in the Summary Report layout, with the item ID and category in front, under the
// report's title block (report.title, costCenterName, preparedBy; see addReportTable).
// With beginningOf (a Daily Report for a range), each item's beginningBalance and the net change
// come before the ending balance; the importer ignores those columns and the title block.
async function buildSummaryReport(items, asOf, { beginningOf = null, title, costCenterName, preparedBy } = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(SHEET_NAME);
  const isRange = beginningOf && beginningOf.getTime() !== asOf.getTime();
  addReportTable(
    sheet,
    [
      { header: 'ITEM ID', key: 'itemId', width: 12 },
      { header: 'CATEGORY', key: 'category', width: 22 },
      { header: 'ITEM DESCRIPTION', key: 'code', width: 48 },
      { header: 'BRAND NAME', key: 'brand', width: 22 },
      { header: 'TYPE / DESIGN', key: 'typeDesign', width: 16 },
      ...(beginningOf
        ? [
            { header: `BEGINNING BALANCE ON ${longDate(beginningOf)}`, key: 'beginningBalance', width: 24 },
            { header: 'NET CHANGE', key: 'netChange', width: 14 },
          ]
        : []),
      { header: `ENDING BALANCE `, key: 'balance', width: 22 },
      { header: 'LAST TRANSACTION DATE', key: 'lastTransactionDate', width: 22, style: { numFmt: 'mm/dd/yyyy' } },
    ],
    {
      title,
      subtitle: isRange ? `For ${periodText(beginningOf, asOf)}` : `As of ${longDate(asOf)}`,
      costCenterName,
      dateLabel: isRange ? 'Period' : 'Report date',
      dateText: isRange ? periodText(beginningOf, asOf) : longDate(asOf),
      generatedAt: new Date(),
      preparedBy,
    },
  );
  sheet.addRows(
    items.map((item) => ({
      ...item,
      ...(beginningOf && { netChange: item.balance - (item.beginningBalance ?? 0) }),
      // ExcelJS writes Dates in UTC, which is how calendar days are stored.
      lastTransactionDate: item.lastTransactionDate ?? null,
    })),
  );
  return workbook.xlsx.writeBuffer();
}

// Builds the Transaction Report .xlsx: each item's IN and OUT for the period, its ending
// balance at the end of `to`, and a TOTAL row, under the report's title block.
async function buildTransactionReport(rows, totals, from, to, { costCenterName, preparedBy } = {}) {
  const period = from.getTime() === to.getTime() ? longDate(to) : `${longDate(from)} TO ${longDate(to)}`;
  const isSingleDay = from.getTime() === to.getTime();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Transaction Report');
  addReportTable(
    sheet,
    [
      { header: 'ITEM ID', key: 'itemId', width: 12 },
      { header: 'CATEGORY', key: 'category', width: 22 },
      { header: 'ITEM DESCRIPTION', key: 'code', width: 48 },
      { header: 'BRAND NAME', key: 'brand', width: 22 },
      { header: 'TYPE / DESIGN', key: 'typeDesign', width: 16 },
      { header: `IN (${period})`, key: 'in', width: 18 },
      { header: `OUT (${period})`, key: 'out', width: 18 },
      { header: `ENDING BALANCE AS OF ${longDate(to)}`, key: 'endingBalance', width: 22 },
    ],
    {
      title: 'Transaction Report',
      subtitle: `For ${periodText(from, to)}`,
      costCenterName,
      dateLabel: isSingleDay ? 'Report date' : 'Period',
      dateText: periodText(from, to),
      generatedAt: new Date(),
      preparedBy,
    },
  );
  sheet.addRows(rows);
  const total = sheet.addRow({ code: 'TOTAL', in: totals.in, out: totals.out });
  total.font = { bold: true };
  return workbook.xlsx.writeBuffer();
}

// Builds the Item List .xlsx: each item's ID, category, brand and description (no stock), in the
// order given, under the report's title block. sortLabel names that order (e.g. "Brand name (A–Z)").
async function buildItemList(items, { costCenterName, preparedBy, isFiltered = false, sortLabel = 'Item ID' } = {}) {
  const asOf = new Date();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Item List');
  addReportTable(
    sheet,
    [
      { header: 'ITEM ID', key: 'itemId', width: 12 },
      { header: 'CATEGORY', key: 'category', width: 22 },
      { header: 'BRAND NAME', key: 'brand', width: 22 },
      { header: 'ITEM DESCRIPTION', key: 'code', width: 48 },
    ],
    {
      title: 'Item List',
      subtitle: `${items.length.toLocaleString('en-US')} item${items.length === 1 ? '' : 's'}${isFiltered ? ' · filtered' : ''} · sorted by ${sortLabel}`,
      costCenterName,
      dateLabel: 'Report date',
      dateText: longDate(asOf),
      generatedAt: asOf,
      preparedBy,
    },
  );
  sheet.addRows(items);
  return workbook.xlsx.writeBuffer();
}

// Builds the Reconcile .xlsx: one item's transactions in ledger order (oldest first), each with its
// quantity under IN, OUT or RESERVE and the running balance after it, plus a TOTAL row.
// from / to: the period the entries were limited to (either may be null: no limit on that side).
async function buildReconcileReport(item, transactions, { from = null, to = null, costCenterName, preparedBy } = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Reconcile');
  let period = 'All transactions';
  if (from && to) period = periodText(from, to);
  else if (from) period = `From ${longDate(from)}`;
  else if (to) period = `Up to ${longDate(to)}`;
  const description = [item.itemId, item.code, item.brand, item.typeDesign].filter(Boolean).join(' · ');

  addReportTable(
    sheet,
    [
      { header: 'DATE', key: 'date', width: 14, style: { numFmt: 'mm/dd/yyyy' } },
      { header: 'TYPE', key: 'type', width: 20 },
      { header: 'IN', key: 'in', width: 10 },
      { header: 'OUT', key: 'out', width: 10 },
      { header: 'RESERVE', key: 'reserve', width: 10 },
      { header: 'CUSTOMER', key: 'customerName', width: 28 },
      { header: 'NOTES', key: 'notes', width: 36 },
      { header: 'RECORDED BY', key: 'recordedBy', width: 22 },
      { header: 'RUNNING BALANCE', key: 'endingBalance', width: 18 },
    ],
    {
      title: 'Reconcile Report',
      subtitle: `${description} · ${period}`,
      costCenterName,
      dateLabel: 'Period',
      dateText: period,
      generatedAt: new Date(),
      preparedBy,
    },
  );

  const totals = { in: 0, out: 0, reserve: 0 };
  for (const t of transactions) {
    const key = t.type.toLowerCase();
    totals[key] += t.quantity;
    sheet.addRow({
      // ExcelJS writes Dates in UTC, which is how calendar days are stored.
      date: t.date,
      type: t.isBalanceForwarded ? `BALANCE FORWARDED (${t.type})` : t.type,
      [key]: t.quantity,
      customerName: t.customerName || '',
      notes: t.notes || '',
      recordedBy: t.createdBy?.name ?? '',
      endingBalance: t.endingBalance,
    });
  }
  const total = sheet.addRow({ type: 'TOTAL', ...totals });
  total.font = { bold: true };
  total.eachCell((cell) => {
    cell.border = { top: { style: 'thin' } };
  });
  return workbook.xlsx.writeBuffer();
}

// Builds the Stockcard .xlsx: each item in `items` (in that order) as its own block —
//   <item ID · description · brand · type / design · category>
//   BEGINNING BALANCE                       <balance when `from` starts>
//   <each entry in the period, ledger order: quantity under IN, OUT or RESERVE, running balance>
//   ENDING BALANCE       <IN> <OUT> <RES>   <balance at the end of `to`>
// transactionsByItem: item _id (string) → its entries in the period, oldest first.
// beginningByItem: item _id (string) → balance at the end of the day before `from` (missing: 0).
async function buildStockcard(items, transactionsByItem, beginningByItem, from, to, { costCenterName, preparedBy } = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Stockcard');
  const isSingleDay = from.getTime() === to.getTime();
  const columns = [
    { header: 'DATE', key: 'date', width: 14, style: { numFmt: 'mm/dd/yyyy' } },
    { header: 'TYPE', key: 'type', width: 26 },
    { header: 'IN', key: 'in', width: 10 },
    { header: 'OUT', key: 'out', width: 10 },
    { header: 'RESERVE', key: 'reserve', width: 10 },
    { header: 'CUSTOMER', key: 'customerName', width: 28 },
    { header: 'NOTES', key: 'notes', width: 36 },
    { header: 'RECORDED BY', key: 'recordedBy', width: 22 },
    { header: 'BALANCE', key: 'balance', width: 14 },
  ];
  const entryCount = [...transactionsByItem.values()].reduce((sum, list) => sum + list.length, 0);
  addReportTable(sheet, columns, {
    title: 'Stockcard',
    subtitle: `For ${periodText(from, to)} · ${items.length.toLocaleString('en-US')} item${items.length === 1 ? '' : 's'} · ${entryCount.toLocaleString('en-US')} transaction${entryCount === 1 ? '' : 's'}`,
    costCenterName,
    dateLabel: isSingleDay ? 'Report date' : 'Period',
    dateText: periodText(from, to),
    generatedAt: new Date(),
    preparedBy,
  });
  const lastCol = columns.length;
  const ITEM_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };

  for (const item of items) {
    const key = String(item._id);
    const entries = transactionsByItem.get(key) ?? [];
    const beginning = beginningByItem.get(key) ?? 0;

    const itemRow = sheet.addRow([
      [item.itemId, item.code, item.brand, item.typeDesign, item.category].filter(Boolean).join(' · '),
    ]);
    sheet.mergeCells(itemRow.number, 1, itemRow.number, lastCol);
    itemRow.font = { bold: true };
    itemRow.getCell(1).fill = ITEM_FILL;

    const beginningRow = sheet.addRow({ date: from, type: 'BEGINNING BALANCE', balance: beginning });
    beginningRow.font = { italic: true, color: MUTED };

    const totals = { in: 0, out: 0, reserve: 0 };
    let balance = beginning;
    for (const t of entries) {
      const typeKey = t.type.toLowerCase();
      totals[typeKey] += t.quantity;
      balance = t.endingBalance;
      sheet.addRow({
        // ExcelJS writes Dates in UTC, which is how calendar days are stored.
        date: t.date,
        type: t.isBalanceForwarded ? `BALANCE FORWARDED (${t.type})` : t.type,
        [typeKey]: t.quantity,
        customerName: t.customerName || '',
        notes: t.notes || '',
        recordedBy: t.createdBy?.name ?? '',
        balance: t.endingBalance,
      });
    }

    const endingRow = sheet.addRow({ date: to, type: 'ENDING BALANCE', ...totals, balance });
    endingRow.font = { bold: true };
    endingRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = { top: { style: 'thin' } };
    });
    sheet.addRow([]);
  }
  return workbook.xlsx.writeBuffer();
}

module.exports = { readSummaryReport, buildSummaryReport, buildTransactionReport, buildItemList, buildReconcileReport, buildStockcard };
