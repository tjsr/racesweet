import { getApicalEventExcelFilePath } from './excelGenerate.ts';
import { readTempApicalExcelFile, retrieveExcelData } from './apicalEventSpreadsheet.ts';

import { promises as fs } from 'fs';
import { generateExcelData } from '../../controllers/apical/generateExcel.js';

const LIVE_TEST_ENABLED = process.env.APICAL_LIVE_TESTS === '1';
const LIVE_APICAL_EVENT_ID = Number(process.env.APICAL_LIVE_EVENT_ID || '69');
const LIVE_TEST_TIMEOUT_MS = Number(process.env.APICAL_LIVE_TIMEOUT_MS || '60000');

const describeLive = LIVE_TEST_ENABLED || true ? describe : describe.skip;

describeLive('live Apical Excel integration', () => {
  afterEach(async () => {
    await fs.unlink(getApicalEventExcelFilePath(LIVE_APICAL_EVENT_ID)).catch(() => undefined);
  });

  it('generates an Excel export, reuses the returned cookie, and reads the downloaded workbook', async () => {
    const exportResponse = await generateExcelData(LIVE_APICAL_EVENT_ID);

    expect(exportResponse.Cookie).toMatch(/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+=/);
    expect(exportResponse.FileGuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(exportResponse.FileName).toBeTruthy();
    expect(exportResponse.FileName).not.toMatch(/%[0-9a-f]{2}/i);

    const filePath = await retrieveExcelData(
      exportResponse.FileGuid,
      exportResponse.FileName,
      LIVE_APICAL_EVENT_ID,
      exportResponse.Cookie
    );
    const stats = await fs.stat(filePath);
    const rows = await readTempApicalExcelFile(filePath);

    expect(filePath).toBe(getApicalEventExcelFilePath(LIVE_APICAL_EVENT_ID));
    expect(stats.size).toBeGreaterThan(0);
    expect(rows.length).toBeGreaterThan(0);
  }, LIVE_TEST_TIMEOUT_MS);
});
