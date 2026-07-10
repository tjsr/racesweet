import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseCtcRawCrossingFile, splitCtcRawCrossingLines, type CtcRawCrossingRecord } from '../ctc/rawCrossing.js';
import { readMrScatsDbfTable, type MrScatsDbfRecord } from './dbf.js';
import { parseMrScatsDbfSummary, readMrScatsZipEntryBuffers, type MrScatsDataFileKind } from './fileInventory.js';

export type MrScatsPreviewValue = boolean | number | string | undefined;

export interface MrScatsCalculatedCell {
  column: string;
  rowIndex: number;
}

export interface MrScatsDataFilePreview {
  calculatedCells?: MrScatsCalculatedCell[];
  columns: string[];
  displayedRowCount: number;
  fileKind: MrScatsDataFileKind | 'binary-preview';
  fileName: string;
  parser: 'binary' | 'dbf' | 'memo' | 'ntx' | 'text';
  recordCount?: number;
  rows: Record<string, MrScatsPreviewValue>[];
  warnings: string[];
}

const DEFAULT_MAX_ROWS = 200;
const DBT_BLOCK_SIZE = 512;
const NTX_PAGE_SIZE = 1024;
const NTX_HEADER_SCAN_LENGTH = 512;
const INDEXED_PREVIEW_RECORD_LIMIT = 2000;
const TICKS_PER_SECOND = 10000;

const normalizeRelativePath = (relativePath: string): string => {
  return relativePath.replace(/\\/g, '/');
};

const isZipArchive = (locationPath: string): boolean => {
  return path.extname(locationPath).toLowerCase() === '.zip';
};

const readPreviewBuffer = async (locationPath: string, relativePath: string): Promise<Buffer> => {
  const locationStat = await stat(locationPath);
  if (locationStat.isDirectory()) {
    return readFile(path.join(locationPath, relativePath));
  }

  if (!isZipArchive(locationPath)) {
    throw new Error('MR-SCATS file preview currently supports directories and ZIP archives.');
  }

  const normalizedRelativePath = normalizeRelativePath(relativePath);
  const entries = readMrScatsZipEntryBuffers(await readFile(locationPath));
  const entry = entries.get(normalizedRelativePath) || entries.get(relativePath);
  if (!entry) {
    throw new Error(`MR-SCATS archive entry ${relativePath} was not found.`);
  }

  return entry;
};

const stringifyPreviewValue = (value: MrScatsPreviewValue): MrScatsPreviewValue => {
  if (value === undefined) {
    return '';
  }
  return value;
};

const getRelativeDirectory = (relativePath: string): string => {
  const normalizedPath = normalizeRelativePath(relativePath);
  return path.posix.dirname(normalizedPath);
};

const withRelativeDirectory = (relativePath: string, fileName: string): string => {
  const directory = getRelativeDirectory(relativePath);
  return directory === '.' ? fileName : `${directory}/${fileName}`;
};

const stripMemoBlockPadding = (block: Buffer): string => {
  const endMarkers = [block.indexOf(0x1a), block.indexOf(0x00)].filter((index) => index >= 0);
  const markerEnd = endMarkers.length > 0 ? Math.min(...endMarkers) : block.length;
  let binaryRunLength = 0;
  let binaryEnd = markerEnd;
  for (let index = 0; index < markerEnd; index += 1) {
    const value = block[index] || 0;
    const isTextByte = value === 0x09 || value === 0x0a || value === 0x0d || (value >= 0x20 && value <= 0x7e);
    binaryRunLength = isTextByte ? 0 : binaryRunLength + 1;
    if (binaryRunLength >= 4) {
      binaryEnd = index - binaryRunLength + 1;
      break;
    }
  }

  return block.subarray(0, binaryEnd).toString('latin1').trim();
};

const readMemoBlockText = (buffer: Buffer, blockNumber: number): string | undefined => {
  const offset = blockNumber * DBT_BLOCK_SIZE;
  if (blockNumber <= 0 || offset >= buffer.length) {
    return undefined;
  }

  const block = buffer.subarray(offset, Math.min(offset + DBT_BLOCK_SIZE, buffer.length));
  const text = stripMemoBlockPadding(block);
  return text.length > 0 ? text : undefined;
};

const parseMemoPointer = (value: MrScatsPreviewValue): number | undefined => {
  const rawValue = value === undefined ? '' : String(value).trim();
  if (rawValue.length === 0) {
    return undefined;
  }

  const parsed = Number(rawValue);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const parseDateTimeParts = (dateValue: MrScatsPreviewValue, timeValue: MrScatsPreviewValue): Date | undefined => {
  const rawDate = dateValue === undefined ? '' : String(dateValue).trim();
  const rawTime = timeValue === undefined ? '' : String(timeValue).trim();
  const dateMatch = /^(\d{4})(\d{2})(\d{2})$/.exec(rawDate);
  const timeMatch = /^(\d{1,2})(?::?(\d{2}))(?::?(\d{2}))?$/.exec(rawTime);
  if (!dateMatch || !timeMatch) {
    return undefined;
  }

  const year = Number(dateMatch[1]);
  const monthIndex = Number(dateMatch[2]) - 1;
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = timeMatch[3] === undefined ? 0 : Number(timeMatch[3]);
  const parsed = new Date(year, monthIndex, day, hour, minute, second, 0);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const formatTimeOfDayFromElapsedTicks = (sessionStart: Date, elapsedTicks: number): string => {
  const startTicks = (((sessionStart.getHours() * 60) + sessionStart.getMinutes()) * 60 + sessionStart.getSeconds()) * TICKS_PER_SECOND +
    (sessionStart.getMilliseconds() * 10);
  const dayTicks = 24 * 60 * 60 * TICKS_PER_SECOND;
  const totalTicks = ((Math.round(startTicks + elapsedTicks) % dayTicks) + dayTicks) % dayTicks;
  const totalSeconds = Math.floor(totalTicks / TICKS_PER_SECOND);
  const tenThousandths = totalTicks % TICKS_PER_SECOND;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(tenThousandths).padStart(4, '0')}`;
};

const formatElapsedTicks = (elapsedTicks: number): string => {
  const roundedTicks = Math.round(elapsedTicks);
  const sign = roundedTicks < 0 ? '-' : '';
  const absoluteTicks = Math.abs(roundedTicks);
  const totalSeconds = Math.floor(absoluteTicks / TICKS_PER_SECOND);
  const tenThousandths = absoluteTicks % TICKS_PER_SECOND;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const fractional = String(tenThousandths).padStart(4, '0');

  if (hours > 0) {
    return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${fractional}`;
  }

  return `${sign}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${fractional}`;
};

const findEventCodeStart = (records: MrScatsDbfRecord[], eventCode: string): Date | undefined => {
  const normalizedEventCode = eventCode.toUpperCase();
  const matchingRecord = records.find((record) => {
    return String(record.EV_CODE || '').trim().toUpperCase() === normalizedEventCode;
  });
  if (!matchingRecord) {
    return undefined;
  }

  return parseDateTimeParts(matchingRecord.STARTDATE, matchingRecord.ACTUALSTRT || matchingRecord.STARTTIME);
};

const findProgrammeCandidates = (relativePath: string): string[] => {
  return ['PRGMME.DBF', 'PROG.DBF', 'PRG1.DBF'].map((fileName) => withRelativeDirectory(relativePath, fileName));
};

const readSessionStartFromProgramme = async (
  locationPath: string,
  relativePath: string,
): Promise<{ eventCode: string; programmeFile: string; startTime: Date } | undefined> => {
  const eventCode = path.posix.basename(normalizeRelativePath(relativePath), path.posix.extname(relativePath));
  for (const candidate of findProgrammeCandidates(relativePath)) {
    try {
      const programmeBuffer = await readPreviewBuffer(locationPath, candidate);
      const programmeTable = readMrScatsDbfTable(programmeBuffer);
      const startTime = findEventCodeStart(programmeTable.records, eventCode);
      if (startTime) {
        return {
          eventCode,
          programmeFile: candidate,
          startTime,
        };
      }
    } catch {
      // Try the next likely programme file name.
    }
  }

  return undefined;
};

const getElapsedTicks = (record: MrScatsDbfRecord): number | undefined => {
  const elapsedValue = record.ELAPSED;
  if (typeof elapsedValue === 'number' && Number.isFinite(elapsedValue)) {
    return elapsedValue;
  }
  if (typeof elapsedValue === 'string') {
    const parsed = Number(elapsedValue.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const getTimeOfDaySourceTicks = (columns: string[], record: MrScatsDbfRecord): number | undefined => {
  if (columns.includes('ENTRYTIME')) {
    const entryTimeValue = record.ENTRYTIME;
    if (typeof entryTimeValue === 'number' && Number.isFinite(entryTimeValue)) {
      return entryTimeValue;
    }
    if (typeof entryTimeValue === 'string') {
      const parsed = Number(entryTimeValue.trim());
      return Number.isFinite(parsed) ? parsed : undefined;
    }
  }

  return getElapsedTicks(record);
};

const getTimeOfDaySourceField = (columns: string[]): 'ELAPSED' | 'ENTRYTIME' => {
  return columns.includes('ENTRYTIME') ? 'ENTRYTIME' : 'ELAPSED';
};

const addElapsedDerivedColumns = (
  columns: string[],
  records: MrScatsDbfRecord[],
  sessionStart: Date | undefined,
): { calculatedCells: MrScatsCalculatedCell[]; columns: string[]; records: MrScatsDbfRecord[] } => {
  if (!sessionStart || !columns.includes('ELAPSED')) {
    return { calculatedCells: [], columns, records };
  }

  const derivedColumn = 'Time of day';
  const elapsedIndex = columns.indexOf('ELAPSED');
  const derivedColumns = columns.includes(derivedColumn)
    ? columns
    : [...columns.slice(0, elapsedIndex), derivedColumn, ...columns.slice(elapsedIndex)];
  const calculatedCells: MrScatsCalculatedCell[] = [];
  const derivedRecords = records.map((record, rowIndex) => {
    const elapsedTicks = getTimeOfDaySourceTicks(columns, record);
    if (elapsedTicks === undefined) {
      return record;
    }
    const derivedTimeOfDay = formatTimeOfDayFromElapsedTicks(sessionStart, elapsedTicks);
    calculatedCells.push({ column: derivedColumn, rowIndex });
    return {
      ...record,
      [derivedColumn]: `${formatElapsedTicks(elapsedTicks)} (${derivedTimeOfDay})`,
    };
  });

  return {
    calculatedCells,
    columns: derivedColumns,
    records: derivedRecords,
  };
};

const findRelatedMemoCandidates = (relativePath: string): string[] => {
  const normalizedPath = normalizeRelativePath(relativePath);
  const fileName = path.posix.basename(normalizedPath);
  const baseName = path.posix.basename(fileName, path.posix.extname(fileName));
  return [withRelativeDirectory(relativePath, `${baseName}.DBT`), withRelativeDirectory(relativePath, `${baseName}.dbt`)];
};

const readRelatedMemoBuffer = async (
  locationPath: string,
  relativePath: string
): Promise<{ buffer: Buffer; relativePath: string } | undefined> => {
  for (const candidate of findRelatedMemoCandidates(relativePath)) {
    try {
      return {
        buffer: await readPreviewBuffer(locationPath, candidate),
        relativePath: candidate,
      };
    } catch {
      // Try the next likely memo file name.
    }
  }

  return undefined;
};

const findRelatedDbfForMemoCandidates = (relativePath: string): string[] => {
  const normalizedPath = normalizeRelativePath(relativePath);
  const fileName = path.posix.basename(normalizedPath);
  const baseName = path.posix.basename(fileName, path.posix.extname(fileName));
  return [withRelativeDirectory(relativePath, `${baseName}.DBF`), withRelativeDirectory(relativePath, `${baseName}.dbf`)];
};

const resolveMemoFields = (
  record: MrScatsDbfRecord,
  memoFieldNames: string[],
  memoBuffer: Buffer | undefined
): MrScatsDbfRecord => {
  if (!memoBuffer) {
    return record;
  }

  return {
    ...record,
    ...Object.fromEntries(memoFieldNames.map((fieldName) => {
      const blockNumber = parseMemoPointer(record[fieldName]);
      return [fieldName, blockNumber === undefined ? '' : readMemoBlockText(memoBuffer, blockNumber) || ''];
    })),
  };
};

const createDbfPreview = async (
  locationPath: string,
  relativePath: string,
  fileName: string,
  fileKind: MrScatsDataFileKind,
  buffer: Buffer,
  maxRows: number,
  warnings: string[] = []
): Promise<MrScatsDataFilePreview> => {
  const summary = parseMrScatsDbfSummary(buffer);
  if (!summary) {
    throw new Error('MR-SCATS file does not have a readable DBF header.');
  }

  const table = readMrScatsDbfTable(buffer, { maxRecords: maxRows });
  const baseColumns = summary.fields.map((field) => field.name);
  const memoFieldNames = summary.fields
    .filter((field) => field.type.toUpperCase() === 'M')
    .map((field) => field.name);
  const relatedMemo = memoFieldNames.length > 0 ? await readRelatedMemoBuffer(locationPath, relativePath) : undefined;
  const sessionStart = await readSessionStartFromProgramme(locationPath, relativePath);
  const resolvedRecords = table.records.map((record: MrScatsDbfRecord) => {
    const resolvedRecord = resolveMemoFields(record, memoFieldNames, relatedMemo?.buffer);
    return resolvedRecord;
  });
  const derived = addElapsedDerivedColumns(baseColumns, resolvedRecords, sessionStart?.startTime);
  const rows = derived.records.map((record: MrScatsDbfRecord) => {
    return Object.fromEntries(derived.columns.map((column) => [column, stringifyPreviewValue(record[column])]));
  });

  return {
    calculatedCells: derived.calculatedCells,
    columns: derived.columns,
    displayedRowCount: rows.length,
    fileKind,
    fileName,
    parser: 'dbf',
    recordCount: summary.recordCount,
    rows,
    warnings: [
      ...warnings,
      ...(memoFieldNames.length === 0 ? [] : [
        relatedMemo
          ? `Resolved memo fields ${memoFieldNames.join(', ')} from linked memo file ${relatedMemo.relativePath}.`
          : `Memo fields ${memoFieldNames.join(', ')} store external DBT block pointers, but no linked memo file was found.`,
      ]),
      ...(sessionStart ? [
        `Derived Time of day from ${sessionStart.programmeFile} event ${sessionStart.eventCode} start time plus ${getTimeOfDaySourceField(baseColumns)} / 10000 seconds.`,
      ] : []),
    ],
  };
};

const toPrintableText = (buffer: Buffer): string => {
  return buffer.toString('latin1').replace(/[^\x20-\x7e]/g, '.').trim();
};

const createBinaryRows = (buffer: Buffer, maxRows: number): Record<string, MrScatsPreviewValue>[] => {
  const rows: Record<string, MrScatsPreviewValue>[] = [];
  for (let offset = 0; offset < buffer.length && rows.length < maxRows; offset += 16) {
    const chunk = buffer.subarray(offset, Math.min(offset + 16, buffer.length));
    rows.push({
      Hex: chunk.toString('hex').replace(/(..)/g, '$1 ').trim(),
      Offset: offset,
      Text: toPrintableText(chunk),
    });
  }
  return rows;
};

const createRawCrossingTextPreview = (
  fileName: string,
  buffer: Buffer,
  maxRows: number,
): MrScatsDataFilePreview => {
  const lines = splitCtcRawCrossingLines(buffer);
  const parsedRecords = parseCtcRawCrossingFile(buffer);
  const parsedRowsByLine = new Map(parsedRecords.map((record) => [record.recordNumber, record]));
  const rows = lines.slice(0, maxRows).map((line, index) => {
    const parsedRecord = parsedRowsByLine.get(index + 1);
    return {
      'Line number': index + 1,
      'Record type': parsedRecord?.specialType || parsedRecord?.drtCode || '',
      'Time of day': parsedRecord?.timeText || '',
      'Time ticks': stringifyPreviewValue(parsedRecord?.rawTimeTicks),
      TxNo: stringifyPreviewValue(parsedRecord?.transmitter),
      Line: stringifyPreviewValue(parsedRecord?.lineNumber),
      Loop: stringifyPreviewValue(parsedRecord?.laneNumber),
      Confidence: stringifyPreviewValue(parsedRecord?.confidence),
      Hits: stringifyPreviewValue(parsedRecord?.hitCount),
      Status: stringifyPreviewValue(parsedRecord?.status),
      'Raw crossing data': line,
    };
  });

  return {
    columns: ['Line number', 'Record type', 'Time of day', 'Time ticks', 'TxNo', 'Line', 'Loop', 'Confidence', 'Hits', 'Status', 'Raw crossing data'],
    displayedRowCount: rows.length,
    fileKind: 'raw-crossing-text',
    fileName,
    parser: 'text',
    recordCount: lines.length,
    rows,
    warnings: [
      'CTC/Data-1 raw crossing files are plain-text records split by carriage-return style line breaks, not dBase tables.',
      'Where visible-time SRT rows are present, compact and control records derive authoritative time-of-day values from the same file offset.',
    ],
  };
};

const createDbtMemoPreview = async (
  locationPath: string,
  relativePath: string,
  fileName: string,
  buffer: Buffer,
  maxRows: number,
): Promise<MrScatsDataFilePreview> => {
  const likelyDbf = await Promise.all(findRelatedDbfForMemoCandidates(relativePath).map(async (candidate) => {
    try {
      await readPreviewBuffer(locationPath, candidate);
      return candidate;
    } catch {
      return undefined;
    }
  })).then((candidates) => candidates.find((candidate): candidate is string => candidate !== undefined));
  const blockCount = Math.max(0, Math.ceil(buffer.length / DBT_BLOCK_SIZE) - 1);
  const rows: Record<string, MrScatsPreviewValue>[] = [];
  for (let blockNumber = 1; blockNumber <= blockCount && rows.length < maxRows; blockNumber += 1) {
    const text = readMemoBlockText(buffer, blockNumber);
    if (text) {
      rows.push({
        'Block number': blockNumber,
        'Memo text': text,
      });
    }
  }

  return {
    columns: ['Block number', 'Memo text'],
    displayedRowCount: rows.length,
    fileKind: 'dbt-memo',
    fileName,
    parser: 'memo',
    recordCount: blockCount,
    rows,
    warnings: [
      'DBT files store external memo values for dBase memo fields; DBF records usually hold a 10-character block pointer into this file.',
      likelyDbf
        ? `Likely linked DBF table: ${likelyDbf}.`
        : 'No likely linked DBF table was found next to this memo file.',
    ],
  };
};

const extractNtxKeyExpression = (buffer: Buffer): string | undefined => {
  const headerText = buffer.subarray(0, Math.min(buffer.length, NTX_HEADER_SCAN_LENGTH)).toString('latin1');
  const runs = headerText.match(/[\x20-\x7e]{2,}/g) || [];
  const expressions = runs
    .map((run) => run.replace(/^[^A-Za-z(]+/, '').trim())
    .filter((run) => /[A-Za-z]/.test(run));

  return expressions.sort((left, right) => right.length - left.length)[0];
};

const normalizeFieldName = (fieldName: string): string => {
  return fieldName.replace(/^.*->/, '').trim().toUpperCase();
};

const findRecordValue = (record: MrScatsDbfRecord, fieldName: string): MrScatsPreviewValue => {
  const normalizedFieldName = normalizeFieldName(fieldName);
  const matchingKey = Object.keys(record).find((key) => key.toUpperCase() === normalizedFieldName);
  return matchingKey ? record[matchingKey] : undefined;
};

const splitNtxExpressionParts = (expression: string): string[] => {
  return expression
    .replace(/^\((.*)\)$/, '$1')
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
};

const formatNtxDate = (value: MrScatsPreviewValue): string => {
  const raw = value === undefined ? '' : String(value).trim();
  const digits = raw.replace(/\D/g, '');
  return digits.length === 8 ? digits : raw;
};

const evaluateNtxExpressionPart = (part: string, record: MrScatsDbfRecord, recordIndex: number): string => {
  const normalizedPart = part.replace(/^field->/i, '');
  const functionMatch = /^([A-Za-z]+)\((.*)\)$/.exec(normalizedPart);
  if (functionMatch) {
    const functionName = functionMatch[1]?.toUpperCase();
    const argument = functionMatch[2]?.trim() || '';
    if (functionName === 'RECNO') {
      return String(recordIndex + 1);
    }
    const value = findRecordValue(record, argument);
    if (functionName === 'UPPER') {
      return value === undefined ? '' : String(value).toUpperCase();
    }
    if (functionName === 'DTOS') {
      return formatNtxDate(value);
    }
    if (functionName === 'STR') {
      return value === undefined ? '' : String(value);
    }
  }

  if (/^recno\(\)$/i.test(normalizedPart)) {
    return String(recordIndex + 1);
  }

  const quotedStringMatch = /^["'](.*)["']$/.exec(normalizedPart);
  if (quotedStringMatch) {
    return quotedStringMatch[1] || '';
  }

  const value = findRecordValue(record, normalizedPart);
  return value === undefined ? '' : String(value);
};

const evaluateNtxKey = (expression: string | undefined, record: MrScatsDbfRecord, recordIndex: number): string => {
  if (!expression) {
    return '';
  }

  return splitNtxExpressionParts(expression)
    .map((part) => evaluateNtxExpressionPart(part, record, recordIndex))
    .join('');
};

const createIndexMetadataRows = (
  buffer: Buffer,
  expression: string | undefined,
  relatedDataFile: string | undefined
): Record<string, MrScatsPreviewValue>[] => {
  return [
    { Property: 'Key expression', Value: expression || 'Unknown' },
    { Property: 'Related data file', Value: relatedDataFile || 'Unknown' },
    { Property: 'File size bytes', Value: buffer.length },
    { Property: 'Estimated 1024-byte pages', Value: Math.ceil(buffer.length / NTX_PAGE_SIZE) },
  ];
};

const findRelatedDbfCandidates = (relativePath: string): string[] => {
  const normalizedPath = normalizeRelativePath(relativePath);
  const directory = path.posix.dirname(normalizedPath);
  const fileName = path.posix.basename(normalizedPath);
  const extension = path.posix.extname(fileName);
  const baseName = path.posix.basename(fileName, extension);
  const upperBaseName = baseName.toUpperCase();
  const inSameDirectory = (candidateFileName: string): string => {
    return directory === '.' ? candidateFileName : `${directory}/${candidateFileName}`;
  };

  if (upperBaseName.startsWith('PRGMME') || upperBaseName === 'PRG1' || upperBaseName === 'PROG' || upperBaseName === 'PROGRAMME') {
    return [inSameDirectory('PRGMME.DBF'), inSameDirectory('PROG.DBF'), inSameDirectory('PRG1.DBF')];
  }

  if (upperBaseName.startsWith('DRIVER') || upperBaseName === 'DRIVTEMP') {
    return [inSameDirectory('DRIVERS.DBF'), inSameDirectory('DRIVER.DBF')];
  }

  if (extension.toLowerCase() === '.fst') {
    return [inSameDirectory(`${baseName}.NO1`), inSameDirectory(`${baseName}.DBF`)];
  }

  return [inSameDirectory(`${baseName}.DBF`), inSameDirectory(`${baseName}.NO1`)];
};

const readRelatedDbfBuffer = async (
  locationPath: string,
  relativePath: string
): Promise<{ buffer: Buffer; relativePath: string } | undefined> => {
  for (const candidate of findRelatedDbfCandidates(relativePath)) {
    try {
      return {
        buffer: await readPreviewBuffer(locationPath, candidate),
        relativePath: candidate,
      };
    } catch {
      // Try the next likely source table name.
    }
  }

  return undefined;
};

const createNtxPreview = async (
  locationPath: string,
  relativePath: string,
  fileName: string,
  buffer: Buffer,
  maxRows: number
): Promise<MrScatsDataFilePreview> => {
  const expression = extractNtxKeyExpression(buffer);
  const relatedDbf = await readRelatedDbfBuffer(locationPath, relativePath);
  if (relatedDbf) {
    const summary = parseMrScatsDbfSummary(relatedDbf.buffer);
    if (summary) {
      const table = readMrScatsDbfTable(relatedDbf.buffer, {
        maxRecords: Math.max(maxRows, INDEXED_PREVIEW_RECORD_LIMIT),
      });
      const columns = ['Index key', ...summary.fields.map((field) => field.name)];
      const keyedRows = table.records
        .map((record, recordIndex) => ({
          key: evaluateNtxKey(expression, record, recordIndex),
          record,
        }))
        .sort((left, right) => left.key.localeCompare(right.key, undefined, { numeric: true }));
      const rows = keyedRows.slice(0, maxRows).map(({ key, record }) => {
        return {
          'Index key': key,
          ...Object.fromEntries(summary.fields.map((field) => [field.name, stringifyPreviewValue(record[field.name])])),
        };
      });

      return {
        columns,
        displayedRowCount: rows.length,
        fileKind: 'index',
        fileName,
        parser: 'ntx',
        recordCount: summary.recordCount,
        rows,
        warnings: [
          `Clipper NTX index key expression: ${expression || 'unknown'}.`,
          `Showing records from related table ${relatedDbf.relativePath} in index-key order; the NTX stores ordering keys and record references rather than standalone table rows.`,
        ],
      };
    }
  }

  const binaryRows = createBinaryRows(buffer, Math.max(0, maxRows - 4));
  const rows: Record<string, MrScatsPreviewValue>[] = [
    ...createIndexMetadataRows(buffer, expression, undefined).map((row) => ({
      Hex: String(row.Value),
      Offset: 0,
      Text: String(row.Property),
    })),
    ...binaryRows,
  ];

  return {
    columns: ['Offset', 'Hex', 'Text'],
    displayedRowCount: rows.length,
    fileKind: 'index',
    fileName,
    parser: 'ntx',
    rows,
    warnings: [
      `Clipper NTX index key expression: ${expression || 'unknown'}.`,
      'No related DBF table was found, so this preview shows index metadata and readable binary chunks.',
    ],
  };
};

const createBinaryPreview = (
  fileName: string,
  fileKind: MrScatsDataFileKind | 'binary-preview',
  buffer: Buffer,
  maxRows: number,
  warnings: string[]
): MrScatsDataFilePreview => {
  const rows = createBinaryRows(buffer, maxRows);
  return {
    columns: ['Offset', 'Hex', 'Text'],
    displayedRowCount: rows.length,
    fileKind,
    fileName,
    parser: 'binary',
    rows,
    warnings,
  };
};

export const previewMrScatsDataFile = async (
  locationPath: string,
  relativePath: string,
  fileKind: MrScatsDataFileKind = 'unknown',
  maxRows: number = DEFAULT_MAX_ROWS
): Promise<MrScatsDataFilePreview> => {
  const buffer = await readPreviewBuffer(locationPath, relativePath);
  const extension = path.extname(relativePath).toLowerCase();
  const fileName = path.basename(relativePath);

  if (extension === '.ntx' || fileKind === 'index') {
    return createNtxPreview(locationPath, relativePath, fileName, buffer, maxRows);
  }

  if (extension === '.srt' || extension === '.erf' || fileKind === 'raw-crossing-text') {
    return createRawCrossingTextPreview(fileName, buffer, maxRows);
  }

  if (extension === '.dbt' || fileKind === 'dbt-memo') {
    return createDbtMemoPreview(locationPath, relativePath, fileName, buffer, maxRows);
  }

  try {
    return await createDbfPreview(locationPath, relativePath, fileName, fileKind, buffer, maxRows);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createBinaryPreview(fileName, 'binary-preview', buffer, maxRows, [
      `Tried to read ${fileName} as a DBF-compatible table first: ${message}`,
    ]);
  }
};
