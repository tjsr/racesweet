import { getApicalEventExcelFilePath } from './excelGenerate.ts';
import { promises as fs } from 'fs';
import { retrieveExcelData } from './apicalEventSpreadsheet.ts';
import XLSX from 'xlsx';
import { generateExcelData } from '../../controllers/apical/generateExcel.ts';

const APICAL_EVENT_ID = 69;
const APICAL_FILE_NAME = 'Results  GMBC Autumn No Frills Round 4 2026-6-12.xlsx';
const GUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const runLiveApicalTests = process.env.RACESWEET_LIVE_APICAL === '1';

describe.skipIf(!runLiveApicalTests)('live Apical Excel integration', () => {
  afterEach(async () => {
    await fs.unlink(getApicalEventExcelFilePath(APICAL_EVENT_ID)).catch(() => undefined);
  });

  it('retrieves a real Apical Excel export and parses workbook sheets with data rows', async () => {
    const exportData = await generateExcelData(APICAL_EVENT_ID);

    expect(exportData.FileGuid).toMatch(GUID_REGEX);
    expect(exportData.FileName).toBe(APICAL_FILE_NAME);
    if (!exportData.Cookie) {
      throw new Error('Live Apical export did not return readable cookie data for the standalone Excel download helper');
    }
    expect(exportData.Cookie.trim().length).toBeGreaterThan(0);

    const filePath = await retrieveExcelData(exportData.FileGuid, exportData.FileName, APICAL_EVENT_ID, exportData.Cookie);
    const fileData = await fs.readFile(filePath);
    expect(fileData.byteLength).toBeGreaterThan(0);

    const workbook = XLSX.read(fileData, { type: 'buffer' });
    expect(workbook.Sheets).toBeTruthy();
    expect(Object.keys(workbook.Sheets).length).toBeGreaterThan(0);

    const worksheet = workbook.Sheets.Laps || workbook.Sheets.Sheet1 || workbook.Sheets[workbook.SheetNames[0]!];
    expect(worksheet).toBeTruthy();

    const rows = XLSX.utils.sheet_to_json(worksheet!);
    expect(rows.length).toBeGreaterThan(0);
  }, 30000);
});
