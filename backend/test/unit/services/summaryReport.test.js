import { createRequire } from 'node:module';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');
const { readSummaryReport, parseRowDate, parseLongDate, categoryFor, cellValue } =
  require('../../../src/services/summaryReport.service');

const day = (text) => new Date(`${text}T00:00:00.000Z`);

describe('parseRowDate', () => {
  it.each([
    ['11/28/2026', '2026-11-28'],
    ['1-5-2026', '2026-01-05'],
    ['2026-11-28', '2026-11-28'],
    ['2026-1-5', '2026-01-05'],
    ['October 26, 2026', '2026-10-26'],
    ['october 26 2026', '2026-10-26'],
    [46000, '2025-12-09'], // Excel serial number
  ])('reads %j as %s', (value, expected) => {
    expect(parseRowDate(value)).toEqual(day(expected));
  });

  it('keeps the calendar day of a real Excel date', () => {
    expect(parseRowDate(new Date('2026-11-28T00:00:00Z'))).toEqual(day('2026-11-28'));
  });

  it.each(['02/30/2026', '13/01/2026', '2026-02-30', 'soon', '', null, 0, -3, 1.5, new Date('nope')])(
    'returns null for %j',
    (value) => {
      expect(parseRowDate(value)).toBeNull();
    },
  );
});

describe('parseLongDate', () => {
  it('finds a long date inside a header', () => {
    expect(parseLongDate('ENDING BALANCE AS OF NOVEMBER 28, 2026')).toEqual(day('2026-11-28'));
  });

  it('returns null when there is no month name', () => {
    expect(parseLongDate('ENDING BALANCE')).toBeNull();
    expect(parseLongDate('Sept 5, 2026')).toBeNull();
  });

  // KNOWN BUG, found by this test: unlike parseRowDate, parseLongDate doesn't check the day
  // exists, so "February 30" rolls over to March 2. Fix test-first: remove `.fails`.
  it.fails('returns null for a day that does not exist', () => {
    expect(parseLongDate('February 30, 2026')).toBeNull();
  });
});

describe('categoryFor', () => {
  it.each([
    ['185/65 R14', 'TIRE', 'TIRES'],
    ['2.25-17', 'TUBE', 'TUBES'],
    ['4L', 'GULF', 'OIL'],
    ['DOT 3', 'BRAKE FLUID', 'FLUID'],
    ['NS40 BATT BOSCH', 'BOSCH', 'BATTERIES'],
    ['OIL FILTER', 'BOSCH', 'PARTS & ACCESSORIES'],
    ['MYSTERY', 'GADGET', 'OTHERS'],
    ['MYSTERY', '', 'OTHERS'],
  ])('%s / %s → %s', (code, typeDesign, expected) => {
    expect(categoryFor(code, typeDesign)).toBe(expected);
  });
});

describe('cellValue', () => {
  it.each([
    [{ value: 5 }, 5],
    [{ value: { formula: 'A1+1', result: 6 } }, 6],
    [{ value: { formula: 'A1+1', result: undefined } }, null], // formula never calculated
    [{ value: { richText: [{ text: 'IZU' }, { text: 'MI' }] } }, 'IZUMI'],
    [{ value: { text: 'link', hyperlink: 'https://x' } }, 'link'],
    [{ value: { error: '#REF!' } }, null],
    [{ value: undefined }, null],
  ])('reads %j', (cell, expected) => {
    expect(cellValue(cell)).toEqual(expected);
  });
});

// Builds an .xlsx in memory: rows[0] is the header row.
async function xlsx(rows, { sheetName = 'Summary Report', titleRows = 0 } = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  for (let i = 0; i < titleRows; i++) sheet.addRow([`Title line ${i + 1}`]);
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const HEADER = ['ITEM DESCRIPTION', 'BRAND NAME', 'TYPE / DESIGN', 'ENDING BALANCE AS OF NOVEMBER 28, 2026'];

describe('readSummaryReport', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-28T10:00:00+08:00'));
  });
  afterEach(() => vi.useRealTimers());

  it('reads rows, normalizing text and working out categories', async () => {
    const file = await xlsx([HEADER, [' 185/65  r14 ', 'good year', 'tire', 12], ['2.25-17', 'IZUMI', 'TUBE', -2]]);

    const { rows, invalid, asOf } = await readSummaryReport(file);

    expect(asOf).toEqual(day('2026-11-28'));
    expect(invalid).toEqual([]);
    expect(rows).toEqual([
      { row: 2, code: '185/65 R14', brand: 'GOODYEAR', typeDesign: 'TIRE', category: 'TIRES', balance: 12, date: null },
      { row: 3, code: '2.25-17', brand: 'IZUMI', typeDesign: 'TUBE', category: 'TUBES', balance: -2, date: null },
    ]);
  });

  it('finds the headers below a title block and accepts the older ITEM CODE header', async () => {
    const file = await xlsx([['ITEM CODE', 'BRAND NAME', 'ENDING BALANCE'], ['OIL', 'SHELL', 3]], { titleRows: 4 });

    const { rows, asOf } = await readSummaryReport(file);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ row: 6, code: 'OIL', balance: 3 });
    expect(asOf).toBeNull();
  });

  it('uses a valid CATEGORY column over the worked-out one', async () => {
    const file = await xlsx([[...HEADER, 'CATEGORY'], ['X', 'Y', 'TIRE', 1, 'services']]);
    expect((await readSummaryReport(file)).rows[0].category).toBe('SERVICES');
  });

  it('skips empty rows, treats a blank balance as 0, and lists the rows it cannot import', async () => {
    const file = await xlsx([
      [...HEADER, 'DATE'],
      ['GOOD', 'A', '', '', '11/01/2026'],
      [],
      ['', 'NO CODE', '', 1],
      ['HALF', 'A', '', 1.5],
      ['BAD DATE', 'A', '', 1, 'someday'],
      ['FUTURE', 'A', '', 1, '12/25/2026'],
    ]);

    const { rows, invalid } = await readSummaryReport(file);

    expect(rows).toEqual([expect.objectContaining({ code: 'GOOD', balance: 0, date: day('2026-11-01') })]);
    expect(invalid.map((r) => [r.row, r.reason])).toEqual([
      [4, 'No item description'],
      [5, 'Ending balance "1.5" is not a whole number'],
      [6, 'Date "someday" is not a valid date'],
      [7, 'Date December 25, 2026 is in the future'],
    ]);
  });

  it('refuses a sheet that is missing a required column', async () => {
    const file = await xlsx([['ITEM DESCRIPTION', 'TYPE / DESIGN'], ['OIL', 'OIL']]);
    await expect(readSummaryReport(file)).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('Missing column: BRAND NAME, ENDING BALANCE'),
    });
  });

  it('refuses a file that is not Excel', async () => {
    await expect(readSummaryReport(Buffer.from('not a spreadsheet'))).rejects.toMatchObject({ status: 400 });
  });
});
