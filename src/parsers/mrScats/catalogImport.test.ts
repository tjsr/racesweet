import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTimeRecordSourceId } from '../../model/ids.js';
import { loadMrScatsCatalogFromLocation, MR_SCATS_DEFAULT_MINIMUM_LAP_TIME, MR_SCATS_DEFAULT_TIME_ZONE } from './catalogImport.js';

interface DbfField {
  length: number;
  name: string;
  type: string;
}

const getMelbourneDateParts = (value: Date): { date: string; hour: number } => {
  const formatter = new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    month: '2-digit',
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
  });
  const parts = Object.fromEntries(formatter.formatToParts(value).map((part) => [part.type, part.value]));

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
  };
};

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

const TEST_RAW_ABSOLUTE_TIME_OFFSET = 880_705_955_000;

const getTestRawTimeTicks = (timeText: string): number => {
  const match = /^(?<hours>\d{2}):(?<minutes>\d{2}):(?<seconds>\d{2})\.(?<fraction>\d{4})$/.exec(timeText);
  if (!match?.groups) {
    throw new Error(`Invalid test raw time: ${timeText}`);
  }

  return (
    (((Number(match.groups.hours) * 60) + Number(match.groups.minutes)) * 60) +
    Number(match.groups.seconds)
  ) * 10_000 + Number(match.groups.fraction);
};

const createTestRawVisibleTimeLine = (transmitter: number, timeText: string): string => {
  const absoluteTicks = TEST_RAW_ABSOLUTE_TIME_OFFSET + getTestRawTimeTicks(timeText);
  return `${String(transmitter).padStart(4, '0')}${String(absoluteTicks).padStart(14, '0')} 071 ${timeText} 00`;
};

const createTestRawSpecialEventLine = (drtCode: string, timeText: string): string => {
  const absoluteTicks = TEST_RAW_ABSOLUTE_TIME_OFFSET + getTestRawTimeTicks(timeText);
  return `${drtCode}${String(absoluteTicks).padStart(14, '0')}`;
};

const createTestRawCompactCrossingLine = (
  transmitter: number,
  timeText: string,
  lineNumber: number,
  laneNumber: number = 6
): string => {
  const absoluteTicks = TEST_RAW_ABSOLUTE_TIME_OFFSET + getTestRawTimeTicks(timeText);
  return [
    '04',
    String(absoluteTicks).padStart(14, '0'),
    String(transmitter).padStart(4, '0'),
    String(lineNumber).padStart(2, '0'),
    String(laneNumber).padStart(2, '0'),
    '255',
    '000',
    '004',
  ].join('');
};

describe('MR-SCATS catalog import parser', () => {
  it('defaults timezone-less legacy imports to Australia/Melbourne', () => {
    expect(MR_SCATS_DEFAULT_TIME_ZONE).toBe('Australia/Melbourne');
  });

  it('defaults imported MR-SCATS sessions to a 25 second minimum lap time', async () => {
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

    const imported = await loadMrScatsCatalogFromLocation(tempDir);

    expect(MR_SCATS_DEFAULT_MINIMUM_LAP_TIME).toBe(25_000);
    expect(imported.sessions[0]?.minimumLapTimeMilliseconds).toBe(25_000);
  });

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

  it('merges supplemental driver tables so T9743-style transmitter assignments are preserved for reloads', async () => {
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
      { CARNUMBER: 13, DRIVER: 'Race Ten Driver', DRIV_CLASS: 'CAT-A', TXNUM: 1300 },
    ]));
    await writeFile(path.join(tempDir, 'X9743A01.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 4, name: 'TXNUM2', type: 'N' },
      { length: 8, name: 'DRIV_CLASS', type: 'C' },
      { length: 45, name: 'ENTRANT', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 13, DRIVER: 'Race Ten Driver', DRIV_CLASS: 'CAT-A', ENTRANT: 'Car 13 Team', TXNUM: 130 },
      { CARNUMBER: 33, DRIVER: 'Race Nine Driver', DRIV_CLASS: 'CAT-A', ENTRANT: 'Car 33 Team', TXNUM: 3355, TXNUM2: 3344 },
    ]));
    await writeFile(path.join(tempDir, 'T9743R10.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 9, name: 'ELAPSED', type: 'N' },
      { length: 4, name: 'COUNTER', type: 'N' },
    ], [
      { CARNUMBER: 13, COUNTER: 1, ELAPSED: 100000, TXNUM: 130 },
      { CARNUMBER: 33, COUNTER: 2, ELAPSED: 200000, TXNUM: 3355 },
    ]));

    const imported = await loadMrScatsCatalogFromLocation(tempDir);

    expect(imported.raceState.participants).toEqual(expect.arrayContaining([
      expect.objectContaining({
        identifiers: expect.arrayContaining([
          expect.objectContaining({ racePlate: '13' }),
          expect.objectContaining({ txNo: 1300 }),
          expect.objectContaining({ txNo: 130 }),
        ]),
      }),
      expect.objectContaining({
        identifiers: expect.arrayContaining([
          expect.objectContaining({ racePlate: '33' }),
          expect.objectContaining({ txNo: 3355 }),
          expect.objectContaining({ txNo: 3344 }),
        ]),
      }),
    ]));
    expect((imported.raceState.records || []).slice(1)).toEqual(expect.arrayContaining([
      expect.objectContaining({ chipCode: 130, plateNumber: '13' }),
      expect.objectContaining({ chipCode: 3355, plateNumber: '33' }),
    ]));
  });

  it('keeps T9743-style duplicate driver names separate across categories and plates', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-catalog-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 12, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
      { length: 8, name: 'ACTUALSTRT', type: 'C' },
    ], [
      { ACTUALSTRT: '18:00:00', CATEGORY: 'SPORTSMN', EVENTNAME: 'Sportsmen Heat', EV_CODE: 'T9743R09', STARTDATE: '19971206' },
      { ACTUALSTRT: '19:00:00', CATEGORY: 'LEGENDS', EVENTNAME: 'Legends Heat', EV_CODE: 'T9743R10', STARTDATE: '19971206' },
      { ACTUALSTRT: '20:00:00', CATEGORY: 'NASCAR', EVENTNAME: 'Nascar Heat', EV_CODE: 'T9743R11', STARTDATE: '19971206' },
      { ACTUALSTRT: '21:00:00', CATEGORY: 'AUSCAR', EVENTNAME: 'Auscar Heat', EV_CODE: 'T9743R12', STARTDATE: '19971206' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVERS.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 12, name: 'DRIV_CLASS', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 11, DRIVER: 'Tony Howlett', DRIV_CLASS: 'SPORTSMN', TXNUM: 1101 },
      { CARNUMBER: 21, DRIVER: 'Tony Howlett', DRIV_CLASS: 'LEGENDS', TXNUM: 2101 },
      { CARNUMBER: 12, DRIVER: 'Greame O\'Brien', DRIV_CLASS: 'SPORTSMN', TXNUM: 1201 },
      { CARNUMBER: 22, DRIVER: 'Greame O\'Brien', DRIV_CLASS: 'LEGENDS', TXNUM: 2201 },
      { CARNUMBER: 12, DRIVER: 'Greame O\'Brien', DRIV_CLASS: 'NASCAR', TXNUM: 3201 },
      { CARNUMBER: 73, DRIVER: 'Darryl Howden', DRIV_CLASS: 'SPORTSMN', TXNUM: 7300 },
      { CARNUMBER: 73, DRIVER: 'Darryl Howden', DRIV_CLASS: 'NASCAR', TXNUM: 7301 },
      { CARNUMBER: 74, DRIVER: 'Neville Blight', DRIV_CLASS: 'SPORTSMN', TXNUM: 7400 },
      { CARNUMBER: 74, DRIVER: 'Neville Blight', DRIV_CLASS: 'NASCAR', TXNUM: 7401 },
      { CARNUMBER: 75, DRIVER: 'Luke Sheales', DRIV_CLASS: 'AUSCAR', TXNUM: 7500 },
      { CARNUMBER: 76, DRIVER: 'Luke Sheales', DRIV_CLASS: 'NASCAR', TXNUM: 7600 },
    ]));

    const imported = await loadMrScatsCatalogFromLocation(tempDir);
    const participantSummaries = (imported.raceState.participants || []).map((participant) => ({
      categoryId: participant.categoryId.toString(),
      name: `${participant.firstname} ${participant.surname}`.trim(),
      racePlate: participant.identifiers.find((identifier) => 'racePlate' in identifier)?.racePlate?.toString(),
      txNos: participant.identifiers
        .filter((identifier) => 'txNo' in identifier)
        .map((identifier) => identifier.txNo),
    }));
    const categoryIdsByName = new Map((imported.raceState.categories || []).map((category) => [category.name, category.id.toString()]));

    expect(participantSummaries).toEqual(expect.arrayContaining([
      expect.objectContaining({ categoryId: categoryIdsByName.get('SPORTSMN'), name: 'Tony Howlett', racePlate: '11', txNos: [1101] }),
      expect.objectContaining({ categoryId: categoryIdsByName.get('LEGENDS'), name: 'Tony Howlett', racePlate: '21', txNos: [2101] }),
      expect.objectContaining({ categoryId: categoryIdsByName.get('SPORTSMN'), name: 'Greame O\'Brien', racePlate: '12', txNos: [1201] }),
      expect.objectContaining({ categoryId: categoryIdsByName.get('LEGENDS'), name: 'Greame O\'Brien', racePlate: '22', txNos: [2201] }),
      expect.objectContaining({ categoryId: categoryIdsByName.get('NASCAR'), name: 'Greame O\'Brien', racePlate: '12', txNos: [3201] }),
      expect.objectContaining({ categoryId: categoryIdsByName.get('SPORTSMN'), name: 'Darryl Howden', racePlate: '73', txNos: [7300] }),
      expect.objectContaining({ categoryId: categoryIdsByName.get('NASCAR'), name: 'Darryl Howden', racePlate: '73', txNos: [7301] }),
      expect.objectContaining({ categoryId: categoryIdsByName.get('SPORTSMN'), name: 'Neville Blight', racePlate: '74', txNos: [7400] }),
      expect.objectContaining({ categoryId: categoryIdsByName.get('NASCAR'), name: 'Neville Blight', racePlate: '74', txNos: [7401] }),
      expect.objectContaining({ categoryId: categoryIdsByName.get('AUSCAR'), name: 'Luke Sheales', racePlate: '75', txNos: [7500] }),
      expect.objectContaining({ categoryId: categoryIdsByName.get('NASCAR'), name: 'Luke Sheales', racePlate: '76', txNos: [7600] }),
    ]));
    expect(participantSummaries.filter((participant) => participant.name === 'Greame O\'Brien')).toHaveLength(3);
    expect(participantSummaries.filter((participant) => participant.name === 'Darryl Howden')).toHaveLength(2);
    expect(participantSummaries.filter((participant) => participant.name === 'Neville Blight')).toHaveLength(2);
    expect(participantSummaries.filter((participant) => participant.name === 'Luke Sheales')).toHaveLength(2);
  });

  it('loads session crossing DBFs with deterministic record IDs and programme-start offset times', async () => {
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
      { CARNUMBER: 42, COUNTER: 7, ELAPSED: 10006, STARTELAP: 20009, TXNUM: 1001 },
      { CARNUMBER: 42, COUNTER: 8, ELAPSED: 25009, STARTELAP: 20009, TXNUM: 1001 },
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
      time: new Date('1997-06-28T23:05:01.000Z'),
      timeTenthOfMillisecond: 6,
    }));
    expect(records[2]).toEqual(expect.objectContaining({
      chipCode: 1001,
      originRecordNumber: 2,
      source: createTimeRecordSourceId('mr-scats:W9721:source:W9721R01:W9721R01.DBF'),
      time: new Date('1997-06-28T23:05:02.500Z'),
      timeTenthOfMillisecond: 9,
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
      { CAR: 42, ELAPSED: 756300006, ENTRYTIME: 300006, LANE_NO: 9, LINE_NO: 3, TXNUM: 1001 },
    ]));

    const imported = await loadMrScatsCatalogFromLocation(tempDir);
    const crossings = (imported.raceState.records || []).slice(1) as unknown as Array<Record<string, unknown>>;

    expect(crossings).toHaveLength(2);
    expect(crossings.map((crossing) => crossing.time)).toEqual([
      new Date('1997-06-29T07:00:30.000Z'),
      new Date('1997-06-30T04:01:00.000Z'),
    ]);
    expect(crossings[0]).toEqual(expect.objectContaining({
      chipCode: 1001,
      isLapCompletion: false,
      lineNumber: 3,
      loopNumber: 9,
      plateNumber: '42',
      timeTenthOfMillisecond: 6,
    }));
    expect(crossings[1]).toEqual(expect.objectContaining({
      chipCode: 1001,
      isLapCompletion: true,
      plateNumber: '42',
      timeTenthOfMillisecond: 0,
    }));
  });

  it('uses explicit NO1 ENTRYTIME time-of-day text instead of offsetting it from the programme start', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-catalog-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
      { length: 8, name: 'ACTUALSTRT', type: 'C' },
    ], [
      { ACTUALSTRT: '19:10', CATEGORY: 'AUSCAR', EVENTNAME: 'Race 8', EV_CODE: 'T9743R08', STARTDATE: '19971206' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVERS.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'DRIV_CLASS', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 4, DRIVER: 'AUSCAR Runner', DRIV_CLASS: 'AUSCAR', TXNUM: 1044 },
    ]));
    await writeFile(path.join(tempDir, 'T9743R08.NO1'), createDbfBuffer([
      { length: 4, name: 'CAR', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 13, name: 'ENTRYTIME', type: 'C' },
      { length: 9, name: 'ELAPSED', type: 'N' },
      { length: 3, name: 'LINE_NO', type: 'N' },
      { length: 3, name: 'LANE_NO', type: 'N' },
    ], [
      { CAR: 4, ELAPSED: 688409446, ENTRYTIME: '19:07:20.9446', LANE_NO: 8, LINE_NO: 1, TXNUM: 1044 },
    ]));

    const imported = await loadMrScatsCatalogFromLocation(tempDir, {
      ignoreLineOneNo1CrossingsWhenDbfPresent: false,
    });
    const crossing = ((imported.raceState.records || []) as unknown as Array<Record<string, unknown>>)
      .find((record) => record.recordType === 16);

    expect(imported.sessions[0]?.scheduledStart).toBe('1997-12-06T08:10:00.000Z');
    expect(crossing).toEqual(expect.objectContaining({
      chipCode: 1044,
      lineNumber: 1,
      loopNumber: 8,
      time: new Date('1997-12-06T08:07:20.944Z'),
      timeTenthOfMillisecond: 6,
    }));
  });

  it('marks NO1 line-one crossings ignored while aligning DBF times to the first matching NO1 transmitter crossing', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-catalog-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
      { length: 8, name: 'ACTUALSTRT', type: 'C' },
    ], [
      { ACTUALSTRT: '20:22:00', CATEGORY: 'NASCAR', EVENTNAME: 'Race 10', EV_CODE: 'T9743R10', STARTDATE: '19971206' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVERS.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'DRIV_CLASS', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 30, DRIVER: 'Offset Runner', DRIV_CLASS: 'NASCAR', TXNUM: 1030 },
    ]));
    await writeFile(path.join(tempDir, 'T9743R10.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'ENTRYTIME', type: 'N' },
      { length: 4, name: 'COUNTER', type: 'N' },
    ], [
      { CARNUMBER: 30, COUNTER: 1, ENTRYTIME: 2450000, TXNUM: 1030 },
    ]));
    await writeFile(path.join(tempDir, 'T9743R10.NO1'), createDbfBuffer([
      { length: 4, name: 'CAR', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'ENTRYTIME', type: 'N' },
      { length: 3, name: 'LINE_NO', type: 'N' },
      { length: 3, name: 'LANE_NO', type: 'N' },
    ], [
      { CAR: 30, ENTRYTIME: 330000, LANE_NO: 6, LINE_NO: 1, TXNUM: 1030 },
      { CAR: 30, ENTRYTIME: 450000, LANE_NO: 6, LINE_NO: 3, TXNUM: 1030 },
    ]));

    const imported = await loadMrScatsCatalogFromLocation(tempDir);
    const crossings = ((imported.raceState.records || []) as unknown as Array<Record<string, unknown>>)
      .filter((record) => record.recordType === 16);

    expect((imported.raceState.records || [])[0]).toEqual(expect.objectContaining({
      flagType: 'green',
      indicatesRaceStart: true,
      time: new Date('1997-12-06T09:18:28.000Z'),
    }));
    expect(crossings).toHaveLength(2);
    expect(crossings).toEqual([
      expect.objectContaining({
        chipCode: 1030,
        isLapCompletion: true,
        lineNumber: 1,
        loopNumber: 6,
        source: createTimeRecordSourceId('mr-scats:T9743:source:T9743R10:T9743R10.DBF'),
        time: new Date('1997-12-06T09:22:33.000Z'),
      }),
      expect.objectContaining({
        chipCode: 1030,
        isLapCompletion: false,
        lineNumber: 3,
        source: createTimeRecordSourceId('mr-scats:T9743:source:T9743R10:T9743R10.NO1'),
        time: new Date('1997-12-06T09:22:45.000Z'),
      }),
    ]);

    const importedWithoutLineOneIgnore = await loadMrScatsCatalogFromLocation(tempDir, {
      ignoreLineOneNo1CrossingsWhenDbfPresent: false,
    });
    const crossingsWithoutLineOneIgnore = ((importedWithoutLineOneIgnore.raceState.records || []) as unknown as Array<Record<string, unknown>>)
      .filter((record) => record.recordType === 16);
    expect(crossingsWithoutLineOneIgnore).toHaveLength(2);
    expect(crossingsWithoutLineOneIgnore).toEqual(expect.not.arrayContaining([
      expect.objectContaining({
        isExcluded: true,
        unrelatedReason: 'Line 1 imported from T9743R10.DBF',
      }),
    ]));
  });

  it('uses the first DBF crossing and first matching NO1 transmitter crossing to shift DBF records and the green flag', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-catalog-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
      { length: 8, name: 'ACTUALSTRT', type: 'C' },
    ], [
      { ACTUALSTRT: '20:00:00', CATEGORY: 'NASCAR', EVENTNAME: 'Race 10', EV_CODE: 'T9743R10', STARTDATE: '19971206' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVERS.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'DRIV_CLASS', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 22, DRIVER: 'Offset Driver', DRIV_CLASS: 'NASCAR', TXNUM: 202 },
    ]));
    await writeFile(path.join(tempDir, 'T9743R10.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 9, name: 'ELAPSED', type: 'N' },
      { length: 4, name: 'COUNTER', type: 'N' },
    ], [
      { CARNUMBER: 22, COUNTER: 1, ELAPSED: 300000, TXNUM: 202 },
      { CARNUMBER: 22, COUNTER: 2, ELAPSED: 900000, TXNUM: 202 },
    ]));
    await writeFile(path.join(tempDir, 'T9743R10.NO1'), createDbfBuffer([
      { length: 4, name: 'CAR', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 13, name: 'ENTRYTIME', type: 'C' },
      { length: 3, name: 'LINE_NO', type: 'N' },
    ], [
      { CAR: 22, ENTRYTIME: '20:05:10.2500', LINE_NO: 1, TXNUM: 202 },
    ]));

    const imported = await loadMrScatsCatalogFromLocation(tempDir);
    const dbfCrossings = ((imported.raceState.records || []) as unknown as Array<Record<string, unknown>>)
      .filter((record) => record.recordType === 16 && record.source === createTimeRecordSourceId('mr-scats:T9743:source:T9743R10:T9743R10.DBF'));

    expect((imported.raceState.records || [])[0]).toEqual(expect.objectContaining({
      flagType: 'green',
      indicatesRaceStart: true,
      time: new Date('1997-12-06T09:04:40.250Z'),
    }));
    expect(dbfCrossings).toEqual([
      expect.objectContaining({
        chipCode: 202,
        time: new Date('1997-12-06T09:05:10.250Z'),
      }),
      expect.objectContaining({
        chipCode: 202,
        time: new Date('1997-12-06T09:06:10.250Z'),
      }),
    ]);
  });

  it('selects the NO1 crossing for the first DBF transmitter instead of the first NO1 row overall', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-catalog-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
      { length: 8, name: 'ACTUALSTRT', type: 'C' },
    ], [
      { ACTUALSTRT: '20:00:00', CATEGORY: 'NASCAR', EVENTNAME: 'Race 10', EV_CODE: 'T9743R10', STARTDATE: '19971206' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVERS.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'DRIV_CLASS', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 22, DRIVER: 'First DBF Driver', DRIV_CLASS: 'NASCAR', TXNUM: 202 },
      { CARNUMBER: 99, DRIVER: 'Earlier NO1 Driver', DRIV_CLASS: 'NASCAR', TXNUM: 999 },
    ]));
    await writeFile(path.join(tempDir, 'T9743R10.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 8, name: 'ELAPSED', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
    ], [
      { CARNUMBER: 22, ELAPSED: 100000, TXNUM: 202 },
    ]));
    await writeFile(path.join(tempDir, 'T9743R10.NO1'), createDbfBuffer([
      { length: 4, name: 'CAR', type: 'N' },
      { length: 13, name: 'ENTRYTIME', type: 'C' },
      { length: 4, name: 'TXNUM', type: 'N' },
    ], [
      { CAR: 99, ENTRYTIME: '20:00:01.0000', TXNUM: 999 },
      { CAR: 22, ENTRYTIME: '20:00:15.0000', TXNUM: 202 },
    ]));

    const imported = await loadMrScatsCatalogFromLocation(tempDir);
    const dbfCrossing = ((imported.raceState.records || []) as unknown as Array<Record<string, unknown>>)
      .find((record) => record.recordType === 16 && record.source === createTimeRecordSourceId('mr-scats:T9743:source:T9743R10:T9743R10.DBF'));

    expect((imported.raceState.records || [])[0]).toEqual(expect.objectContaining({
      time: new Date('1997-12-06T09:00:05.000Z'),
    }));
    expect(dbfCrossing).toEqual(expect.objectContaining({
      chipCode: 202,
      time: new Date('1997-12-06T09:00:15.000Z'),
    }));
  });

  it('does not align DBF records from a same-transmitter NO1 crossing unless the NO1 crossing is on line 1', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-catalog-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
      { length: 8, name: 'ACTUALSTRT', type: 'C' },
    ], [
      { ACTUALSTRT: '20:00:00', CATEGORY: 'NASCAR', EVENTNAME: 'Race 10', EV_CODE: 'T9743R10', STARTDATE: '19971206' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVERS.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'DRIV_CLASS', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 22, DRIVER: 'Line Three Driver', DRIV_CLASS: 'NASCAR', TXNUM: 202 },
    ]));
    await writeFile(path.join(tempDir, 'T9743R10.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 8, name: 'ELAPSED', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
    ], [
      { CARNUMBER: 22, ELAPSED: 100000, TXNUM: 202 },
    ]));
    await writeFile(path.join(tempDir, 'T9743R10.NO1'), createDbfBuffer([
      { length: 4, name: 'CAR', type: 'N' },
      { length: 13, name: 'ENTRYTIME', type: 'C' },
      { length: 3, name: 'LINE_NO', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
    ], [
      { CAR: 22, ENTRYTIME: '20:00:15.0000', LINE_NO: 3, TXNUM: 202 },
    ]));

    const imported = await loadMrScatsCatalogFromLocation(tempDir);
    const dbfCrossing = ((imported.raceState.records || []) as unknown as Array<Record<string, unknown>>)
      .find((record) => record.recordType === 16 && record.source === createTimeRecordSourceId('mr-scats:T9743:source:T9743R10:T9743R10.DBF'));

    expect((imported.raceState.records || [])[0]).toEqual(expect.objectContaining({
      time: new Date('1997-12-06T09:00:00.000Z'),
    }));
    expect(dbfCrossing).toEqual(expect.objectContaining({
      chipCode: 202,
      time: new Date('1997-12-06T09:00:10.000Z'),
    }));
  });

  it('leaves DBF records on the PRGMME start offset when NO1 has no crossing for the first DBF transmitter', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-catalog-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
      { length: 8, name: 'ACTUALSTRT', type: 'C' },
    ], [
      { ACTUALSTRT: '20:00:00', CATEGORY: 'NASCAR', EVENTNAME: 'Race 10', EV_CODE: 'T9743R10', STARTDATE: '19971206' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVERS.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'DRIV_CLASS', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 22, DRIVER: 'Offset Driver', DRIV_CLASS: 'NASCAR', TXNUM: 202 },
      { CARNUMBER: 99, DRIVER: 'Other Driver', DRIV_CLASS: 'NASCAR', TXNUM: 999 },
    ]));
    await writeFile(path.join(tempDir, 'T9743R10.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 8, name: 'ELAPSED', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
    ], [
      { CARNUMBER: 22, ELAPSED: 100000, TXNUM: 202 },
    ]));
    await writeFile(path.join(tempDir, 'T9743R10.NO1'), createDbfBuffer([
      { length: 4, name: 'CAR', type: 'N' },
      { length: 13, name: 'ENTRYTIME', type: 'C' },
      { length: 4, name: 'TXNUM', type: 'N' },
    ], [
      { CAR: 99, ENTRYTIME: '20:00:15.0000', TXNUM: 999 },
    ]));

    const imported = await loadMrScatsCatalogFromLocation(tempDir);
    const dbfCrossing = ((imported.raceState.records || []) as unknown as Array<Record<string, unknown>>)
      .find((record) => record.recordType === 16 && record.source === createTimeRecordSourceId('mr-scats:T9743:source:T9743R10:T9743R10.DBF'));

    expect((imported.raceState.records || [])[0]).toEqual(expect.objectContaining({
      time: new Date('1997-12-06T09:00:00.000Z'),
    }));
    expect(dbfCrossing).toEqual(expect.objectContaining({
      chipCode: 202,
      time: new Date('1997-12-06T09:00:10.000Z'),
    }));
  });

  it('merges NO1 timing-line metadata onto shifted DBF crossings when the aligned times match', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-catalog-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
      { length: 8, name: 'ACTUALSTRT', type: 'C' },
    ], [
      { ACTUALSTRT: '20:00:00', CATEGORY: 'NASCAR', EVENTNAME: 'Race 10', EV_CODE: 'T9743R10', STARTDATE: '19971206' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVERS.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'DRIV_CLASS', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 22, DRIVER: 'Metadata Driver', DRIV_CLASS: 'NASCAR', TXNUM: 202 },
    ]));
    await writeFile(path.join(tempDir, 'T9743R10.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 8, name: 'ELAPSED', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
    ], [
      { CARNUMBER: 22, ELAPSED: 100000, TXNUM: 202 },
    ]));
    await writeFile(path.join(tempDir, 'T9743R10.NO1'), createDbfBuffer([
      { length: 4, name: 'CAR', type: 'N' },
      { length: 13, name: 'ENTRYTIME', type: 'C' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 3, name: 'LINE_NO', type: 'N' },
      { length: 3, name: 'LANE_NO', type: 'N' },
      { length: 4, name: 'CONFID_FACT', type: 'N' },
      { length: 4, name: 'HIT_COUNT', type: 'N' },
    ], [
      { CAR: 22, CONFID_FACT: 88, ENTRYTIME: '20:00:15.0000', HIT_COUNT: 7, LANE_NO: 2, LINE_NO: 1, TXNUM: 202 },
    ]));

    const imported = await loadMrScatsCatalogFromLocation(tempDir);
    const crossings = ((imported.raceState.records || []) as unknown as Array<Record<string, unknown>>)
      .filter((record) => record.recordType === 16);

    expect(crossings).toHaveLength(1);
    expect(crossings[0]).toEqual(expect.objectContaining({
      chipCode: 202,
      confidenceFactor: 88,
      hitCount: 7,
      lineNumber: 1,
      loopNumber: 2,
      source: createTimeRecordSourceId('mr-scats:T9743:source:T9743R10:T9743R10.DBF'),
      time: new Date('1997-12-06T09:00:15.000Z'),
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
    expect(crossings.map((crossing) => [crossing.lineNumber, crossing.loopNumber])).toEqual([
      [3, 2],
      [4, 1],
    ]);
    expect(crossings[0]).toEqual(expect.objectContaining({
      confidenceFactor: 64,
    }));
    expect(crossings[1]).toEqual(expect.objectContaining({
      confidenceFactor: 63,
    }));
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

  it('uses NO1 instead of SRT and ignores AT index files when both are present', async () => {
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
    await writeFile(path.join(tempDir, 'T9743R10.AT1'), createDbfBuffer([
      { length: 4, name: 'CAR', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 9, name: 'ELAPSED', type: 'N' },
      { length: 3, name: 'LINE_NO', type: 'N' },
      { length: 3, name: 'LANE_NO', type: 'N' },
    ], [
      { CAR: 13, ELAPSED: 100000, LANE_NO: 1, LINE_NO: 5, TXNUM: 1234 },
    ]));
    await writeFile(path.join(tempDir, 'T9743R10.AT2'), createDbfBuffer([
      { length: 4, name: 'CAR', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 9, name: 'ELAPSED', type: 'N' },
      { length: 3, name: 'LINE_NO', type: 'N' },
      { length: 3, name: 'LANE_NO', type: 'N' },
    ], [
      { CAR: 13, ELAPSED: 400000, LANE_NO: 2, LINE_NO: 6, TXNUM: 1234 },
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

    expect(crossings).toHaveLength(2);
    expect(crossings.map((crossing) => sourceFileById.get(crossing.source as string))).toEqual([
      'T9743R10.NO1',
      'T9743R10.DBF',
    ]);
    expect(imported.raceState.timeRecordSources).toEqual(expect.arrayContaining([
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
    expect(imported.raceState.timeRecordSources).toEqual(expect.not.arrayContaining([
      expect.objectContaining({ filePath: 'T9743R10.SRT' }),
      expect.objectContaining({ filePath: 'T9743R10.AT1' }),
      expect.objectContaining({ filePath: 'T9743R10.AT2' }),
    ]));
  });

  it('anchors DBF offset times to the programme actual start when SRT visible times disagree', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-catalog-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
      { length: 8, name: 'ACTUALSTRT', type: 'C' },
    ], [
      { ACTUALSTRT: '20:27:35', CATEGORY: 'CAT-A', EVENTNAME: 'Race 10', EV_CODE: 'T9743R10', STARTDATE: '19971206' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVERS.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'DRIV_CLASS', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 13, DRIVER: 'Race Ten Driver', DRIV_CLASS: 'CAT-A', TXNUM: 1234 },
    ]));
    await writeFile(path.join(tempDir, 'T9743R10.SRT'), '12348814387450006 071 20:27:45.0006 00\r');
    await writeFile(path.join(tempDir, 'T9743R10.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'ENTRYTIME', type: 'N' },
      { length: 9, name: 'STARTELAP', type: 'N' },
      { length: 4, name: 'COUNTER', type: 'N' },
      { length: 3, name: 'LINE_NO', type: 'N' },
      { length: 3, name: 'LANE_NO', type: 'N' },
    ], [
      { CARNUMBER: 13, COUNTER: 1, ENTRYTIME: 300006, LANE_NO: 2, LINE_NO: 3, STARTELAP: 736550000, TXNUM: 1234 },
    ]));

    const imported = await loadMrScatsCatalogFromLocation(tempDir);
    const crossings = ((imported.raceState.records || []) as unknown as Array<Record<string, unknown>>)
      .filter((record) => record.recordType === 16);
    const crossingsBySource = new Map(crossings.map((crossing) => [crossing.source, crossing] as const));

    expect(crossings).toHaveLength(2);
    expect(crossingsBySource.has(createTimeRecordSourceId('mr-scats:T9743:source:T9743R10:T9743R10.SRT'))).toBe(true);
    expect(crossingsBySource.get(createTimeRecordSourceId('mr-scats:T9743:source:T9743R10:T9743R10.DBF'))).toEqual(expect.objectContaining({
      lineNumber: 3,
      source: createTimeRecordSourceId('mr-scats:T9743:source:T9743R10:T9743R10.DBF'),
      time: new Date('1997-12-06T09:28:05.000Z'),
      timeTenthOfMillisecond: 6,
    }));
    expect([crossingsBySource.get(createTimeRecordSourceId('mr-scats:T9743:source:T9743R10:T9743R10.DBF'))]
      .map((crossing) => getMelbourneDateParts(crossing?.time as Date))).toEqual([
      { date: '1997-12-06', hour: 20 },
    ]);
  });

  it('keeps DBF-only T9743R10 crossings on 1997-12-06 Melbourne time instead of drifting into the next day', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-catalog-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
      { length: 8, name: 'ACTUALSTRT', type: 'C' },
    ], [
      { ACTUALSTRT: '20:27:35', CATEGORY: 'CAT-A', EVENTNAME: 'Race 10', EV_CODE: 'T9743R10', STARTDATE: '19971206' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVERS.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'DRIV_CLASS', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 13, DRIVER: 'Race Ten Driver', DRIV_CLASS: 'CAT-A', TXNUM: 1234 },
    ]));
    await writeFile(path.join(tempDir, 'T9743R10.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 9, name: 'ELAPSED', type: 'N' },
      { length: 9, name: 'STARTELAP', type: 'N' },
      { length: 4, name: 'COUNTER', type: 'N' },
      { length: 3, name: 'LINE_NO', type: 'N' },
      { length: 3, name: 'LANE_NO', type: 'N' },
    ], [
      { CARNUMBER: 13, COUNTER: 1, ELAPSED: 300000, LANE_NO: 2, LINE_NO: 3, STARTELAP: 736550000, TXNUM: 1234 },
      { CARNUMBER: 13, COUNTER: 2, ELAPSED: 350000, LANE_NO: 2, LINE_NO: 3, STARTELAP: 736550000, TXNUM: 1234 },
    ]));

    const imported = await loadMrScatsCatalogFromLocation(tempDir);
    const crossings = ((imported.raceState.records || []) as unknown as Array<Record<string, unknown>>)
      .filter((record) => record.recordType === 16);
    const melbourneTimes = crossings.map((crossing) => getMelbourneDateParts(crossing.time as Date));

    expect(imported.sessions[0]?.scheduledStart).toBe('1997-12-06T09:27:35.000Z');
    expect(crossings.map((crossing) => crossing.time)).toEqual([
      new Date('1997-12-06T09:28:05.000Z'),
      new Date('1997-12-06T09:28:10.000Z'),
    ]);
    expect(melbourneTimes.every((crossing) => crossing.date === '1997-12-06')).toBe(true);
    expect(melbourneTimes.every((crossing) => crossing.hour >= 19 && crossing.hour <= 22)).toBe(true);
  });

  it('imports raw crossing confidence factors and hit counts separately', async () => {
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
    await writeFile(path.join(tempDir, 'T9743R10.SRT'), '040881438149697012340306255000004\r');

    const imported = await loadMrScatsCatalogFromLocation(tempDir);
    const crossing = (imported.raceState.records || [])[1] as unknown as Record<string, unknown> | undefined;

    expect(crossing).toEqual(expect.objectContaining({
      chipCode: 1234,
      confidenceFactor: 255,
      hitCount: 4,
      lineNumber: 3,
      loopNumber: 6,
    }));
  });

  it('imports DBF crossing confidence factors and hit counts when the fields are present', async () => {
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
    await writeFile(path.join(tempDir, 'T9743R10.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 9, name: 'ELAPSED', type: 'N' },
      { length: 4, name: 'COUNTER', type: 'N' },
      { length: 3, name: 'LINE_NO', type: 'N' },
      { length: 3, name: 'LANE_NO', type: 'N' },
      { length: 3, name: 'CONFIDENCE', type: 'N' },
      { length: 2, name: 'HITS', type: 'N' },
    ], [
      { CARNUMBER: 13, CONFIDENCE: 255, COUNTER: 1, ELAPSED: 500000, HITS: 4, LANE_NO: 6, LINE_NO: 3, TXNUM: 1234 },
    ]));

    const imported = await loadMrScatsCatalogFromLocation(tempDir);
    const crossing = (imported.raceState.records || [])[1] as unknown as Record<string, unknown> | undefined;

    expect(crossing).toEqual(expect.objectContaining({
      chipCode: 1234,
      confidenceFactor: 255,
      hitCount: 4,
      lineNumber: 3,
      loopNumber: 6,
    }));
  });

  it('ignores AT1 and AT2 index files as crossing records', async () => {
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

    expect(crossings).toHaveLength(1);
    expect(crossings.map((crossing) => [crossing.lineNumber, crossing.loopNumber])).toEqual([
      [undefined, undefined],
    ]);
    expect(crossings.map((crossing) => crossing.isLapCompletion)).toEqual([true]);
    expect(crossings.map((crossing) => crossing.time)).toEqual([
      new Date('1997-06-28T23:00:50.000Z'),
    ]);
    expect(imported.raceState.timeRecordSources).toEqual(expect.not.arrayContaining([
      expect.objectContaining({ filePath: 'W9721R01.AT1' }),
      expect.objectContaining({ filePath: 'W9721R01.AT2' }),
    ]));
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

  it('preserves explicit UTC offsets instead of reinterpreting them as Australia/Melbourne time', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-catalog-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
      { length: 12, name: 'ACTUALSTRT', type: 'C' },
    ], [
      { ACTUALSTRT: '20:27:35Z', CATEGORY: 'CAT-A', EVENTNAME: 'Race 10', EV_CODE: 'T9743R10', STARTDATE: '19971206' },
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

    expect(imported.sessions[0]?.scheduledStart).toBe('1997-12-06T20:27:35.000Z');
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
    await writeFile(path.join(tempDir, 'W9721R01.SRT'), '600817997112730108179971116301 071 13:25:11.6301 00\r');

    const imported = await loadMrScatsCatalogFromLocation(tempDir);
    const crossing = imported.raceState.records?.[1] as Record<string, unknown> | undefined;

    expect(crossing).toEqual(expect.objectContaining({
      chipCode: 6008,
      time: new Date('1997-06-29T03:25:11.630Z'),
      timeTenthOfMillisecond: 1,
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
      time: new Date('1997-12-06T08:55:47.000Z'),
    }));
    expect(raceNineRecords).toEqual(expect.arrayContaining([
      expect.objectContaining({
        description: 'Caution Period Start',
        flagType: 'yellow',
        flagValue: 'caution',
        time: new Date('1997-12-06T08:56:11.898Z'),
      }),
      expect.objectContaining({
        description: 'Caution period end',
        flagType: 'green',
        indicatesRaceStart: false,
        time: new Date('1997-12-06T09:00:24.526Z'),
      }),
    ]));
    expect(raceTenRecords[0]).toEqual(expect.objectContaining({
      flagType: 'green',
      indicatesRaceStart: true,
      time: new Date('1997-12-06T09:02:29.000Z'),
    }));
    expect(raceTenRecords).toEqual(expect.arrayContaining([
      expect.objectContaining({
        chipCode: 130,
        time: new Date('1997-12-06T09:02:32.413Z'),
      }),
    ]));
  });

  it('uses NO-series event-start markers to align elapsed time-of-day ticks precisely', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-catalog-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
      { length: 5, name: 'STARTTIME', type: 'C' },
    ], [
      { CATEGORY: 'CAT-A', EVENTNAME: 'Race 10', EV_CODE: 'T9743R10', STARTDATE: '19971206', STARTTIME: '20:02' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVERS.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'DRIV_CLASS', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 13, DRIVER: 'Race Ten Driver', DRIV_CLASS: 'CAT-A', TXNUM: 1300 },
    ]));
    await writeFile(path.join(tempDir, 'T9743R10.NO1'), createDbfBuffer([
      { length: 4, name: 'CAR', type: 'C' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 13, name: 'ENTRYTIME', type: 'C' },
      { length: 10, name: 'ELAPSED', type: 'N' },
      { length: 4, name: 'FLAG', type: 'N' },
      { length: 4, name: 'COUNTER', type: 'N' },
      { length: 3, name: 'LINE_NO', type: 'N' },
    ], [
      { CAR: '', COUNTER: 1, ELAPSED: 721491234, ENTRYTIME: '20:02:29.1234', FLAG: 8, TXNUM: 0 },
      { CAR: '13', COUNTER: 2, ELAPSED: 721521234, ENTRYTIME: undefined, FLAG: 0, LINE_NO: 1, TXNUM: 1300 },
    ]));

    const imported = await loadMrScatsCatalogFromLocation(tempDir);
    const records = imported.raceState.records || [];

    expect(records[0]).toEqual(expect.objectContaining({
      flagType: 'green',
      indicatesRaceStart: true,
      time: new Date('1997-12-06T09:02:29.123Z'),
    }));
    expect(records[1]).toEqual(expect.objectContaining({
      chipCode: 1300,
      lineNumber: 1,
      source: createTimeRecordSourceId('mr-scats:T9743:source:T9743R10:T9743R10.NO1'),
      time: new Date('1997-12-06T09:02:32.123Z'),
      timeTenthOfMillisecond: 4,
    }));
  });

  it('imports DBF flag markers as visible caution, white, and chequered flag records', async () => {
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
      { CARNUMBER: 13, DRIVER: 'Race Ten Driver', DRIV_CLASS: 'CAT-A', TXNUM: 1300 },
    ]));
    await writeFile(path.join(tempDir, 'T9743R10.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 8, name: 'ELAPSED', type: 'N' },
      { length: 8, name: 'TXNUM', type: 'N' },
      { length: 12, name: 'FLAG', type: 'C' },
    ], [
      { CARNUMBER: 13, ELAPSED: 10000, FLAG: 'Y', TXNUM: 1300 },
      { CARNUMBER: 13, ELAPSED: 20000, FLAG: 'G', TXNUM: 1300 },
      { CARNUMBER: 13, ELAPSED: 30000, FLAG: 'W', TXNUM: 1300 },
      { CARNUMBER: 13, ELAPSED: 40000, FLAG: 'C', TXNUM: 1300 },
    ]));

    const imported = await loadMrScatsCatalogFromLocation(tempDir);
    const raceTenSession = imported.sessions.find((session) => session.eventCode === 'T9743R10');
    const flagRecords = ((imported.raceState.records || []) as unknown as Array<Record<string, unknown> & { sessionId?: string }>)
      .filter((record) => record.sessionId === raceTenSession?.id && record.flagType !== undefined);

    expect(flagRecords).toEqual(expect.arrayContaining([
      expect.objectContaining({
        description: 'Caution Period Start',
        flagType: 'yellow',
        flagValue: 'caution',
        time: new Date('1997-12-06T09:02:30.000Z'),
      }),
      expect.objectContaining({
        description: 'Caution period end',
        flagType: 'green',
        indicatesRaceStart: false,
        time: new Date('1997-12-06T09:02:31.000Z'),
      }),
      expect.objectContaining({
        flagType: 'white',
        time: new Date('1997-12-06T09:02:32.000Z'),
      }),
      expect.objectContaining({
        flagType: 'chequered',
        time: new Date('1997-12-06T09:02:33.000Z'),
      }),
    ]));
  });

  it('selects the R10 SRT segment by the derived green flag time and excludes earlier R09 crossings', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-catalog-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
      { length: 8, name: 'ACTUALSTRT', type: 'C' },
    ], [
      { ACTUALSTRT: '20:22:15', CATEGORY: 'NASCAR', EVENTNAME: 'Race 10', EV_CODE: 'T9743R10', STARTDATE: '19971206' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVERS.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 4, name: 'TXNUM2', type: 'N' },
      { length: 8, name: 'DRIV_CLASS', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 34, DRIVER: 'Kevin Schwantz', DRIV_CLASS: 'NASCAR', TXNUM: 51, TXNUM2: 3344 },
    ]));
    await writeFile(path.join(tempDir, 'T9743R10.SRT'), [
      '999908814381863332 071 20:03:06.3332 00',
      '040881438186333233440106255000004',
      '040881438186555533440306255000004',
      '4008814393350000',
      '040881439338333200510306255000004',
    ].join('\r'));

    const imported = await loadMrScatsCatalogFromLocation(tempDir);
    const raceTenSession = imported.sessions.find((session) => session.eventCode === 'T9743R10');
    const raceTenRecords = ((imported.raceState.records || []) as unknown as Array<Record<string, unknown> & { sessionId?: string }>)
      .filter((record) => record.sessionId === raceTenSession?.id);
    const crossings = raceTenRecords.filter((record) => record.recordType === 16);

    expect(raceTenRecords[0]).toEqual(expect.objectContaining({
      flagType: 'green',
      indicatesRaceStart: true,
      time: new Date('1997-12-06T09:22:15.000Z'),
    }));
    expect(crossings).toEqual([
      expect.objectContaining({
        chipCode: 51,
        lineNumber: 3,
        loopNumber: 6,
        time: new Date('1997-12-06T09:22:18.333Z'),
      }),
    ]);
    expect(crossings).toEqual(expect.not.arrayContaining([
      expect.objectContaining({ chipCode: 3344 }),
    ]));
  });

  it('keeps DBF crossing times on PRGMME offsets even when SRT green flags could align them', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-catalog-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
      { length: 8, name: 'ACTUALSTRT', type: 'C' },
    ], [
      { ACTUALSTRT: '20:22:00', CATEGORY: 'NASCAR', EVENTNAME: 'Race 10', EV_CODE: 'T9743R10', STARTDATE: '19971206' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVERS.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'DRIV_CLASS', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 11, DRIVER: 'Line One Low', DRIV_CLASS: 'NASCAR', TXNUM: 101 },
      { CARNUMBER: 22, DRIVER: 'First DBF Runner', DRIV_CLASS: 'NASCAR', TXNUM: 202 },
      { CARNUMBER: 33, DRIVER: 'Line One High', DRIV_CLASS: 'NASCAR', TXNUM: 303 },
      { CARNUMBER: 44, DRIVER: 'Line One Highest', DRIV_CLASS: 'NASCAR', TXNUM: 404 },
    ]));
    await writeFile(path.join(tempDir, 'T9743R10.SRT'), [
      createTestRawVisibleTimeLine(0, '20:00:00.0000'),
      createTestRawCompactCrossingLine(101, '20:21:59.0000', 1),
      createTestRawCompactCrossingLine(202, '20:03:10.0000', 1),
      createTestRawCompactCrossingLine(303, '20:21:55.0000', 1),
      createTestRawCompactCrossingLine(303, '20:22:55.0000', 1),
      createTestRawCompactCrossingLine(303, '20:23:55.0000', 1),
      createTestRawCompactCrossingLine(404, '20:21:54.0000', 1),
      createTestRawCompactCrossingLine(404, '20:22:54.0000', 1),
      createTestRawCompactCrossingLine(404, '20:23:54.0000', 1),
      createTestRawCompactCrossingLine(404, '20:24:54.0000', 1),
      createTestRawSpecialEventLine('40', '20:22:00.0000'),
      createTestRawCompactCrossingLine(202, '20:22:10.0000', 1),
      createTestRawCompactCrossingLine(202, '20:22:30.0000', 3),
      createTestRawCompactCrossingLine(202, '20:22:45.0000', 7),
      createTestRawCompactCrossingLine(202, '20:23:10.0000', 1),
      createTestRawCompactCrossingLine(202, '20:24:10.0000', 1),
    ].join('\r'));
    await writeFile(path.join(tempDir, 'T9743R10.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'ENTRYTIME', type: 'N' },
      { length: 4, name: 'COUNTER', type: 'N' },
    ], [
      { CARNUMBER: 22, COUNTER: 1, ENTRYTIME: 100000, TXNUM: 202 },
      { CARNUMBER: 22, COUNTER: 2, ENTRYTIME: 700000, TXNUM: 202 },
      { CARNUMBER: 22, COUNTER: 3, ENTRYTIME: 1300000, TXNUM: 202 },
    ]));

    const imported = await loadMrScatsCatalogFromLocation(tempDir);
    const crossings = ((imported.raceState.records || []) as unknown as Array<Record<string, unknown>>)
      .filter((record) => record.recordType === 16 && record.source === createTimeRecordSourceId('mr-scats:T9743:source:T9743R10:T9743R10.DBF'));

    expect((imported.raceState.records || [])[0]).toEqual(expect.objectContaining({
      flagType: 'green',
      indicatesRaceStart: true,
      time: new Date('1997-12-06T09:22:00.000Z'),
    }));
    expect(crossings).toEqual([
      expect.objectContaining({
        chipCode: 202,
        lineNumber: 1,
        time: new Date('1997-12-06T09:22:10.000Z'),
      }),
      expect.objectContaining({
        chipCode: 202,
        lineNumber: 1,
        time: new Date('1997-12-06T09:23:10.000Z'),
      }),
      expect.objectContaining({
        chipCode: 202,
        lineNumber: 1,
        time: new Date('1997-12-06T09:24:10.000Z'),
      }),
    ]);
  });

  it('keeps separately timed SRT and DBF crossings when their PRGMME offset times differ', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-catalog-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
      { length: 8, name: 'ACTUALSTRT', type: 'C' },
    ], [
      { ACTUALSTRT: '20:02:00', CATEGORY: 'NASCAR', EVENTNAME: 'Race 10', EV_CODE: 'T9743R10', STARTDATE: '19971206' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVERS.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'DRIV_CLASS', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 34, DRIVER: 'Kevin Schwantz', DRIV_CLASS: 'NASCAR', TXNUM: 51 },
    ]));
    await writeFile(path.join(tempDir, 'T9743R10.SRT'), [
      '000008814393383332 071 20:22:18.3332 00',
      '040881439338333200510306255000004',
    ].join('\r'));
    await writeFile(path.join(tempDir, 'T9743R10.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'ENTRYTIME', type: 'N' },
      { length: 4, name: 'COUNTER', type: 'N' },
    ], [
      { CARNUMBER: 34, COUNTER: 1, ENTRYTIME: 33332, TXNUM: 51 },
    ]));
    const imported = await loadMrScatsCatalogFromLocation(tempDir);
    const crossings = ((imported.raceState.records || []) as unknown as Array<Record<string, unknown>>)
      .filter((record) => record.recordType === 16);

    expect(crossings).toEqual([
      expect.objectContaining({
        chipCode: 51,
        source: createTimeRecordSourceId('mr-scats:T9743:source:T9743R10:T9743R10.DBF'),
        time: new Date('1997-12-06T09:02:03.333Z'),
        timeTenthOfMillisecond: 2,
      }),
      expect.objectContaining({
        chipCode: 51,
        confidenceFactor: 255,
        hitCount: 4,
        lineNumber: 3,
        loopNumber: 6,
        source: createTimeRecordSourceId('mr-scats:T9743:source:T9743R10:T9743R10.SRT'),
        time: new Date('1997-12-06T09:22:18.333Z'),
        timeTenthOfMillisecond: 2,
      }),
    ]);
  });
});
