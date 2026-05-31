import { mapSnapshotEvents, writeHandicapSnapshot } from './handicapSnapshotOutput.js';
import { mkdtemp, readFile } from 'fs/promises';

import { ExtendedApicalEventListData } from './apicalEventList.js';
import { join } from 'path';
import { tmpdir } from 'os';

describe('mapSnapshotEvents', () => {
  test('should map event metadata into snapshot event structure', () => {
    const events: ExtendedApicalEventListData[] = [
      {
        CompanyName: 'Company',
        EventDate: '2025-06-01',
        ExcelDataPath: 'tmp/file1.xlsx',
        Id: 100,
        Name: 'Race 1',
        ThumbPathAndFileName: 'thumb1.png',
      },
      {
        CompanyName: 'Company',
        EventDate: '2025-06-08',
        ExcelDataPath: 'tmp/file2.xlsx',
        Id: 200,
        Name: 'Race 2',
        ThumbPathAndFileName: 'thumb2.png',
      },
    ];

    const mappedEvents = mapSnapshotEvents(events);

    expect(mappedEvents).toEqual([
      { eventDate: '2025-06-01', eventId: 100, name: 'Race 1' },
      { eventDate: '2025-06-08', eventId: 200, name: 'Race 2' },
    ]);
  });
});

describe('writeHandicapSnapshot', () => {
  test('should create folder path and write snapshot json content', async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), 'racesweet-handicap-'));
    const outputPath = join(tempDirectory, 'nested', 'handicapSnapshot.json');
    const jsonContent = '{"schemaVersion":"1.0"}';

    await writeHandicapSnapshot(outputPath, jsonContent);

    const writtenContent = await readFile(outputPath, 'utf-8');
    expect(writtenContent).toBe(jsonContent);
  });
});
