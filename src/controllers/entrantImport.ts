import * as XLSX from 'xlsx';

export interface EntrantImportRecord {
  category?: string;
  classifiedLaps?: number;
  entrantName?: string;
  finishPosition?: number;
  firstName?: string;
  fullName?: string;
  lastName?: string;
  raceNumber?: string;
  startOrder?: number;
  teamName?: string;
  transponderNumber?: string;
  vehicle?: string;
}

type EntrantImportField = keyof EntrantImportRecord;

const FIELD_ALIASES: Record<EntrantImportField, string[]> = {
  category: ['category', 'class', 'class name', 'grade', 'division'],
  classifiedLaps: ['laps', 'classified laps', 'completed laps'],
  entrantName: ['entrant', 'entrant name'],
  finishPosition: ['finish', 'finish position', 'position', 'place'],
  firstName: ['first name', 'firstname', 'given name', 'givenname'],
  fullName: ['driver name', 'driver', 'rider name', 'rider', 'competitor name', 'competitor', 'full name', 'name'],
  lastName: ['surname', 'last name', 'lastname', 'family name', 'familyname'],
  raceNumber: [
    'race number',
    'race num',
    'race no',
    'race plate',
    'car number',
    'car num',
    'car num.',
    'car no',
    'vehicle number',
    'vehicle num',
    'vehicle no',
    'plate number',
    'plate',
    'bib number',
    'bib',
    'number',
    'no',
  ],
  startOrder: ['start order', 'grid position', 'grid', 'start', 'seed'],
  teamName: ['team', 'team name'],
  transponderNumber: ['transponder number', 'transponder no', 'transponder', 'transmitter number', 'transmitter no', 'transmitter', 'chip number', 'chip no', 'chip', 'tx number', 'tx no', 'txno', 'tx'],
  vehicle: ['vehicle', 'make/model', 'make model', 'vehicle make/model', 'car make/model', 'car'],
};

const normalizeHeader = (value: unknown): string => {
  return value?.toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '') || '';
};

const aliasFieldByNormalizedHeader = new Map<string, EntrantImportField>(
  Object.entries(FIELD_ALIASES).flatMap(([field, aliases]) => aliases.map((alias) => [
    normalizeHeader(alias),
    field as EntrantImportField,
  ]))
);

const getCellText = (value: unknown): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  const text = value.toString().trim();
  return text.length > 0 ? text : undefined;
};

const findHeaderRowIndex = (rows: unknown[][]): number => {
  const candidates = rows.slice(0, 25).map((row, index) => ({
    index,
    score: new Set(row.map((value) => aliasFieldByNormalizedHeader.get(normalizeHeader(value))).filter(Boolean)).size,
  }));
  const best = candidates.reduce((current, candidate) => candidate.score > current.score ? candidate : current, {
    index: -1,
    score: 0,
  });
  if (best.score === 0) {
    throw new Error('Entrant data file does not contain any recognised headers.');
  }
  return best.index;
};

const findColumnIndex = (headers: unknown[], field: EntrantImportField): number | undefined => {
  const normalizedHeaders = headers.map(normalizeHeader);
  for (const alias of FIELD_ALIASES[field]) {
    const index = normalizedHeaders.indexOf(normalizeHeader(alias));
    if (index >= 0) {
      return index;
    }
  }
  return undefined;
};

const splitFullName = (fullName: string | undefined): { firstName?: string; lastName?: string } => {
  if (!fullName) {
    return {};
  }
  const commaParts = fullName.split(',').map((part) => part.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    return {
      firstName: commaParts.slice(1).join(' '),
      lastName: commaParts[0],
    };
  }
  const parts = fullName.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ') || undefined,
  };
};

export const isPlaceholderEntrantName = (value: string | undefined): boolean => {
  const normalized = value?.trim().toLowerCase() || '';
  return normalized.length === 0 ||
    normalized === 'driver name' ||
    normalized === 'rider name' ||
    normalized === 'unknown' ||
    normalized === 'unknown driver' ||
    normalized === 'unknown participant' ||
    normalized.startsWith('unknown participant ') ||
    normalized.startsWith('new driver') ||
    normalized.startsWith('new rider');
};

export const parseEntrantImportRows = (rows: unknown[][]): EntrantImportRecord[] => {
  const headerRowIndex = findHeaderRowIndex(rows);
  const headers = rows[headerRowIndex] || [];
  const columnIndexes = Object.fromEntries(
    (Object.keys(FIELD_ALIASES) as EntrantImportField[]).map((field) => [field, findColumnIndex(headers, field)])
  ) as Record<EntrantImportField, number | undefined>;

  return rows.slice(headerRowIndex + 1).flatMap((row): EntrantImportRecord[] => {
    const readField = (field: EntrantImportField): string | undefined => {
      const index = columnIndexes[field];
      return index === undefined ? undefined : getCellText(row[index]);
    };
    const fullName = readField('fullName');
    const splitName = splitFullName(fullName);
    const firstName = readField('firstName') || splitName.firstName;
    const lastName = readField('lastName') || splitName.lastName;
    const raceNumber = readField('raceNumber');
    const transponderNumber = readField('transponderNumber');
    if (!firstName && !lastName && !raceNumber && !transponderNumber) {
      return [];
    }
    const startOrderValue = Number(readField('startOrder'));
    const classifiedLapsValue = Number(readField('classifiedLaps'));
    const finishPositionValue = Number(readField('finishPosition'));
    return [{
      entrantName: readField('entrantName'),
      category: readField('category'),
      classifiedLaps: Number.isFinite(classifiedLapsValue) && classifiedLapsValue >= 0 ? classifiedLapsValue : undefined,
      finishPosition: Number.isFinite(finishPositionValue) && finishPositionValue > 0 ? finishPositionValue : undefined,
      firstName,
      fullName,
      lastName,
      raceNumber,
      startOrder: Number.isFinite(startOrderValue) && startOrderValue > 0 ? startOrderValue : undefined,
      teamName: readField('teamName'),
      transponderNumber,
      vehicle: readField('vehicle'),
    }];
  });
};

export const parseEntrantImportBuffer = (buffer: ArrayBuffer | Uint8Array): EntrantImportRecord[] => {
  const workbook = XLSX.read(buffer, { type: 'array' });
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      blankrows: false,
      defval: undefined,
      header: 1,
      raw: false,
    });
    try {
      const records = parseEntrantImportRows(rows);
      if (records.length > 0) {
        return records;
      }
    } catch (_error) {
      // Try the next worksheet before reporting that no entrant table was found.
    }
  }
  throw new Error('Entrant data file does not contain a readable entrant table.');
};
