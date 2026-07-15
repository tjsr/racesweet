import path from 'node:path';
import { readdir, readFile, stat } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';

export type MrScatsDataFileKind =
  | 'archive'
  | 'checksum'
  | 'continuity'
  | 'dbf-table'
  | 'dbt-memo'
  | 'index'
  | 'leader'
  | 'no1-report'
  | 'pit'
  | 'raw-crossing-text'
  | 'reason'
  | 'track-config'
  | 'unknown';

export interface MrScatsDbfFieldSummary {
  decimals: number;
  length: number;
  name: string;
  type: string;
}

export interface MrScatsDbfSummary {
  fields: MrScatsDbfFieldSummary[];
  headerLength: number;
  recordCount: number;
  recordLength: number;
  version: number;
}

export interface MrScatsDataFileSummary {
  archivePath?: string;
  dbf?: MrScatsDbfSummary;
  extension: string;
  kind: MrScatsDataFileKind;
  meetingCode?: string;
  name: string;
  relativePath: string;
  sessionCode?: string;
  sessionNumber?: number;
  size: number;
}

export interface MrScatsDataFileInventory {
  files: MrScatsDataFileSummary[];
  locationPath: string;
  sourceKind: 'archive' | 'directory';
}

const DBF_TERMINATOR = 0x0d;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ARJ_HEADER_SIGNATURE = 0xea60;

const classifyMrScatsFile = (extension: string): MrScatsDataFileKind => {
  if (/^\.no\d+$/i.test(extension)) {
    return 'no1-report';
  }

  switch (extension.toLowerCase()) {
  case '.fst':
  case '.nt1':
  case '.ntt':
  case '.ttx':
  case '.ntx':
    return 'index';
  case '.at1':
  case '.at2':
    return 'dbf-table';
  case '.zip':
  case '.arj':
    return 'archive';
  case '.ctn':
    return 'continuity';
  case '.dbf':
    return 'dbf-table';
  case '.dbt':
    return 'dbt-memo';
  case '.ldr':
    return 'leader';
  case '.md5':
    return 'checksum';
  case '.pit':
    return 'pit';
  case '.cfg':
    return 'track-config';
  case '.erf':
  case '.srt':
    return 'raw-crossing-text';
  case '.rsn':
    return 'reason';
  default:
    return 'dbf-table';
  }
};

const isDbfCompatibleFileKind = (kind: MrScatsDataFileKind): boolean => {
  return !['archive', 'checksum', 'dbt-memo', 'index', 'raw-crossing-text', 'track-config'].includes(kind);
};

const extractSessionParts = (name: string): Pick<MrScatsDataFileSummary, 'meetingCode' | 'sessionCode' | 'sessionNumber'> => {
  const match = /^([A-Z]\d{4})([A-Z])(\d{2})/i.exec(path.basename(name, path.extname(name)));
  if (!match) {
    return {};
  }

  return {
    meetingCode: match[1]?.toUpperCase(),
    sessionCode: match[2]?.toUpperCase(),
    sessionNumber: Number(match[3]),
  };
};

const isLikelyDbf = (buffer: Buffer): boolean => {
  if (buffer.length < 33) {
    return false;
  }

  const headerLength = buffer.readUInt16LE(8);
  const recordLength = buffer.readUInt16LE(10);
  if (headerLength < 33 || headerLength > buffer.length || recordLength <= 0) {
    return false;
  }

  return buffer.subarray(32, headerLength).includes(DBF_TERMINATOR);
};

const cleanDbfFieldName = (rawName: string): string => {
  return rawName.replace(/[\x00-\x1f].*$/, '').trim();
};

export const parseMrScatsDbfSummary = (buffer: Buffer): MrScatsDbfSummary | undefined => {
  if (!isLikelyDbf(buffer)) {
    return undefined;
  }

  const headerLength = buffer.readUInt16LE(8);
  const fields: MrScatsDbfFieldSummary[] = [];
  let offset = 32;
  while (offset + 32 <= headerLength && buffer[offset] !== DBF_TERMINATOR) {
    const rawName = buffer.subarray(offset, offset + 11).toString('latin1');
    fields.push({
      decimals: buffer[offset + 17] || 0,
      length: buffer[offset + 16] || 0,
      name: cleanDbfFieldName(rawName),
      type: buffer.subarray(offset + 11, offset + 12).toString('latin1'),
    });
    offset += 32;
  }

  return {
    fields,
    headerLength,
    recordCount: buffer.readUInt32LE(4),
    recordLength: buffer.readUInt16LE(10),
    version: buffer[0] || 0,
  };
};

const createSummary = async (
  rootPath: string,
  absolutePath: string,
  relativePath: string,
  size: number,
): Promise<MrScatsDataFileSummary> => {
  const extension = path.extname(relativePath).toLowerCase();
  const buffer = await readFile(path.join(rootPath, relativePath));
  const dbfSummary = parseMrScatsDbfSummary(buffer);
  const kind = extension === '.car'
    ? (dbfSummary ? 'dbf-table' : 'index')
    : classifyMrScatsFile(extension);
  const summary: MrScatsDataFileSummary = {
    extension,
    kind,
    name: path.basename(relativePath),
    relativePath,
    size,
    ...extractSessionParts(relativePath),
  };

  if (isDbfCompatibleFileKind(summary.kind)) {
    summary.dbf = dbfSummary;
  }

  return summary;
};

const listDirectoryFiles = async (rootPath: string, currentPath: string = rootPath): Promise<MrScatsDataFileSummary[]> => {
  const entries = await readdir(currentPath, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolutePath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      return listDirectoryFiles(rootPath, absolutePath);
    }

    if (!entry.isFile()) {
      return [];
    }

    const fileStat = await stat(absolutePath);
    const relativePath = path.relative(rootPath, absolutePath);
    return [await createSummary(rootPath, absolutePath, relativePath, fileStat.size)];
  }));

  return nested.flat().sort((left, right) => left.relativePath.localeCompare(right.relativePath));
};

const findZipEndOfCentralDirectory = (buffer: Buffer): number => {
  const minimumOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }

  throw new Error('ZIP central directory footer not found.');
};

export const listMrScatsZipEntries = (buffer: Buffer, archivePath: string): MrScatsDataFileSummary[] => {
  const footerOffset = findZipEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(footerOffset + 10);
  let offset = buffer.readUInt32LE(footerOffset + 16);
  const files: MrScatsDataFileSummary[] = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE) {
      throw new Error(`Invalid ZIP central directory entry at offset ${offset}.`);
    }

    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    offset += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith('/')) {
      continue;
    }

    const extension = path.extname(name).toLowerCase();
    files.push({
      archivePath,
      extension,
      kind: classifyMrScatsFile(extension),
      name: path.basename(name),
      relativePath: name,
      size: uncompressedSize || compressedSize,
      ...extractSessionParts(name),
    });
  }

  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
};

interface ZipCentralDirectoryEntry {
  compressedSize: number;
  compressionMethod: number;
  localHeaderOffset: number;
  name: string;
  uncompressedSize: number;
}

const readZipCentralDirectoryEntries = (buffer: Buffer): ZipCentralDirectoryEntry[] => {
  const footerOffset = findZipEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(footerOffset + 10);
  let offset = buffer.readUInt32LE(footerOffset + 16);
  const entries: ZipCentralDirectoryEntry[] = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE) {
      throw new Error(`Invalid ZIP central directory entry at offset ${offset}.`);
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    offset += 46 + nameLength + extraLength + commentLength;

    if (!name.endsWith('/')) {
      entries.push({
        compressedSize,
        compressionMethod,
        localHeaderOffset,
        name,
        uncompressedSize,
      });
    }
  }

  return entries;
};

export const readMrScatsZipEntryBuffers = (buffer: Buffer): Map<string, Buffer> => {
  const entries = readZipCentralDirectoryEntries(buffer);
  return entries.reduce<Map<string, Buffer>>((buffers, entry) => {
    if (buffer.readUInt32LE(entry.localHeaderOffset) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) {
      throw new Error(`Invalid ZIP local file header for ${entry.name}.`);
    }

    const nameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26);
    const extraLength = buffer.readUInt16LE(entry.localHeaderOffset + 28);
    const dataOffset = entry.localHeaderOffset + 30 + nameLength + extraLength;
    const compressedData = buffer.subarray(dataOffset, dataOffset + entry.compressedSize);
    let entryBuffer: Buffer;
    if (entry.compressionMethod === 0) {
      entryBuffer = Buffer.from(compressedData);
    } else if (entry.compressionMethod === 8) {
      entryBuffer = inflateRawSync(compressedData);
    } else {
      throw new Error(`Unsupported ZIP compression method ${entry.compressionMethod} for ${entry.name}.`);
    }

    if (entry.uncompressedSize > 0 && entryBuffer.length !== entry.uncompressedSize) {
      throw new Error(`ZIP entry ${entry.name} was expected to be ${entry.uncompressedSize} bytes but read ${entryBuffer.length}.`);
    }

    buffers.set(entry.name, entryBuffer);
    return buffers;
  }, new Map<string, Buffer>());
};

export const listMrScatsArjEntries = (buffer: Buffer, archivePath: string): MrScatsDataFileSummary[] => {
  const files: MrScatsDataFileSummary[] = [];
  let offset = 0;

  while (offset + 8 < buffer.length) {
    if (buffer.readUInt16LE(offset) !== ARJ_HEADER_SIGNATURE) {
      offset += 1;
      continue;
    }

    const headerSize = buffer.readUInt16LE(offset + 2);
    if (headerSize === 0) {
      break;
    }

    const basicHeaderOffset = offset + 4;
    const basicHeaderSize = buffer[basicHeaderOffset] || 0;
    const nameOffset = basicHeaderOffset + basicHeaderSize;
    const headerEnd = basicHeaderOffset + headerSize;
    if (basicHeaderSize === 0 || nameOffset >= headerEnd) {
      offset = headerEnd + 4;
      continue;
    }

    const nameEnd = buffer.indexOf(0, nameOffset);
    if (nameEnd > nameOffset && nameEnd < headerEnd) {
      const entryName = buffer.subarray(nameOffset, nameEnd).toString('latin1');
      const extension = path.extname(entryName).toLowerCase();
      if (extension.length > 0) {
        files.push({
          archivePath,
          extension,
          kind: classifyMrScatsFile(extension),
          name: path.basename(entryName),
          relativePath: entryName,
          size: 0,
          ...extractSessionParts(entryName),
        });
      }
    }

    offset = headerEnd + 4;
  }

  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
};

const listArchiveFiles = async (locationPath: string): Promise<MrScatsDataFileSummary[]> => {
  const buffer = await readFile(locationPath);
  const extension = path.extname(locationPath).toLowerCase();
  if (extension === '.zip') {
    return listMrScatsZipEntries(buffer, locationPath);
  }
  if (extension === '.arj') {
    return listMrScatsArjEntries(buffer, locationPath);
  }

  throw new Error(`Unsupported MR-SCATS archive type: ${extension || 'unknown'}.`);
};

export const listMrScatsDataFiles = async (locationPath: string): Promise<MrScatsDataFileInventory> => {
  const locationStat = await stat(locationPath);
  const sourceKind = locationStat.isDirectory() ? 'directory' : 'archive';
  const files = sourceKind === 'directory'
    ? await listDirectoryFiles(locationPath)
    : await listArchiveFiles(locationPath);

  return {
    files,
    locationPath,
    sourceKind,
  };
};
