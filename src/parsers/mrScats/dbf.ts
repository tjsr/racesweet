import { parseMrScatsDbfSummary } from './fileInventory.js';

export type MrScatsDbfRecord = Record<string, string | number | boolean | undefined>;

interface DbfFieldLayout {
  length: number;
  name: string;
  offset: number;
  type: string;
}

export interface MrScatsDbfTable {
  records: MrScatsDbfRecord[];
}

interface ReadMrScatsDbfTableOptions {
  maxRecords?: number;
  onRecordRead?: (recordNumber: number) => void | Promise<void>;
}

const parseNumeric = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseLogical = (value: string): boolean | undefined => {
  const normalized = value.trim().toUpperCase();
  if (normalized === 'T' || normalized === 'Y') {
    return true;
  }
  if (normalized === 'F' || normalized === 'N') {
    return false;
  }
  return undefined;
};

const parseFieldValue = (rawValue: string, field: DbfFieldLayout): string | number | boolean | undefined => {
  switch (field.type) {
  case 'N':
  case 'F':
    return parseNumeric(rawValue);
  case 'L':
    return parseLogical(rawValue);
  default:
    return rawValue.trim();
  }
};

const getDbfFieldLayouts = (buffer: Buffer): DbfFieldLayout[] => {
  const summary = parseMrScatsDbfSummary(buffer);
  if (!summary) {
    throw new Error('MR-SCATS file does not have a readable DBF header.');
  }

  let fieldOffset = 1;
  return summary.fields.map((field) => {
    const layout = {
      length: field.length,
      name: field.name,
      offset: fieldOffset,
      type: field.type,
    };
    fieldOffset += field.length;
    return layout;
  });
};

export const readMrScatsDbfTable = (buffer: Buffer, options: ReadMrScatsDbfTableOptions = {}): MrScatsDbfTable => {
  const summary = parseMrScatsDbfSummary(buffer);
  if (!summary) {
    throw new Error('MR-SCATS file does not have a readable DBF header.');
  }

  const fields = getDbfFieldLayouts(buffer);

  const maxRecords = options.maxRecords === undefined ? summary.recordCount : Math.min(summary.recordCount, options.maxRecords);
  const records = Array.from({ length: maxRecords }, (_, index): MrScatsDbfRecord | undefined => {
    const recordOffset = summary.headerLength + (index * summary.recordLength);
    if (recordOffset + summary.recordLength > buffer.length) {
      return undefined;
    }
    options.onRecordRead?.(index + 1);
    if (buffer[recordOffset] === 0x2a) {
      return undefined;
    }

    const record = Object.fromEntries(fields.map((field) => {
      const rawValue = buffer.subarray(recordOffset + field.offset, recordOffset + field.offset + field.length).toString('latin1');
      return [field.name, parseFieldValue(rawValue, field)];
    }));
    return record;
  }).filter((record): record is MrScatsDbfRecord => record !== undefined);

  return { records };
};

export const readMrScatsDbfTableAsync = async (
  buffer: Buffer,
  options: ReadMrScatsDbfTableOptions = {}
): Promise<MrScatsDbfTable> => {
  const summary = parseMrScatsDbfSummary(buffer);
  if (!summary) {
    throw new Error('MR-SCATS file does not have a readable DBF header.');
  }

  const fields = getDbfFieldLayouts(buffer);
  const maxRecords = options.maxRecords === undefined ? summary.recordCount : Math.min(summary.recordCount, options.maxRecords);
  const records: MrScatsDbfRecord[] = [];

  for (let index = 0; index < maxRecords; index += 1) {
    const recordOffset = summary.headerLength + (index * summary.recordLength);
    if (recordOffset + summary.recordLength > buffer.length) {
      continue;
    }

    await options.onRecordRead?.(index + 1);
    if (buffer[recordOffset] === 0x2a) {
      continue;
    }

    records.push(Object.fromEntries(fields.map((field) => {
      const rawValue = buffer.subarray(recordOffset + field.offset, recordOffset + field.offset + field.length).toString('latin1');
      return [field.name, parseFieldValue(rawValue, field)];
    })));
  }

  return { records };
};
