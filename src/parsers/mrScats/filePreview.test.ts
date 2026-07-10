import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { previewMrScatsDataFile } from './filePreview.js';

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

const createZipBuffer = (entryName: string, entryData: Buffer): Buffer => {
  const name = Buffer.from(entryName, 'utf8');
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(0, 8);
  localHeader.writeUInt32LE(entryData.length, 18);
  localHeader.writeUInt32LE(entryData.length, 22);
  localHeader.writeUInt16LE(name.length, 26);
  const localOffset = 0;

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(0, 10);
  centralHeader.writeUInt32LE(entryData.length, 20);
  centralHeader.writeUInt32LE(entryData.length, 24);
  centralHeader.writeUInt16LE(name.length, 28);
  centralHeader.writeUInt32LE(localOffset, 42);
  const centralDirectory = Buffer.concat([centralHeader, name]);
  const localFile = Buffer.concat([localHeader, name, entryData]);
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50, 0);
  footer.writeUInt16LE(1, 10);
  footer.writeUInt32LE(centralDirectory.length, 12);
  footer.writeUInt32LE(localFile.length, 16);
  return Buffer.concat([localFile, centralDirectory, footer]);
};

const createDbtBuffer = (memosByBlockNumber: Record<number, string>): Buffer => {
  const blockNumbers = Object.keys(memosByBlockNumber).map(Number);
  const maxBlockNumber = Math.max(1, ...blockNumbers);
  const buffer = Buffer.alloc((maxBlockNumber + 1) * 512, 0);
  buffer.writeUInt32BE(maxBlockNumber + 1, 0);
  blockNumbers.forEach((blockNumber) => {
    const text = memosByBlockNumber[blockNumber] || '';
    const offset = blockNumber * 512;
    buffer.write(text, offset, 'latin1');
    buffer[offset + text.length] = 0x1a;
  });
  return buffer;
};

describe('MR-SCATS file preview', () => {
  it('previews DBF files as columnar records', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-preview-'));
    await writeFile(path.join(tempDir, 'DRIVERS.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 20, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 42, DRIVER: 'Alice Rider' },
    ]));

    const preview = await previewMrScatsDataFile(tempDir, 'DRIVERS.DBF', 'dbf-table');

    expect(preview).toEqual(expect.objectContaining({
      columns: ['CARNUMBER', 'DRIVER'],
      displayedRowCount: 1,
      parser: 'dbf',
      recordCount: 1,
    }));
    expect(preview.rows).toEqual([{ CARNUMBER: 42, DRIVER: 'Alice Rider' }]);
  });

  it('previews DBF-compatible CAR files as columnar records before trying index fallback', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-preview-'));
    await writeFile(path.join(tempDir, 'X0099A01.CAR'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 20, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 42, DRIVER: 'Alice Driver' },
      { CARNUMBER: 9, DRIVER: 'Chris Driver' },
    ]));

    const preview = await previewMrScatsDataFile(tempDir, 'X0099A01.CAR', 'dbf-table');

    expect(preview.parser).toBe('dbf');
    expect(preview.columns).toEqual(['CARNUMBER', 'DRIVER']);
    expect(preview.rows).toEqual([
      { CARNUMBER: 42, DRIVER: 'Alice Driver' },
      { CARNUMBER: 9, DRIVER: 'Chris Driver' },
    ]);
  });

  it('falls back to index-style preview for non-DBF CAR files', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-preview-'));
    const carBuffer = Buffer.alloc(64, 0);
    carBuffer.write('FIELD->CARNUMBER', 16, 'latin1');
    await writeFile(path.join(tempDir, 'X0099A01.CAR'), carBuffer);
    await writeFile(path.join(tempDir, 'X0099A01.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 20, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 42, DRIVER: 'Alice Driver' },
      { CARNUMBER: 9, DRIVER: 'Chris Driver' },
    ]));

    const preview = await previewMrScatsDataFile(tempDir, 'X0099A01.CAR', 'index');

    expect(preview.parser).toBe('ntx');
    expect(preview.columns).toEqual(['Index key', 'CARNUMBER', 'DRIVER']);
    expect(preview.rows).toEqual([
      { 'Index key': '9', CARNUMBER: 9, DRIVER: 'Chris Driver' },
      { 'Index key': '42', CARNUMBER: 42, DRIVER: 'Alice Driver' },
    ]);
    expect(preview.warnings.join(' ')).toContain('FIELD->CARNUMBER');
    expect(preview.warnings.join(' ')).toContain('X0099A01.DBF');
  });

  it('previews NTX files as indexed rows from the related DBF table', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-preview-'));
    const buffer = Buffer.alloc(64, 0);
    buffer.writeInt32LE(1024, 0);
    buffer.write('CARNUMBER', 16, 'latin1');
    await writeFile(path.join(tempDir, 'DRIVERS.NTX'), buffer);
    await writeFile(path.join(tempDir, 'DRIVERS.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 20, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 42, DRIVER: 'Alice Rider' },
      { CARNUMBER: 7, DRIVER: 'Bob Rider' },
    ]));

    const preview = await previewMrScatsDataFile(tempDir, 'DRIVERS.NTX', 'index');

    expect(preview.parser).toBe('ntx');
    expect(preview.columns).toEqual(['Index key', 'CARNUMBER', 'DRIVER']);
    expect(preview.rows).toEqual([
      { 'Index key': '7', CARNUMBER: 7, DRIVER: 'Bob Rider' },
      { 'Index key': '42', CARNUMBER: 42, DRIVER: 'Alice Rider' },
    ]);
    expect(preview.warnings.join(' ')).toContain('CARNUMBER');
    expect(preview.warnings.join(' ')).toContain('DRIVERS.DBF');
  });

  it('treats unknown ZIP archive entries as DBF-compatible tables when possible', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-preview-'));
    const archivePath = path.join(tempDir, 'meeting.zip');
    const dbfBuffer = createDbfBuffer([
      { length: 3, name: 'CAR\0', type: 'N' },
      { length: 8, name: 'LAP_TIME', type: 'C' },
    ], [
      { 'CAR\0': 7, LAP_TIME: '1:02.5' },
    ]);
    await writeFile(archivePath, createZipBuffer('W9721R10.NO1', dbfBuffer));

    const preview = await previewMrScatsDataFile(archivePath, 'W9721R10.NO1', 'no1-report');

    expect(preview.parser).toBe('dbf');
    expect(preview.columns).toEqual(['CAR', 'LAP_TIME']);
    expect(preview.rows).toEqual([{ CAR: 7, LAP_TIME: '1:02.5' }]);
  });

  it('derives passing time of day from programme start time and elapsed ten-thousandths', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-preview-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
      { length: 5, name: 'STARTTIME', type: 'C' },
      { length: 5, name: 'ACTUALSTRT', type: 'C' },
    ], [
      { ACTUALSTRT: '09:05', EV_CODE: 'W9721R10', STARTDATE: '19970629', STARTTIME: '09:00' },
    ]));
    await writeFile(path.join(tempDir, 'W9721R10.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 15, name: 'ELAPSED', type: 'N' },
      { length: 3, name: 'LINE_NO', type: 'N' },
      { length: 3, name: 'LANE_NO', type: 'N' },
    ], [
      { CARNUMBER: 42, ELAPSED: 803311, LANE_NO: 9, LINE_NO: 1, TXNUM: 1234 },
    ]));

    const preview = await previewMrScatsDataFile(tempDir, 'W9721R10.DBF', 'dbf-table');

    expect(preview.columns).toEqual(['CARNUMBER', 'TXNUM', 'Time of day', 'ELAPSED', 'LINE_NO', 'LANE_NO']);
    expect(preview.rows).toEqual([
      {
        CARNUMBER: 42,
        ELAPSED: 803311,
        LANE_NO: 9,
        LINE_NO: 1,
        TXNUM: 1234,
        'Time of day': '01:20.3311 (09:06:20.3311)',
      },
    ]);
    expect(preview.calculatedCells).toEqual([{ column: 'Time of day', rowIndex: 0 }]);
    expect(preview.warnings.join(' ')).toContain('ELAPSED / 10000');
  });

  it('derives NO1 preview time of day from PRGMME start and ENTRYTIME instead of ELAPSED', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-preview-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
      { length: 8, name: 'STARTTIME', type: 'C' },
      { length: 8, name: 'ACTUALSTRT', type: 'C' },
    ], [
      { ACTUALSTRT: '12:50:40', EV_CODE: 'C9743R10', STARTDATE: '19971206', STARTTIME: '12:50:00' },
    ]));
    await writeFile(path.join(tempDir, 'C9743R10.NO1'), createDbfBuffer([
      { length: 4, name: 'CAR', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'ENTRYTIME', type: 'N' },
      { length: 9, name: 'ELAPSED', type: 'N' },
      { length: 3, name: 'LINE_NO', type: 'N' },
      { length: 3, name: 'LANE_NO', type: 'N' },
    ], [
      { CAR: 42, ELAPSED: 756300006, ENTRYTIME: 803311, LANE_NO: 9, LINE_NO: 3, TXNUM: 1001 },
    ]));

    const preview = await previewMrScatsDataFile(tempDir, 'C9743R10.NO1', 'no1-report');

    expect(preview.columns).toEqual(['CAR', 'TXNUM', 'ENTRYTIME', 'Time of day', 'ELAPSED', 'LINE_NO', 'LANE_NO']);
    expect(preview.rows).toEqual([
      {
        CAR: 42,
        ELAPSED: 756300006,
        ENTRYTIME: 803311,
        LANE_NO: 9,
        LINE_NO: 3,
        TXNUM: 1001,
        'Time of day': '01:20.3311 (12:52:00.3311)',
      },
    ]);
    expect(preview.calculatedCells).toEqual([{ column: 'Time of day', rowIndex: 0 }]);
  });

  it('resolves DBF memo fields through the linked DBT memo file when present', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-preview-'));
    await writeFile(path.join(tempDir, 'DRIVERS.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 10, name: 'COMMENTS', type: 'M' },
    ], [
      { CARNUMBER: 42, COMMENTS: '2' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVERS.DBT'), createDbtBuffer({
      2: 'Scrutineering note for car 42',
    }));

    const preview = await previewMrScatsDataFile(tempDir, 'DRIVERS.DBF', 'dbf-table');

    expect(preview.parser).toBe('dbf');
    expect(preview.rows).toEqual([
      { CARNUMBER: 42, COMMENTS: 'Scrutineering note for car 42' },
    ]);
    expect(preview.warnings.join(' ')).toContain('DRIVERS.DBT');
  });

  it('previews DBT memo files as memo blocks and names a likely linked DBF table', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-preview-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 10, name: 'RACE_NOTE', type: 'M' },
    ], [
      { EV_CODE: 'R10', RACE_NOTE: '3' },
    ]));
    await writeFile(path.join(tempDir, 'PRGMME.DBT'), createDbtBuffer({
      3: 'Race note from stewards\r\nSecond line',
    }));

    const preview = await previewMrScatsDataFile(tempDir, 'PRGMME.DBT', 'dbt-memo');

    expect(preview).toEqual(expect.objectContaining({
      columns: ['Block number', 'Memo text'],
      fileKind: 'dbt-memo',
      parser: 'memo',
    }));
    expect(preview.rows).toEqual([
      { 'Block number': 3, 'Memo text': 'Race note from stewards\r\nSecond line' },
    ]);
    expect(preview.warnings.join(' ')).toContain('PRGMME.DBF');
  });

  it('previews SRT and ERF files as raw crossing text lines instead of DBF tables', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-preview-'));
    await writeFile(path.join(tempDir, 'W9721R10.SRT'), '600881437728440008814377286801 021 19:48:48.6801 00\r040881438149697001300108255000002\r4D08814381718986');

    const preview = await previewMrScatsDataFile(tempDir, 'W9721R10.SRT', 'raw-crossing-text');

    expect(preview).toEqual(expect.objectContaining({
      columns: ['Line number', 'Record type', 'Time of day', 'Time ticks', 'TxNo', 'Line', 'Loop', 'Confidence', 'Hits', 'Status', 'Raw crossing data'],
      displayedRowCount: 3,
      fileKind: 'raw-crossing-text',
      parser: 'text',
      recordCount: 3,
    }));
    expect(preview.rows).toEqual([
      {
        Confidence: '',
        Hits: '',
        Line: '',
        'Line number': 1,
        Loop: '',
        'Raw crossing data': '600881437728440008814377286801 021 19:48:48.6801 00',
        'Record type': 'SRT',
        Status: '00',
        'Time of day': '19:48:48.6801',
        'Time ticks': 713286801,
        TxNo: 6008,
      },
      {
        Confidence: '255',
        Hits: 2,
        Line: 1,
        'Line number': 2,
        Loop: 8,
        'Raw crossing data': '040881438149697001300108255000002',
        'Record type': '04',
        Status: '000',
        'Time of day': '19:55:49.6970',
        'Time ticks': 717496970,
        TxNo: 130,
      },
      {
        Confidence: '',
        Hits: '',
        Line: '',
        'Line number': 3,
        Loop: '',
        'Raw crossing data': '4D08814381718986',
        'Record type': 'yellow-flag',
        Status: '',
        'Time of day': '19:56:11.8986',
        'Time ticks': 717718986,
        TxNo: '',
      },
    ]);
    expect(preview.warnings.join(' ')).toContain('not dBase tables');
    expect(preview.warnings.join(' ')).toContain('authoritative time-of-day values');
  });

  it('previews AT1 files as DBF-compatible tables instead of raw crossing text', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-preview-'));
    await writeFile(path.join(tempDir, 'W9721R10.AT1'), createDbfBuffer([
      { length: 4, name: 'CAR', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 9, name: 'ELAPSED', type: 'N' },
      { length: 3, name: 'LINE_NO', type: 'N' },
      { length: 3, name: 'LANE_NO', type: 'N' },
    ], [
      { CAR: 7, ELAPSED: 15000, LANE_NO: 2, LINE_NO: 5, TXNUM: 1234 },
    ]));

    const preview = await previewMrScatsDataFile(tempDir, 'W9721R10.AT1', 'dbf-table');

    expect(preview).toEqual(expect.objectContaining({
      columns: ['CAR', 'TXNUM', 'ELAPSED', 'LINE_NO', 'LANE_NO'],
      displayedRowCount: 1,
      fileKind: 'dbf-table',
      parser: 'dbf',
      recordCount: 1,
    }));
    expect(preview.rows).toEqual([
      { CAR: 7, ELAPSED: 15000, LANE_NO: 2, LINE_NO: 5, TXNUM: 1234 },
    ]);
  });
});
