import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { EventCategory } from '../../model/eventcategory.js';
import type { EventParticipant } from '../../model/eventparticipant.js';
import type { GreenFlagRecord } from '../../model/flag.js';
import { createCategoryId, createEventEntrantId, createEventId, createEventParticipantId, createSessionId, createTimeRecordId, createTimeRecordSourceId } from '../../model/ids.js';
import type { EventId, SessionId } from '../../model/raceevent.js';
import type { RaceState } from '../../model/racestate.js';
import { EVENT_FLAG_DISPLAYED, RECORD_TX_CROSSING, type EventTimeRecord, type ParticipantPassingRecord } from '../../model/timerecord.js';
import { readMrScatsDbfTable, type MrScatsDbfRecord } from './dbf.js';
import { readMrScatsZipEntryBuffers } from './fileInventory.js';

export interface MrScatsImportedSession {
  categoryIds: string[];
  eventCode: string;
  eventType?: string;
  id: SessionId;
  name: string;
  scheduledStart: string;
}

export interface MrScatsCatalogImport {
  eventDate: string;
  eventId: EventId;
  eventName: string;
  raceState: Partial<RaceState>;
  sessions: MrScatsImportedSession[];
}

interface MrScatsCoreTables {
  buffers: Map<string, Buffer>;
  drivers: MrScatsDbfRecord[];
  programme: MrScatsDbfRecord[];
}

interface CoreTableSource {
  fileName: string;
  records: MrScatsDbfRecord[];
}

const DEFAULT_TIME_ZONE = 'Australia/Sydney';
const FALLBACK_EVENT_DATE = '1970-01-01';
const PROGRAMME_BASE_NAMES = ['PRGMME', 'PROG', 'PRG', 'PROGRAM', 'PROGRAMME', 'PRG1'];
const DRIVER_BASE_NAMES = ['DRIVERS', 'DRIVER', 'DRIVE'];
const CORE_TABLE_READABLE_EXTENSIONS = ['.DBF', '.DAT'];
const CORE_TABLE_RELATED_EXTENSIONS = ['.DBF', '.DAT', '.TXT'];
const DRIVER_NAME_FIELDS = ['DRIVER', 'DRIVER_2', 'DRIVER_3', 'DRIVER_4'];
const TRANSPONDER_FIELDS = ['TXNUM', 'TXNUM2', 'TXNUM3', 'TXNUM4', 'TXNUM5', 'TXNUM6', 'TXNUM7', 'TXNUM8'];
const CROSSING_ELAPSED_TICKS_PER_SECOND = 10000;
const CROSSING_ELAPSED_FIELDS = ['ELAPSED', 'ENTRYTIME'];
const CROSSING_TRANSPONDER_FIELDS = ['TXNUM', 'TX_NO', 'TRANSPONDR', 'TRANSPONDER'];
const CROSSING_PLATE_FIELDS = ['CARNUMBER', 'CAR', 'CAR_NO', 'CARNO'];
const CROSSING_GREEN_ELAPSED_FIELDS = ['GREENELAPS', 'GREEN_ELAP', 'STARTELAP', 'START_ELAP', 'STARTELPSD'];
const CROSSING_GREEN_FLAG_FIELDS = ['FLAG', 'SYNCMARK', 'STARTFIN'];

const asString = (value: unknown): string => value === undefined || value === null ? '' : String(value).trim();

const normalizeBaseName = (fileName: string): string => path.basename(fileName, path.extname(fileName)).toUpperCase();

const findCoreTableFileNames = (files: string[], baseNames: string[], extensions: string[] = CORE_TABLE_READABLE_EXTENSIONS): string[] => {
  const normalizedBaseNames = new Set(baseNames.map((baseName) => baseName.toUpperCase()));
  const normalizedExtensions = new Set(extensions.map((extension) => extension.toUpperCase()));
  const fileNames: string[] = [];

  baseNames.forEach((baseName) => {
    extensions.forEach((extension) => {
      const matchingFiles = files.filter((fileName) =>
        normalizeBaseName(fileName) === baseName.toUpperCase() &&
        path.extname(fileName).toUpperCase() === extension.toUpperCase()
      );
      matchingFiles.forEach((fileName) => {
        if (!fileNames.includes(fileName)) {
          fileNames.push(fileName);
        }
      });
    });
  });

  return fileNames.filter((fileName) =>
    normalizedBaseNames.has(normalizeBaseName(fileName)) &&
    normalizedExtensions.has(path.extname(fileName).toUpperCase())
  );
};

const createMissingCoreFileError = (sourceDescription: string, files: string[]): Error => {
  const programmeCandidates = PROGRAMME_BASE_NAMES.flatMap((baseName) => CORE_TABLE_READABLE_EXTENSIONS.map((extension) => `${baseName}${extension}`));
  const driverCandidates = DRIVER_BASE_NAMES.flatMap((baseName) => CORE_TABLE_READABLE_EXTENSIONS.map((extension) => `${baseName}${extension}`));
  const relatedProgrammeFiles = findCoreTableFileNames(files, PROGRAMME_BASE_NAMES, CORE_TABLE_RELATED_EXTENSIONS);
  const relatedDriverFiles = findCoreTableFileNames(files, DRIVER_BASE_NAMES, CORE_TABLE_RELATED_EXTENSIONS);

  return new Error(
    `MR-SCATS ${sourceDescription} must contain readable programme and driver tables. ` +
    `Tried programme=${programmeCandidates.join(', ')} and driver=${driverCandidates.join(', ')}. ` +
    `Found related programme=${relatedProgrammeFiles.join(', ') || 'none'} driver=${relatedDriverFiles.join(', ') || 'none'}.`
  );
};

const readDirectoryBuffers = async (rootPath: string, currentPath: string = rootPath): Promise<Map<string, Buffer>> => {
  const entries = await readdir(currentPath, { withFileTypes: true });
  const buffers = new Map<string, Buffer>();

  for (const entry of entries) {
    const entryPath = path.join(currentPath, entry.name);
    const relativePath = path.relative(rootPath, entryPath);
    if (entry.isDirectory()) {
      const childBuffers = await readDirectoryBuffers(rootPath, entryPath);
      childBuffers.forEach((buffer, fileName) => buffers.set(fileName, buffer));
    } else if (entry.isFile()) {
      buffers.set(relativePath, await readFile(entryPath));
    }
  }

  return buffers;
};

const readCoreTableBuffersFromDirectory = async (locationPath: string): Promise<Map<string, Buffer>> => {
  const buffers = await readDirectoryBuffers(locationPath);
  const files = Array.from(buffers.keys());
  const programmeFileNames = findCoreTableFileNames(files, PROGRAMME_BASE_NAMES);
  const driverFileNames = findCoreTableFileNames(files, DRIVER_BASE_NAMES);
  if (programmeFileNames.length === 0 || driverFileNames.length === 0) {
    throw createMissingCoreFileError('data location', files);
  }

  return buffers;
};

const readCoreTableBuffersFromZip = async (locationPath: string): Promise<Map<string, Buffer>> => {
  const archiveEntries = readMrScatsZipEntryBuffers(await readFile(locationPath));
  const files = Array.from(archiveEntries.keys());
  const programmeFileNames = findCoreTableFileNames(files, PROGRAMME_BASE_NAMES);
  const driverFileNames = findCoreTableFileNames(files, DRIVER_BASE_NAMES);
  if (programmeFileNames.length === 0 || driverFileNames.length === 0) {
    throw createMissingCoreFileError('ZIP archive', files);
  }

  return archiveEntries;
};

const readCoreTableSource = (buffers: Map<string, Buffer>, baseNames: string[], label: string): CoreTableSource => {
  const candidates = findCoreTableFileNames(Array.from(buffers.keys()), baseNames);
  const errors: string[] = [];

  for (const fileName of candidates) {
    try {
      return {
        fileName,
        records: readMrScatsDbfTable(buffers.get(fileName)!).records,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${fileName}: ${message}`);
    }
  }

  const tried = baseNames.flatMap((baseName) => CORE_TABLE_READABLE_EXTENSIONS.map((extension) => `${baseName}${extension}`)).join(', ');
  const related = findCoreTableFileNames(Array.from(buffers.keys()), baseNames, CORE_TABLE_RELATED_EXTENSIONS).join(', ') || 'none';
  const errorDetails = errors.length > 0 ? ` Last DBF parse errors: ${errors.join('; ')}.` : '';
  throw new Error(`MR-SCATS ${label} table could not be read. Tried ${tried}. Found related files: ${related}.${errorDetails}`);
};

const readCoreTables = async (locationPath: string): Promise<MrScatsCoreTables> => {
  const locationStat = await stat(locationPath);
  const buffers = locationStat.isDirectory()
    ? await readCoreTableBuffersFromDirectory(locationPath)
    : path.extname(locationPath).toLowerCase() === '.zip'
      ? await readCoreTableBuffersFromZip(locationPath)
      : (() => {
        throw new Error('MR-SCATS event loading currently supports directories and ZIP archives.');
      })();

  const programme = readCoreTableSource(buffers, PROGRAMME_BASE_NAMES, 'programme');
  const drivers = readCoreTableSource(buffers, DRIVER_BASE_NAMES, 'driver');

  return {
    buffers,
    drivers: drivers.records,
    programme: programme.records,
  };
};

const parseDate = (value: unknown): string | undefined => {
  const raw = asString(value);
  if (!/^\d{8}$/.test(raw)) {
    return undefined;
  }

  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
};

const parseDateTime = (dateValue: unknown, timeValue: unknown): string | undefined => {
  const date = parseDate(dateValue);
  if (!date) {
    return undefined;
  }

  const time = asString(timeValue);
  const normalizedTime = /^\d{1,2}:\d{2}$/.test(time) ? `${time.padStart(5, '0')}:00` : '00:00:00';
  return new Date(`${date}T${normalizedTime}+10:00`).toISOString();
};

const parseNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  const raw = asString(value);
  if (raw.length === 0) {
    return undefined;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseInteger = (value: unknown): number | undefined => {
  const parsed = parseNumber(value);
  if (parsed === undefined) {
    return undefined;
  }

  return Math.trunc(parsed);
};

const getFirstNumber = (record: MrScatsDbfRecord, fields: string[]): number | undefined => {
  for (const field of fields) {
    const parsed = parseNumber(record[field]);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
};

const getFirstPositiveInteger = (record: MrScatsDbfRecord, fields: string[]): number | undefined => {
  const parsed = getFirstNumber(record, fields);
  if (parsed === undefined) {
    return undefined;
  }

  const integer = Math.trunc(parsed);
  return integer > 0 ? integer : undefined;
};

const hasParticipantPlate = (participantsByPlate: Map<string, EventParticipant>, plateNumber: string): boolean =>
  participantsByPlate.has(plateNumber);

const buildParticipantsByPlate = (participants: EventParticipant[]): Map<string, EventParticipant> => {
  const participantsByPlate = new Map<string, EventParticipant>();
  participants.forEach((participant) => {
    participant.identifiers.forEach((identifier) => {
      const racePlate = (identifier as unknown as { racePlate?: unknown }).racePlate;
      if (racePlate !== undefined && racePlate !== null) {
        participantsByPlate.set(racePlate.toString().trim(), participant);
      }
    });
  });
  return participantsByPlate;
};

const hasParticipantTransponderForPlate = (
  participantsByPlate: Map<string, EventParticipant>,
  plateNumber: string,
  transponder: number | undefined
): boolean => {
  if (transponder === undefined) {
    return false;
  }

  const participant = participantsByPlate.get(plateNumber);
  if (!participant) {
    return false;
  }

  return participant.identifiers.some((identifier) => {
    const txNo = (identifier as unknown as { txNo?: unknown }).txNo;
    return txNo !== undefined && txNo !== null && txNo.toString() === transponder.toString();
  });
};

const getFirstString = (record: MrScatsDbfRecord, fields: string[]): string => {
  for (const field of fields) {
    const value = asString(record[field]);
    if (value.length > 0) {
      return value;
    }
  }

  return '';
};

const getMeetingCode = (programme: MrScatsDbfRecord[], locationPath: string): string => {
  const eventCode = programme.map((row) => asString(row.EV_CODE)).find((value) => value.length > 0);
  const eventCodeMatch = /^([A-Z]\d{4})/i.exec(eventCode || '');
  if (eventCodeMatch) {
    return eventCodeMatch[1]!.toUpperCase();
  }

  return path.basename(locationPath, path.extname(locationPath)).toUpperCase();
};

const getEventName = (programme: MrScatsDbfRecord[], meetingCode: string): string => {
  const eventNames = Array.from(new Set(programme.map((row) => asString(row.EVENTNAME)).filter((value) => value.length > 0)));
  return eventNames.length === 1 ? eventNames[0]! : `MR-SCATS ${meetingCode}`;
};

const getCategoryName = (value: unknown): string => asString(value) || 'Unclassified';

const buildCategories = (meetingCode: string, programme: MrScatsDbfRecord[], drivers: MrScatsDbfRecord[]): EventCategory[] => {
  const categoryNames = [
    ...programme.map((row) => getCategoryName(row.CATEGORY)),
    ...drivers.map((row) => getCategoryName(row.DRIV_CLASS)),
  ];
  return Array.from(new Set(categoryNames)).map((name): EventCategory => ({
    code: name,
    description: '',
    id: createCategoryId(`mr-scats:${meetingCode}:category:${name}`),
    name,
  }));
};

const buildSessions = (meetingCode: string, programme: MrScatsDbfRecord[], categoryIdByName: Map<string, string>): MrScatsImportedSession[] => {
  return programme
    .filter((row) => asString(row.EV_CODE).length > 0 || asString(row.EVENTNAME).length > 0)
    .map((row, index): MrScatsImportedSession => {
      const eventCode = asString(row.EV_CODE) || `${meetingCode}-${index + 1}`;
      const eventCodeType = /^([A-Z]\d{4})([A-Z])\d{2}/i.exec(eventCode)?.[2]?.toUpperCase();
      const categoryName = getCategoryName(row.CATEGORY);
      const categoryId = categoryIdByName.get(categoryName);
      const scheduledStart = parseDateTime(row.STARTDATE, row.ACTUALSTRT || row.STARTTIME) ||
        parseDateTime(row.STARTDATE, undefined) ||
        new Date(`${FALLBACK_EVENT_DATE}T00:00:00+10:00`).toISOString();
      return {
        categoryIds: categoryId ? [categoryId] : [],
        eventCode,
        eventType: asString(row.EVENTTYPE) || eventCodeType,
        id: createSessionId(`mr-scats:${meetingCode}:session:${eventCode}`),
        name: asString(row.EVENTNAME) || eventCode,
        scheduledStart,
      };
    });
};

const findSessionCrossingFileNames = (buffers: Map<string, Buffer>, session: MrScatsImportedSession): string[] => {
  const eventCode = session.eventCode.toUpperCase();
  return Array.from(buffers.keys())
    .filter((fileName) => normalizeBaseName(fileName) === eventCode)
    .filter((fileName) => path.extname(fileName).toUpperCase() === '.DBF');
};

const inferSessionCategoryIdsFromCrossings = (
  buffers: Map<string, Buffer>,
  session: MrScatsImportedSession,
  participantsByPlate: Map<string, EventParticipant>,
  participantCountByCategoryId: Map<string, number>
): string[] => {
  const existingCategoryHasParticipants = session.categoryIds.some((categoryId) => {
    return (participantCountByCategoryId.get(categoryId.toString()) || 0) > 0;
  });
  if (existingCategoryHasParticipants) {
    return session.categoryIds;
  }

  const inferredCategoryIds = new Set<string>();
  findSessionCrossingFileNames(buffers, session).forEach((fileName) => {
    try {
      readMrScatsDbfTable(buffers.get(fileName)!).records.forEach((record) => {
        const plateNumber = getFirstString(record, CROSSING_PLATE_FIELDS);
        const participant = participantsByPlate.get(plateNumber);
        if (participant?.categoryId) {
          inferredCategoryIds.add(participant.categoryId.toString());
        }
      });
    } catch (_error) {
      // Ignore unreadable candidate files; record import will do the same.
    }
  });

  return inferredCategoryIds.size > 0 ? Array.from(inferredCategoryIds) : session.categoryIds;
};

const inferSessionCategoryIds = (
  buffers: Map<string, Buffer>,
  sessions: MrScatsImportedSession[],
  participants: EventParticipant[]
): MrScatsImportedSession[] => {
  const participantsByPlate = buildParticipantsByPlate(participants);
  const participantCountByCategoryId = participants.reduce<Map<string, number>>((counts, participant) => {
    const categoryId = participant.categoryId.toString();
    counts.set(categoryId, (counts.get(categoryId) || 0) + 1);
    return counts;
  }, new Map<string, number>());

  return sessions.map((session): MrScatsImportedSession => ({
    ...session,
    categoryIds: inferSessionCategoryIdsFromCrossings(buffers, session, participantsByPlate, participantCountByCategoryId),
  }));
};

const getElapsedMilliseconds = (record: MrScatsDbfRecord): number | undefined => {
  const elapsedTicks = getFirstNumber(record, CROSSING_ELAPSED_FIELDS);
  if (elapsedTicks === undefined) {
    return undefined;
  }

  return (elapsedTicks / CROSSING_ELAPSED_TICKS_PER_SECOND) * 1000;
};

const getGreenElapsedMilliseconds = (records: MrScatsDbfRecord[]): number => {
  const explicitElapsed = records
    .map((record) => getFirstNumber(record, CROSSING_GREEN_ELAPSED_FIELDS))
    .find((value): value is number => value !== undefined);
  if (explicitElapsed !== undefined) {
    return (explicitElapsed / CROSSING_ELAPSED_TICKS_PER_SECOND) * 1000;
  }

  const flaggedRecord = records.find((record) => {
    return CROSSING_GREEN_FLAG_FIELDS.some((field) => {
      const value = asString(record[field]).toUpperCase();
      return value === 'G' || value === 'GREEN' || value === 'START' || value === 'S';
    });
  });

  return flaggedRecord ? getElapsedMilliseconds(flaggedRecord) || 0 : 0;
};

const createSessionGreenFlag = (
  meetingCode: string,
  session: MrScatsImportedSession,
  source: ReturnType<typeof createTimeRecordSourceId>,
  scheduledStartTime: Date,
  sequence: number
): GreenFlagRecord => ({
  categoryIds: session.categoryIds,
  eventId: createEventId(`mr-scats:${meetingCode}:event`),
  flagType: 'green',
  flagValue: 'course',
  id: createTimeRecordId(`mr-scats:${meetingCode}:session:${session.eventCode}:green-flag`),
  indicatesRaceStart: true,
  recordType: EVENT_FLAG_DISPLAYED,
  sequence,
  sessionId: session.id,
  source,
  systemGenerated: true,
  time: scheduledStartTime,
});

const createCrossingRecord = (
  meetingCode: string,
  session: MrScatsImportedSession,
  source: ReturnType<typeof createTimeRecordSourceId>,
  fileName: string,
  record: MrScatsDbfRecord,
  rowIndex: number,
  sessionElapsedZeroTime: Date,
  sequence: number,
  participantsByPlate: Map<string, EventParticipant>
): EventTimeRecord | undefined => {
  const elapsedMilliseconds = getElapsedMilliseconds(record);
  if (elapsedMilliseconds === undefined) {
    return undefined;
  }

  const rawTransponder = getFirstPositiveInteger(record, CROSSING_TRANSPONDER_FIELDS);
  const plateNumber = getFirstString(record, CROSSING_PLATE_FIELDS);
  const transponderLooksLikePlateNumber = rawTransponder !== undefined &&
    plateNumber.length > 0 &&
    rawTransponder.toString() === plateNumber &&
    hasParticipantPlate(participantsByPlate, plateNumber) &&
    !hasParticipantTransponderForPlate(participantsByPlate, plateNumber, rawTransponder);
  const transponder = transponderLooksLikePlateNumber ? undefined : rawTransponder;
  if (transponder === undefined && plateNumber.length === 0) {
    return undefined;
  }

  const time = new Date(sessionElapsedZeroTime.getTime() + elapsedMilliseconds);
  const stableRecordKey = [
    'mr-scats',
    meetingCode,
    session.eventCode,
    path.basename(fileName),
    asString(record.COUNTER) || `${rowIndex + 1}`,
    transponder === undefined ? '' : transponder.toString(),
    plateNumber,
    elapsedMilliseconds.toString(),
  ].join(':');
  const baseRecord: ParticipantPassingRecord = {
    dataLine: JSON.stringify(record),
    elapsedTime: null,
    eventId: createEventId(`mr-scats:${meetingCode}:event`),
    id: createTimeRecordId(stableRecordKey),
    originRecordNumber: rowIndex + 1,
    recordType: RECORD_TX_CROSSING,
    sequence,
    sessionId: session.id,
    source,
    time,
  };

  if (transponder !== undefined) {
    return {
      ...baseRecord,
      chipCode: transponder,
      ...(plateNumber.length > 0 ? { plateNumber } : {}),
    } as ParticipantPassingRecord & { chipCode: number; plateNumber?: string };
  }

  return {
    ...baseRecord,
    plateNumber,
  } as ParticipantPassingRecord & { plateNumber: string };
};

const buildSessionRecords = (
  meetingCode: string,
  buffers: Map<string, Buffer>,
  sessions: MrScatsImportedSession[],
  participants: EventParticipant[]
): EventTimeRecord[] => {
  const participantsByPlate = buildParticipantsByPlate(participants);

  return sessions.flatMap((session): EventTimeRecord[] => {
    const source = createTimeRecordSourceId(`mr-scats:${meetingCode}:source:${session.eventCode}`);
    const scheduledStartTime = new Date(session.scheduledStart);
    const sessionFileNames = findSessionCrossingFileNames(buffers, session);
    const sessionFileTables = sessionFileNames.flatMap((fileName) => {
      try {
        return [{
          fileName,
          records: readMrScatsDbfTable(buffers.get(fileName)!).records,
        }];
      } catch (_error) {
        return [];
      }
    });
    const crossingRows = sessionFileTables.flatMap((table) => table.records);
    const greenElapsedMilliseconds = getGreenElapsedMilliseconds(crossingRows);
    const sessionElapsedZeroTime = new Date(scheduledStartTime.getTime() - greenElapsedMilliseconds);
    const crossingRecords = sessionFileTables.flatMap((table) => table.records
      .map((record, rowIndex) => createCrossingRecord(
        meetingCode,
        session,
        source,
        table.fileName,
        record,
        rowIndex,
        sessionElapsedZeroTime,
        rowIndex + 2,
        participantsByPlate
      ))
      .filter((record): record is EventTimeRecord => record !== undefined));

    if (crossingRecords.length === 0) {
      return [];
    }

    return [
      createSessionGreenFlag(meetingCode, session, source, scheduledStartTime, 1),
      ...crossingRecords,
    ];
  });
};

const splitDriverName = (name: string): { firstname: string; surname: string } => {
  const parts = name.trim().split(/\s+/).filter((part) => part.length > 0);
  if (parts.length === 0) {
    return { firstname: '', surname: '' };
  }
  if (parts.length === 1) {
    return { firstname: parts[0]!, surname: '' };
  }

  return {
    firstname: parts.slice(0, -1).join(' '),
    surname: parts.at(-1)!,
  };
};

const buildIdentifiers = (driver: MrScatsDbfRecord): EventParticipant['identifiers'] => {
  const identifiers: EventParticipant['identifiers'] = [];
  const plateNumber = asString(driver.CARNUMBER);
  if (plateNumber.length > 0) {
    identifiers.push({ fromTime: undefined, racePlate: plateNumber, toTime: undefined } as EventParticipant['identifiers'][number] & { racePlate: string });
  }

  TRANSPONDER_FIELDS.map((field) => asString(driver[field]))
    .map((value) => parseInteger(value))
    .filter((value): value is number => value !== undefined && value > 0)
    .forEach((txNo) => {
      identifiers.push({ fromTime: undefined, toTime: undefined, txNo } as EventParticipant['identifiers'][number] & { txNo: number });
    });

  return identifiers;
};

const buildParticipants = (
  meetingCode: string,
  drivers: MrScatsDbfRecord[],
  categoryIdByName: Map<string, string>
): EventParticipant[] => {
  return drivers.flatMap((driver): EventParticipant[] => {
    const plateNumber = asString(driver.CARNUMBER);
    if (plateNumber.length === 0) {
      return [];
    }

    const categoryName = getCategoryName(driver.DRIV_CLASS);
    const categoryId = categoryIdByName.get(categoryName) || createCategoryId(`mr-scats:${meetingCode}:category:${categoryName}`);
    const entrantId = createEventEntrantId(`mr-scats:${meetingCode}:entrant:${plateNumber}`);
    const driverNames = DRIVER_NAME_FIELDS.map((field) => asString(driver[field]))
      .filter((name, index, names) => name.length > 0 && names.indexOf(name) === index);
    const fallbackName = asString(driver.ENTRANT) || asString(driver.SCRN_NAME) || `Car ${plateNumber}`;
    const names = driverNames.length > 0 ? driverNames : [fallbackName];

    return names.map((name, index): EventParticipant => {
      const { firstname, surname } = splitDriverName(name);
      return {
        categoryId,
        currentResult: undefined,
        entrantId,
        firstname,
        id: createEventParticipantId(`mr-scats:${meetingCode}:participant:${plateNumber}:${index + 1}`),
        identifiers: buildIdentifiers(driver),
        lastRecordTime: null,
        resultDuration: null,
        surname,
      };
    });
  });
};

const getEventDate = (programme: MrScatsDbfRecord[]): string => {
  return programme.map((row) => parseDate(row.STARTDATE)).find((date): date is string => !!date) || FALLBACK_EVENT_DATE;
};

export const loadMrScatsCatalogFromLocation = async (locationPath: string): Promise<MrScatsCatalogImport> => {
  const { buffers, drivers, programme } = await readCoreTables(locationPath);
  const meetingCode = getMeetingCode(programme, locationPath);
  const categories = buildCategories(meetingCode, programme, drivers);
  const categoryIdByName = new Map(categories.map((category) => [category.name, category.id]));
  const participants = buildParticipants(meetingCode, drivers, categoryIdByName);
  const sessions = inferSessionCategoryIds(buffers, buildSessions(meetingCode, programme, categoryIdByName), participants);
  const records = buildSessionRecords(meetingCode, buffers, sessions, participants);
  const eventDate = getEventDate(programme);

  return {
    eventDate,
    eventId: createEventId(`mr-scats:${meetingCode}:event`),
    eventName: getEventName(programme, meetingCode),
    raceState: {
      categories,
      participants,
      records,
      teams: [],
    },
    sessions,
  };
};

export const MR_SCATS_DEFAULT_TIME_ZONE = DEFAULT_TIME_ZONE;
