const ExcelJS = require('exceljs');
const Item = require('../models/Item');
const { CATEGORIES } = require('../models/Item');
const HttpError = require('../utils/httpError');

const SHEET_NAME = 'Summary Report';
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

// TYPE / DESIGN → category, for files that have no CATEGORY column.
const CATEGORY_BY_TYPE = {
  TIRE: 'TIRES',
  TUBE: 'TUBES',
  FLAP: 'FLAPS',
  BATTERY: 'BATTERIES',
  OIL: 'OILS & LUBRICANTS',
  GULF: 'OILS & LUBRICANTS',
  CHEMICAL: 'CHEMICALS & FLUIDS',
  'BRAKE FLUID': 'CHEMICALS & FLUIDS',
  COOLANT: 'CHEMICALS & FLUIDS',
};

// BOSCH rows are mostly parts (filters, brake pads, spark plugs, wipers) plus some batteries ("... BATT BOSCH").
function categoryFor(code, typeDesign) {
  if (typeDesign === 'BOSCH') return /\bBATT/.test(code) ? 'BATTERIES' : 'PARTS & ACCESSORIES';
  return CATEGORY_BY_TYPE[typeDesign] ?? 'OTHERS';
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

// Reads the "Summary Report" sheet: ITEM CODE, BRAND NAME, TYPE / DESIGN and
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

  const columns = {};
  sheet.getRow(1).eachCell((cell, col) => {
    const header = Item.normalize(cellText(cell));
    if (header === 'ITEM CODE') columns.code = col;
    else if (header === 'BRAND NAME') columns.brand = col;
    else if (header === 'TYPE / DESIGN' || header === 'TYPE/DESIGN') columns.typeDesign = col;
    else if (header === 'CATEGORY') columns.category = col;
    else if (header.startsWith('ENDING BALANCE')) {
      columns.balance = col;
      columns.asOf = parseLongDate(header);
    }
  });
  const missing = [
    ['code', 'ITEM CODE'],
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
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const code = Item.normalize(cellText(row.getCell(columns.code)));
    const brand = Item.normalize(cellText(row.getCell(columns.brand)));
    const typeDesign = Item.normalize(cellText(row.getCell(columns.typeDesign)));
    const rawBalance = cellValue(row.getCell(columns.balance));
    if (!code && !brand && !typeDesign && rawBalance == null) continue; // empty row

    const entry = { row: r, code, brand, typeDesign };
    if (!code) {
      invalid.push({ ...entry, reason: 'No item code' });
      continue;
    }

    const balance = rawBalance == null || rawBalance === '' ? 0 : Number(rawBalance);
    if (!Number.isInteger(balance) || balance < 0) {
      invalid.push({ ...entry, reason: `Ending balance "${rawBalance}" is not a whole number of 0 or more` });
      continue;
    }

    const givenCategory = columns.category && Item.normalize(cellText(row.getCell(columns.category)));
    const category = CATEGORIES.includes(givenCategory) ? givenCategory : categoryFor(code, typeDesign);
    rows.push({ ...entry, category, balance });
  }

  return { rows, invalid, asOf: columns.asOf ?? null };
}

// Builds an .xlsx in the Summary Report layout, with the item ID and category in front.
async function buildSummaryReport(items, asOf) {
  const asOfText = asOf.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(SHEET_NAME, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: 'ITEM ID', key: 'itemId', width: 12 },
    { header: 'CATEGORY', key: 'category', width: 22 },
    { header: 'ITEM CODE', key: 'code', width: 48 },
    { header: 'BRAND NAME', key: 'brand', width: 22 },
    { header: 'TYPE / DESIGN', key: 'typeDesign', width: 16 },
    { header: `ENDING BALANCE AS OF ${asOfText}`, key: 'balance', width: 22 },
    { header: 'LAST TRANSACTION DATE', key: 'lastTransactionDate', width: 22, style: { numFmt: 'mm/dd/yyyy' } },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRows(
    items.map((item) => ({
      ...item,
      // ExcelJS writes Dates in UTC, which is how calendar days are stored.
      lastTransactionDate: item.lastTransactionDate ?? null,
    })),
  );
  return workbook.xlsx.writeBuffer();
}

module.exports = { readSummaryReport, buildSummaryReport };
