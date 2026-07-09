import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTimeRecordSourceId } from '../../model/ids.js';
import { loadMrScatsCatalogFromLocation } from './catalogImport.js';

interface DbfField {
  length: number;
  name: string;
  type: string;
}

const createDbfBuffer = (fields: DbfField[], rows: Record<string, string | number | undefined>[]): Buffer => {
  const headerLength = 32 + (fields.length * 32) + 1;
  const recordLength = 1 + fields.reduce((total, field) => total + field.length, 0);
  const buffer = Buffer.alloc(headerLength + (recordLength * rows.length), 0x20);
  buffer[0] = 3;
  buffer[1] = 97;
  buffer[2] = 6;
  buffer[3] = 28;
  buffer.writeUInt32LE(rows.length, 4);
  buffer.writeUInt16LE(headerLength, 8);
  buffer.writeUInt16LE(recordLength, 10);

  fields.forEach((field, index) => {
    const offset = 32 + (index * 32);
    buffer.write(field.name, offset, 'latin1');
    buffer.write(field.type, offset + 11, 'latin1');
    buffer[offset + 16] = field.length;
  });
  buffer[headerLength - 1] = 0x0d;

  rows.forEach((row, rowIndex) => {
    const recordOffset = headerLength + (rowIndex * recordLength);
    buffer[recordOffset] = 0x20;
    let fieldOffset = recordOffset + 1;
    fields.forEach((field) => {
      const rawValue = row[field.name] === undefined ? '' : String(row[field.name]);
      const value = field.type === 'N'
        ? rawValue.padStart(field.length, ' ')
        : rawValue.padEnd(field.length, ' ');
      buffer.write(value.slice(0, field.length), fieldOffset, 'latin1');
      fieldOffset += field.length;
    });
  });

  return buffer;
};

describe('MR-SCATS catalog import parser', () => {
  it('loads sessions, categories, entrants, participants, plates, and transponders from core DBF files', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-catalog-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 5, name: 'STARTTIME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
      { length: 5, name: 'ACTUALSTRT', type: 'C' },
      { length: 1, name: 'EVENTTYPE', type: 'C' },
    ], [
      { ACTUALSTRT: '09:05', CATEGORY: 'CAT-A', EVENTNAME: 'Feature Race', EVENTTYPE: 'R', EV_CODE: 'W9721R01', STARTDATE: '19970629', STARTTIME: '09:00' },
      { ACTUALSTRT: '10:00', CATEGORY: 'CAT-B', EVENTNAME: 'Qualifying', EVENTTYPE: 'Q', EV_CODE: 'W9721Q01', STARTDATE: '19970629', STARTTIME: '09:55' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVERS.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 4, name: 'TXNUM2', type: 'N' },
      { length: 8, name: 'DRIV_CLASS', type: 'C' },
      { length: 45, name: 'ENTRANT', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
      { length: 50, name: 'DRIVER_2', type: 'C' },
      { length: 13, name: 'SCRN_NAME', type: 'C' },
    ], [
      { CARNUMBER: 42, DRIVER: 'Alice Rider', DRIVER_2: 'Bob Rider', DRIV_CLASS: 'CAT-A', ENTRANT: 'Team 42', SCRN_NAME: 'Team 42', TXNUM: 1001, TXNUM2: 1002 },
      { CARNUMBER: 77, DRIVER: 'Solo Driver', DRIV_CLASS: 'CAT-B', ENTRANT: 'Solo 77', SCRN_NAME: 'Solo 77', TXNUM: 2001 },
    ]));

    const imported = await loadMrScatsCatalogFromLocation(tempDir);

    expect(imported.eventName).toBe('MR-SCATS W9721');
    expect(imported.eventDate).toBe('1997-06-29');
    expect(imported.sessions.map((session) => ({
      categoryCount: session.categoryIds.length,
      eventCode: session.eventCode,
      eventType: session.eventType,
      name: session.name,
    }))).toEqual([
      { categoryCount: 1, eventCode: 'W9721R01', eventType: 'R', name: 'Feature Race' },
      { categoryCount: 1, eventCode: 'W9721Q01', eventType: 'Q', name: 'Qualifying' },
    ]);
    expect(imported.raceState.categories?.map((category) => category.name)).toEqual(['CAT-A', 'CAT-B']);
    expect(imported.raceState.participants).toEqual([
      expect.objectContaining({
        firstname: 'Alice',
        identifiers: expect.arrayContaining([
          expect.objectContaining({ racePlate: '42' }),
          expect.objectContaining({ txNo: 1001 }),
          expect.objectContaining({ txNo: 1002 }),
        ]),
        surname: 'Rider',
      }),
      expect.objectContaining({
        firstname: 'Bob',
        surname: 'Rider',
      }),
      expect.objectContaining({
        firstname: 'Solo',
        identifiers: expect.arrayContaining([
          expect.objectContaining({ racePlate: '77' }),
          expect.objectContaining({ txNo: 2001 }),
        ]),
        surname: 'Driver',
      }),
    ]);
  });

  it('loads driver data from DRIVE.DBF when the historical DRIVERS.DBF name is not present', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-catalog-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 5, name: 'STARTTIME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
      { length: 1, name: 'EVENTTYPE', type: 'C' },
    ], [
      { CATEGORY: 'U2L', EVENTNAME: 'Race 1', EVENTTYPE: 'R', EV_CODE: 'S0101R01', STARTDATE: '20010114', STARTTIME: '09:00' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVE.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'DRIV_CLASS', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 15, DRIVER: 'Fallback Driver', DRIV_CLASS: 'U2L', TXNUM: 315 },
    ]));

    const imported = await loadMrScatsCatalogFromLocation(tempDir);

    expect(imported.sessions.map((session) => session.eventCode)).toEqual(['S0101R01']);
    expect(imported.raceState.participants).toEqual([
      expect.objectContaining({
        firstname: 'Fallback',
        identifiers: expect.arrayContaining([
          expect.objectContaining({ racePlate: '15' }),
          expect.objectContaining({ txNo: 315 }),
        ]),
        surname: 'Driver',
      }),
    ]);
  });

  it('uses DRIV_CODE before DRIV_CLASS for imported entrant categories and inferred session categories', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-catalog-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 5, name: 'STARTTIME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
    ], [
      { CATEGORY: 'EVENT', EVENTNAME: 'Race 1', EV_CODE: 'T9743R01', STARTDATE: '19970629', STARTTIME: '09:00' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVERS.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'DRIV_CODE', type: 'C' },
      { length: 12, name: 'DRIV_CLASS', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 15, DRIVER: 'Code Driver', DRIV_CLASS: 'Sports Cars', DRIV_CODE: 'A', TXNUM: 1234 },
    ]));
    await writeFile(path.join(tempDir, 'T9743R01.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 9, name: 'ELAPSED', type: 'N' },
      { length: 4, name: 'COUNTER', type: 'N' },
    ], [
      { CARNUMBER: 15, COUNTER: 1, ELAPSED: 100000, TXNUM: 1234 },
    ]));

    const imported = await loadMrScatsCatalogFromLocation(tempDir);
    const categoryIdsByName = new Map(imported.raceState.categories?.map((category) => [category.name, category.id]));

    expect(imported.raceState.categories?.map((category) => category.name)).toEqual(['EVENT', 'A']);
    expect(imported.raceState.categories?.map((category) => category.name)).not.toContain('Sports Cars');
    expect(imported.raceState.participants?.[0]).toEqual(expect.objectContaining({
      categoryId: categoryIdsByName.get('A'),
    }));
    expect(imported.sessions[0]?.categoryIds).toEqual([categoryIdsByName.get('A')]);
  });

  it('continues through unreadable driver candidates and imports the next DBF-compatible fallback', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-catalog-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 5, name: 'STARTTIME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
    ], [
      { CATEGORY: 'OPEN', EVENTNAME: 'Race 2', EV_CODE: 'S0101R02', STARTDATE: '20010114', STARTTIME: '10:00' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVERS.DAT'), Buffer.from('not a dbf table', 'latin1'));
    await writeFile(path.join(tempDir, 'DRIVERS.TXT'), Buffer.from('15 Fallback Driver', 'latin1'));
    await writeFile(path.join(tempDir, 'DRIVE.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'DRIV_CLASS', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 16, DRIVER: 'Second Fallback', DRIV_CLASS: 'OPEN', TXNUM: 316 },
    ]));

    const imported = await loadMrScatsCatalogFromLocation(tempDir);

    expect(imported.raceState.participants).toEqual([
      expect.objectContaining({
        firstname: 'Second',
        identifiers: expect.arrayContaining([
          expect.objectContaining({ racePlate: '16' }),
          expect.objectContaining({ txNo: 316 }),
        ]),
        surname: 'Fallback',
      }),
    ]);
  });

  it('loads session crossing DBFs with deterministic record IDs and derived pre-green crossing times', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-catalog-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 5, name: 'STARTTIME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
      { length: 5, name: 'ACTUALSTRT', type: 'C' },
      { length: 1, name: 'EVENTTYPE', type: 'C' },
    ], [
      { ACTUALSTRT: '09:05', CATEGORY: 'CAT-A', EVENTNAME: 'Race 1', EVENTTYPE: 'R', EV_CODE: 'W9721R01', STARTDATE: '19970629', STARTTIME: '09:00' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVERS.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'DRIV_CLASS', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 42, DRIVER: 'Alice Rider', DRIV_CLASS: 'CAT-A', TXNUM: 1001 },
    ]));
    await writeFile(path.join(tempDir, 'W9721R01.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 9, name: 'ELAPSED', type: 'N' },
      { length: 8, name: 'STARTELAP', type: 'N' },
      { length: 4, name: 'COUNTER', type: 'N' },
    ], [
      { CARNUMBER: 42, COUNTER: 7, ELAPSED: 10000, STARTELAP: 20000, TXNUM: 1001 },
      { CARNUMBER: 42, COUNTER: 8, ELAPSED: 25000, STARTELAP: 20000, TXNUM: 1001 },
    ]));

    const firstImport = await loadMrScatsCatalogFromLocation(tempDir);
    const secondImport = await loadMrScatsCatalogFromLocation(tempDir);
    const records = firstImport.raceState.records || [];

    expect(records).toHaveLength(3);
    expect(records.map((record) => record.id)).toEqual(secondImport.raceState.records?.map((record) => record.id));
    expect(records[0]).toEqual(expect.objectContaining({
      flagType: 'green',
      sessionId: firstImport.sessions[0]?.id,
      systemGenerated: true,
      time: new Date('1997-06-28T23:05:00.000Z'),
    }));
    expect(records[1]).toEqual(expect.objectContaining({
      chipCode: 1001,
      originRecordNumber: 1,
      plateNumber: '42',
      sessionId: firstImport.sessions[0]?.id,
      source: createTimeRecordSourceId('mr-scats:W9721:source:W9721R01:W9721R01.DBF'),
      time: new Date('1997-06-28T23:04:59.000Z'),
    }));
    expect(records[2]).toEqual(expect.objectContaining({
      chipCode: 1001,
      originRecordNumber: 2,
      source: createTimeRecordSourceId('mr-scats:W9721:source:W9721R01:W9721R01.DBF'),
      time: new Date('1997-06-28T23:05:00.500Z'),
    }));
    expect(firstImport.raceState.timeRecordSources).toEqual([
      expect.objectContaining({
        filePath: 'W9721R01.DBF',
        id: createTimeRecordSourceId('mr-scats:W9721:source:W9721R01:W9721R01.DBF'),
        name: 'W9721R01.DBF',
      }),
    ]);
  });

  it('reports load progress for parsed files and rows', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-catalog-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 5, name: 'STARTTIME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
    ], [
      { CATEGORY: 'CAT-A', EVENTNAME: 'Race 1', EV_CODE: 'W9721R01', STARTDATE: '19970629', STARTTIME: '09:00' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVERS.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'DRIV_CLASS', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 42, DRIVER: 'Alice Rider', DRIV_CLASS: 'CAT-A', TXNUM: 1001 },
    ]));
    await writeFile(path.join(tempDir, 'W9721R01.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 9, name: 'ELAPSED', type: 'N' },
      { length: 4, name: 'COUNTER', type: 'N' },
    ], [
      { CARNUMBER: 42, COUNTER: 1, ELAPSED: 10000, TXNUM: 1001 },
      { CARNUMBER: 42, COUNTER: 2, ELAPSED: 25000, TXNUM: 1001 },
    ]));
    const progressEvents: Array<{ callerName?: string; completed: number; total: number }> = [];

    await loadMrScatsCatalogFromLocation(tempDir, {
      onProgress: (progress) => {
        progressEvents.push({
          callerName: progress.callerName,
          completed: progress.completed,
          total: progress.total,
        });
      },
    });

    expect(progressEvents.length).toBeGreaterThan(0);
    expect(new Set(progressEvents.map((progress) => progress.total))).toEqual(new Set([7]));
    expect(progressEvents[0]).toEqual({ callerName: 'createProgressTracker', completed: 0, total: 7 });
    expect(progressEvents.at(-1)).toEqual(expect.objectContaining({ completed: 7, total: 7 }));
    expect(progressEvents.at(-1)?.callerName).toContain('buildSessionRecords');
    expect(progressEvents.map((progress) => progress.callerName)).toEqual(expect.arrayContaining([
      expect.stringContaining('buildSessionRecords'),
      'readPlannedCoreTableSource',
    ]));
  });

  it('imports TX zero crossings with car numbers as manual plate crossings', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-catalog-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 5, name: 'STARTTIME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
      { length: 1, name: 'EVENTTYPE', type: 'C' },
    ], [
      { CATEGORY: 'CAT-A', EVENTNAME: 'Race 1', EVENTTYPE: 'R', EV_CODE: 'W9721R01', STARTDATE: '19970629', STARTTIME: '09:00' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVERS.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'DRIV_CLASS', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 42, DRIVER: 'Alice Rider', DRIV_CLASS: 'CAT-A', TXNUM: 1001 },
    ]));
    await writeFile(path.join(tempDir, 'W9721R01.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'ELAPSED', type: 'N' },
      { length: 4, name: 'COUNTER', type: 'N' },
    ], [
      { CARNUMBER: 42, COUNTER: 9, ELAPSED: 30000, TXNUM: 0 },
    ]));

    const imported = await loadMrScatsCatalogFromLocation(tempDir);
    const crossing = imported.raceState.records?.[1] as Record<string, unknown> | undefined;

    expect(crossing).toEqual(expect.objectContaining({
      originRecordNumber: 1,
      plateNumber: '42',
      time: new Date('1997-06-28T23:00:03.000Z'),
    }));
    expect(crossing).not.toHaveProperty('chipCode');
  });

  it('infers session categories from crossing plates when PRGMME category has no entrants', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-catalog-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 5, name: 'STARTTIME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
      { length: 1, name: 'EVENTTYPE', type: 'C' },
    ], [
      { CATEGORY: 'SPRINT', EVENTNAME: 'Run One', EVENTTYPE: 'Q', EV_CODE: 'S0101Q01', STARTDATE: '20010114', STARTTIME: '09:00' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVE.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'DRIV_CLASS', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 22, DRIVER: 'Sports Master', DRIV_CLASS: 'SM', TXNUM: 0 },
      { CARNUMBER: 34, DRIVER: 'Marque Driver', DRIV_CLASS: 'M', TXNUM: 0 },
      { CARNUMBER: 99, DRIVER: 'Not On Track', DRIV_CLASS: 'O', TXNUM: 0 },
    ]));
    await writeFile(path.join(tempDir, 'S0101Q01.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'ELAPSED', type: 'N' },
      { length: 4, name: 'COUNTER', type: 'N' },
    ], [
      { CARNUMBER: 22, COUNTER: 1, ELAPSED: 10000, TXNUM: 0 },
      { CARNUMBER: 34, COUNTER: 2, ELAPSED: 20000, TXNUM: 0 },
    ]));

    const imported = await loadMrScatsCatalogFromLocation(tempDir);
    const categoryIdsByName = new Map(imported.raceState.categories?.map((category) => [category.name, category.id]));

    expect(imported.sessions[0]?.categoryIds).toEqual([
      categoryIdsByName.get('SM'),
      categoryIdsByName.get('M'),
    ]);
    expect(imported.sessions[0]?.categoryIds).not.toContain(categoryIdsByName.get('SPRINT'));
    expect(imported.raceState.records?.[0]).toEqual(expect.objectContaining({
      categoryIds: [
        categoryIdsByName.get('SM'),
        categoryIdsByName.get('M'),
      ],
      flagType: 'green',
    }));
  });

  it('imports crossings whose TX value is only the car number as plate crossings', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-catalog-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 5, name: 'STARTTIME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
      { length: 1, name: 'EVENTTYPE', type: 'C' },
    ], [
      { CATEGORY: 'CAT-A', EVENTNAME: 'Race 1', EVENTTYPE: 'R', EV_CODE: 'W9721R01', STARTDATE: '19970629', STARTTIME: '09:00' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVERS.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'DRIV_CLASS', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 123, DRIVER: 'Plate Only', DRIV_CLASS: 'CAT-A', TXNUM: 5001 },
    ]));
    await writeFile(path.join(tempDir, 'W9721R01.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'ELAPSED', type: 'N' },
      { length: 4, name: 'COUNTER', type: 'N' },
    ], [
      { CARNUMBER: 123, COUNTER: 10, ELAPSED: 30000, TXNUM: 123 },
    ]));

    const imported = await loadMrScatsCatalogFromLocation(tempDir);
    const crossing = imported.raceState.records?.[1] as Record<string, unknown> | undefined;

    expect(imported.raceState.participants?.[0]?.identifiers).toEqual(expect.arrayContaining([
      expect.objectContaining({ racePlate: '123' }),
      expect.objectContaining({ txNo: 5001 }),
    ]));
    expect(crossing).toEqual(expect.objectContaining({
      plateNumber: '123',
    }));
    expect(crossing).not.toHaveProperty('chipCode');
  });

  it('imports NO-series DBF files as non-lap crossings with line and loop metadata', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-catalog-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 5, name: 'STARTTIME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
    ], [
      { CATEGORY: 'CAT-A', EVENTNAME: 'Race 1', EV_CODE: 'W9721R01', STARTDATE: '19970629', STARTTIME: '17:00' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVERS.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'DRIV_CLASS', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 42, DRIVER: 'Sector Driver', DRIV_CLASS: 'CAT-A', TXNUM: 1001 },
    ]));
    await writeFile(path.join(tempDir, 'W9721R01.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 9, name: 'ELAPSED', type: 'N' },
      { length: 4, name: 'COUNTER', type: 'N' },
    ], [
      { CARNUMBER: 42, COUNTER: 1, ELAPSED: 756600000, TXNUM: 1001 },
    ]));
    await writeFile(path.join(tempDir, 'W9721R01.NO1'), createDbfBuffer([
      { length: 4, name: 'CAR', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'ENTRYTIME', type: 'N' },
      { length: 9, name: 'ELAPSED', type: 'N' },
      { length: 3, name: 'LINE_NO', type: 'N' },
      { length: 3, name: 'LANE_NO', type: 'N' },
    ], [
      { CAR: 42, ELAPSED: 756300006, ENTRYTIME: 300000, LANE_NO: 9, LINE_NO: 3, TXNUM: 1001 },
    ]));

    const imported = await loadMrScatsCatalogFromLocation(tempDir);
    const crossings = (imported.raceState.records || []).slice(1) as unknown as Array<Record<string, unknown>>;

    expect(crossings).toHaveLength(2);
    expect(crossings.map((crossing) => crossing.time)).toEqual([
      new Date('1997-06-29T07:00:30.000Z'),
      new Date('1997-06-29T11:01:00.000Z'),
    ]);
    expect(crossings[0]).toEqual(expect.objectContaining({
      antenna: 'Line 3 Loop 9',
      chipCode: 1001,
      isLapCompletion: false,
      plateNumber: '42',
    }));
    expect(crossings[1]).toEqual(expect.objectContaining({
      isLapCompletion: true,
    }));
  });

  it('imports SRT and ERF raw crossing records for matching sessions', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-catalog-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 5, name: 'STARTTIME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
    ], [
      { CATEGORY: 'CAT-A', EVENTNAME: 'Race 1', EV_CODE: 'W9721R01', STARTDATE: '19970629', STARTTIME: '09:00' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVERS.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'DRIV_CLASS', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 42, DRIVER: 'Raw Driver', DRIV_CLASS: 'CAT-A', TXNUM: 1234 },
    ]));
    await writeFile(path.join(tempDir, 'W9721R01.SRT'), '040000000010000012340302064000\r');
    await writeFile(path.join(tempDir, 'W9721R01.ERF'), '040000000020000012340401063016\r');

    const imported = await loadMrScatsCatalogFromLocation(tempDir);
    const records = imported.raceState.records || [];
    const crossings = records.slice(1) as unknown as Array<Record<string, unknown>>;

    expect(records).toHaveLength(3);
    expect(crossings.map((crossing) => crossing.chipCode)).toEqual([1234, 1234]);
    expect(crossings.map((crossing) => crossing.antenna)).toEqual([
      'Line 3 Loop 2',
      'Line 4 Loop 1',
    ]);
    expect(crossings.map((crossing) => crossing.source)).toEqual([
      createTimeRecordSourceId('mr-scats:W9721:source:W9721R01:W9721R01.SRT'),
      createTimeRecordSourceId('mr-scats:W9721:source:W9721R01:W9721R01.ERF'),
    ]);
    expect(imported.raceState.timeRecordSources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        filePath: 'W9721R01.SRT',
        id: createTimeRecordSourceId('mr-scats:W9721:source:W9721R01:W9721R01.SRT'),
        name: 'W9721R01.SRT',
      }),
      expect.objectContaining({
        filePath: 'W9721R01.ERF',
        id: createTimeRecordSourceId('mr-scats:W9721:source:W9721R01:W9721R01.ERF'),
        name: 'W9721R01.ERF',
      }),
    ]));
    expect(crossings.map((crossing) => crossing.time)).toEqual([
      new Date('1997-06-28T23:00:10.000Z'),
      new Date('1997-06-28T23:00:20.000Z'),
    ]);
  });

  it('tags T9743R10 SRT, NO1, and DBF crossings with their original source files', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-catalog-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
      { length: 8, name: 'ACTUALSTRT', type: 'C' },
    ], [
      { ACTUALSTRT: '20:02:29', CATEGORY: 'CAT-A', EVENTNAME: 'Race 10', EV_CODE: 'T9743R10', STARTDATE: '19971206' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVERS.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'DRIV_CLASS', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 13, DRIVER: 'Race Ten Driver', DRIV_CLASS: 'CAT-A', TXNUM: 1234 },
    ]));
    await writeFile(path.join(tempDir, 'T9743R10.SRT'), '040000000010000012340302064000\r');
    await writeFile(path.join(tempDir, 'T9743R10.NO1'), createDbfBuffer([
      { length: 4, name: 'CAR', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 9, name: 'ELAPSED', type: 'N' },
      { length: 3, name: 'LINE_NO', type: 'N' },
      { length: 3, name: 'LANE_NO', type: 'N' },
    ], [
      { CAR: 13, ELAPSED: 200000, LANE_NO: 2, LINE_NO: 3, TXNUM: 1234 },
    ]));
    await writeFile(path.join(tempDir, 'T9743R10.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 9, name: 'ELAPSED', type: 'N' },
      { length: 4, name: 'COUNTER', type: 'N' },
    ], [
      { CARNUMBER: 13, COUNTER: 1, ELAPSED: 300000, TXNUM: 1234 },
    ]));

    const imported = await loadMrScatsCatalogFromLocation(tempDir);
    const sourceFileById = new Map((imported.raceState.timeRecordSources || []).map((source) => [source.id, source.filePath || source.name]));
    const crossings = ((imported.raceState.records || []) as unknown as Array<Record<string, unknown>>)
      .filter((record) => record.recordType === 16);

    expect(crossings).toHaveLength(3);
    expect(crossings.map((crossing) => sourceFileById.get(crossing.source as string))).toEqual([
      'T9743R10.SRT',
      'T9743R10.NO1',
      'T9743R10.DBF',
    ]);
    expect(imported.raceState.timeRecordSources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        filePath: 'T9743R10.SRT',
        id: createTimeRecordSourceId('mr-scats:T9743:source:T9743R10:T9743R10.SRT'),
        name: 'T9743R10.SRT',
      }),
      expect.objectContaining({
        filePath: 'T9743R10.NO1',
        id: createTimeRecordSourceId('mr-scats:T9743:source:T9743R10:T9743R10.NO1'),
        name: 'T9743R10.NO1',
      }),
      expect.objectContaining({
        filePath: 'T9743R10.DBF',
        id: createTimeRecordSourceId('mr-scats:T9743:source:T9743R10:T9743R10.DBF'),
        name: 'T9743R10.DBF',
      }),
    ]));
  });

  it('imports AT1 and AT2 files as non-lap DBF crossings', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-catalog-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 5, name: 'STARTTIME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
    ], [
      { CATEGORY: 'CAT-A', EVENTNAME: 'Race 1', EV_CODE: 'W9721R01', STARTDATE: '19970629', STARTTIME: '09:00' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVERS.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'DRIV_CLASS', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 42, DRIVER: 'Aux Driver', DRIV_CLASS: 'CAT-A', TXNUM: 1234 },
    ]));
    await writeFile(path.join(tempDir, 'W9721R01.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 9, name: 'ELAPSED', type: 'N' },
      { length: 4, name: 'COUNTER', type: 'N' },
    ], [
      { CARNUMBER: 42, COUNTER: 1, ELAPSED: 500000, TXNUM: 1234 },
    ]));
    await writeFile(path.join(tempDir, 'W9721R01.AT1'), createDbfBuffer([
      { length: 4, name: 'CAR', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 9, name: 'ELAPSED', type: 'N' },
      { length: 3, name: 'LINE_NO', type: 'N' },
      { length: 3, name: 'LANE_NO', type: 'N' },
    ], [
      { CAR: 42, ELAPSED: 300000, LANE_NO: 1, LINE_NO: 5, TXNUM: 1234 },
    ]));
    await writeFile(path.join(tempDir, 'W9721R01.AT2'), createDbfBuffer([
      { length: 4, name: 'CAR', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 9, name: 'ELAPSED', type: 'N' },
      { length: 3, name: 'LINE_NO', type: 'N' },
      { length: 3, name: 'LANE_NO', type: 'N' },
    ], [
      { CAR: 42, ELAPSED: 400000, LANE_NO: 2, LINE_NO: 6, TXNUM: 1234 },
    ]));

    const imported = await loadMrScatsCatalogFromLocation(tempDir);
    const crossings = (imported.raceState.records || []).slice(1) as unknown as Array<Record<string, unknown>>;

    expect(crossings).toHaveLength(3);
    expect(crossings.map((crossing) => crossing.antenna)).toEqual([
      'Line 5 Loop 1',
      'Line 6 Loop 2',
      undefined,
    ]);
    expect(crossings.map((crossing) => crossing.isLapCompletion)).toEqual([false, false, true]);
    expect(crossings.map((crossing) => crossing.time)).toEqual([
      new Date('1997-06-28T23:00:30.000Z'),
      new Date('1997-06-28T23:00:40.000Z'),
      new Date('1997-06-28T23:00:50.000Z'),
    ]);
  });

  it('uses grid or actual programme times with seconds precision when present', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-catalog-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
      { length: 5, name: 'STARTTIME', type: 'C' },
      { length: 8, name: 'GRIDTIME', type: 'C' },
      { length: 8, name: 'ACTUALSTRT', type: 'C' },
    ], [
      { ACTUALSTRT: '20:27:35', CATEGORY: 'CAT-A', EVENTNAME: 'Race 10', EV_CODE: 'T9743R10', GRIDTIME: '17:53:22', STARTDATE: '19971206', STARTTIME: '21:56' },
      { CATEGORY: 'CAT-B', EVENTNAME: 'Race 11', EV_CODE: 'T9743R11', GRIDTIME: '18:03:44', STARTDATE: '19971206', STARTTIME: '22:30' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVERS.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'DRIV_CLASS', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 27, DRIVER: 'Driver One', DRIV_CLASS: 'CAT-A', TXNUM: 1030 },
    ]));

    const imported = await loadMrScatsCatalogFromLocation(tempDir);

    expect(imported.sessions[0]?.scheduledStart).toBe('1997-12-06T09:27:35.000Z');
    expect(imported.sessions[1]?.scheduledStart).toBe('1997-12-06T07:03:44.000Z');
  });

  it('uses explicit legacy SRT time-of-day text when present', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-catalog-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
      { length: 8, name: 'ACTUALSTRT', type: 'C' },
    ], [
      { ACTUALSTRT: '13:25:00', CATEGORY: 'CAT-A', EVENTNAME: 'Race 1', EV_CODE: 'W9721R01', STARTDATE: '19970629' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVERS.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'DRIV_CLASS', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 8, DRIVER: 'Legacy Raw', DRIV_CLASS: 'CAT-A', TXNUM: 6008 },
    ]));
    await writeFile(path.join(tempDir, 'W9721R01.SRT'), '600817997112730008179971116300 071 13:25:11.6300 00\r');

    const imported = await loadMrScatsCatalogFromLocation(tempDir);
    const crossing = imported.raceState.records?.[1] as Record<string, unknown> | undefined;

    expect(crossing).toEqual(expect.objectContaining({
      chipCode: 6008,
      time: new Date('1997-06-29T03:25:11.630Z'),
    }));
  });

  it('falls back to the previous SRT file segment for missing race files and imports yellow plus green-resume flags', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-catalog-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
      { length: 8, name: 'ACTUALSTRT', type: 'C' },
      { length: 8, name: 'GRIDTIME', type: 'C' },
    ], [
      { ACTUALSTRT: '19:55:47', CATEGORY: 'CAT-A', EVENTNAME: 'Race 9', EV_CODE: 'T9743R09', STARTDATE: '19971206', GRIDTIME: '19:55:00' },
      { ACTUALSTRT: '20:02:29', CATEGORY: 'CAT-A', EVENTNAME: 'Race 10', EV_CODE: 'T9743R10', STARTDATE: '19971206', GRIDTIME: '20:02:00' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVERS.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'DRIV_CLASS', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 33, DRIVER: 'Race Nine Driver', DRIV_CLASS: 'CAT-A', TXNUM: 3355 },
      { CARNUMBER: 13, DRIVER: 'Race Ten Driver', DRIV_CLASS: 'CAT-A', TXNUM: 1300 },
    ]));
    await writeFile(path.join(tempDir, 'T9743R09.SRT'), [
      '600881437728440008814377286801 021 19:48:48.6801 00',
      '4008814381476604',
      '040881438149697001300108255000002',
      'E108814381718936',
      '4D08814381718986',
      '040881438172066633440206255000001',
      '4E08814384245260',
      '4008814385499814',
      '040881438552413601300109255000004',
    ].join('\r'));

    const imported = await loadMrScatsCatalogFromLocation(tempDir);
    const raceNineSession = imported.sessions.find((session) => session.eventCode === 'T9743R09');
    const raceTenSession = imported.sessions.find((session) => session.eventCode === 'T9743R10');
    const raceNineRecords = ((imported.raceState.records || []) as unknown as Array<Record<string, unknown> & { sessionId?: string }>).filter((record) => record.sessionId === raceNineSession?.id);
    const raceTenRecords = ((imported.raceState.records || []) as unknown as Array<Record<string, unknown> & { sessionId?: string }>).filter((record) => record.sessionId === raceTenSession?.id);

    expect(raceNineRecords[0]).toEqual(expect.objectContaining({
      flagType: 'green',
      indicatesRaceStart: true,
      time: new Date('1997-12-06T08:55:47.660Z'),
    }));
    expect(raceNineRecords).toEqual(expect.arrayContaining([
      expect.objectContaining({
        flagType: 'yellow',
        flagValue: 'caution',
        time: new Date('1997-12-06T08:56:11.898Z'),
      }),
      expect.objectContaining({
        flagType: 'green',
        indicatesRaceStart: false,
        time: new Date('1997-12-06T09:00:24.526Z'),
      }),
    ]));
    expect(raceTenRecords[0]).toEqual(expect.objectContaining({
      flagType: 'green',
      indicatesRaceStart: true,
      time: new Date('1997-12-06T09:02:29.981Z'),
    }));
    expect(raceTenRecords).toEqual(expect.arrayContaining([
      expect.objectContaining({
        chipCode: 130,
        time: new Date('1997-12-06T09:02:32.413Z'),
      }),
    ]));
  });
});
