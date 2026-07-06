import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  listMrScatsDataFiles,
  listMrScatsZipEntries,
  parseMrScatsDbfSummary,
} from './fileInventory.js';

const createDbfBuffer = (): Buffer => {
  const headerLength = 97;
  const recordLength = 30;
  const buffer = Buffer.alloc(headerLength + recordLength);
  buffer[0] = 3;
  buffer[1] = 97;
  buffer[2] = 6;
  buffer[3] = 28;
  buffer.writeUInt32LE(1, 4);
  buffer.writeUInt16LE(headerLength, 8);
  buffer.writeUInt16LE(recordLength, 10);
  buffer.write('CARNUMBER', 32, 'latin1');
  buffer.write('N', 43, 'latin1');
  buffer[48] = 4;
  buffer.write('ELAPSED', 64, 'latin1');
  buffer.write('N', 75, 'latin1');
  buffer[80] = 15;
  buffer[96] = 0x0d;
  return buffer;
};

const createZipBuffer = (entryName: string): Buffer => {
  const name = Buffer.from(entryName, 'utf8');
  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt32LE(123, 24);
  centralHeader.writeUInt16LE(name.length, 28);
  const centralDirectory = Buffer.concat([centralHeader, name]);
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50, 0);
  footer.writeUInt16LE(1, 10);
  footer.writeUInt32LE(centralDirectory.length, 12);
  footer.writeUInt32LE(0, 16);
  return Buffer.concat([centralDirectory, footer]);
};

describe('MR-SCATS file inventory', () => {
  it('parses DBF header and field summaries', () => {
    expect(parseMrScatsDbfSummary(createDbfBuffer())).toEqual({
      fields: [
        { decimals: 0, length: 4, name: 'CARNUMBER', type: 'N' },
        { decimals: 0, length: 15, name: 'ELAPSED', type: 'N' },
      ],
      headerLength: 97,
      recordCount: 1,
      recordLength: 30,
      version: 3,
    });
  });

  it('lists MR-SCATS files from a local directory with session metadata', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-'));
    await writeFile(path.join(tempDir, 'W9721Q01.DBF'), createDbfBuffer());
    await writeFile(path.join(tempDir, 'W9721Q01.NTX'), Buffer.alloc(4));
    await writeFile(path.join(tempDir, 'W9721Q01.AT1'), Buffer.alloc(4));
    await writeFile(path.join(tempDir, 'W9721Q01.SRT'), '123456\r789012\r\n345678');

    const inventory = await listMrScatsDataFiles(tempDir);

    expect(inventory.sourceKind).toBe('directory');
    expect(inventory.files).toEqual([
      expect.objectContaining({
        kind: 'index',
        relativePath: 'W9721Q01.AT1',
      }),
      expect.objectContaining({
        dbf: expect.objectContaining({ recordCount: 1 }),
        kind: 'dbf-table',
        meetingCode: 'W9721',
        relativePath: 'W9721Q01.DBF',
        sessionCode: 'Q',
        sessionNumber: 1,
      }),
      expect.objectContaining({
        kind: 'index',
        relativePath: 'W9721Q01.NTX',
      }),
      expect.objectContaining({
        kind: 'raw-crossing-text',
        relativePath: 'W9721Q01.SRT',
      }),
    ]);
  });

  it('lists MR-SCATS files from a ZIP central directory', () => {
    expect(listMrScatsZipEntries(createZipBuffer('W9721R10.ERF'), 'sample.zip')).toEqual([
      expect.objectContaining({
        archivePath: 'sample.zip',
        kind: 'raw-crossing-text',
        meetingCode: 'W9721',
        relativePath: 'W9721R10.ERF',
        sessionCode: 'R',
        sessionNumber: 10,
        size: 123,
      }),
    ]);
  });
});
