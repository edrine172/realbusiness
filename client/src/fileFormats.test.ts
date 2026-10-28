import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { readSpreadsheetWorkbook } from './fileFormats';

describe('workforce spreadsheet reader', () => {
  it('reads attendance and activity worksheets from one workbook', async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['employee_number', 'date', 'attended', 'output_quantity'],
      ['WK-1001', '2026-02-14', true, 12],
    ]), 'Attendance');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['employee_number', 'date', 'task_id', 'hours', 'units_worked'],
      ['WK-1001', '2026-02-14', 7, 2, 0],
    ]), 'Activities');
    const content = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    const file = { arrayBuffer: async () => content } as File;

    const sheets = await readSpreadsheetWorkbook(file);

    expect(sheets.map((sheet) => sheet.name)).toEqual(['Attendance', 'Activities']);
    expect(sheets[0].rows[1]).toEqual(['WK-1001', '2026-02-14', 'TRUE', '12']);
    expect(sheets[1].rows[1]).toEqual(['WK-1001', '2026-02-14', '7', '2', '0']);
  });
});