import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { TZDate } from '@date-fns/tz';
import type { EventCategory } from '../../model/eventcategory.js';
import type { EventParticipant } from '../../model/eventparticipant.js';
import type { GreenFlagRecord, YellowFlagRecord } from '../../model/flag.js';
import { createCategoryId, createEventEntrantId, createEventId, createEventParticipantId, createSessionId, createTimeRecordId, createTimeRecordSourceId } from '../../model/ids.js';
import type { EventId, SessionId } from '../../model/raceevent.js';
import type { RaceState } from '../../model/racestate.js';
import { EVENT_FLAG_DISPLAYED, RECORD_TX_CROSSING, type EventTimeRecord, type ParticipantPassingRecord, type TimeRecordSource } from '../../model/timerecord.js';
import { parseCtcRawCrossingFile, type CtcRawCrossingRecord } from '../ctc/rawCrossing.js';
import { readMrScatsDbfTable, readMrScatsDbfTableAsync, type MrScatsDbfRecord } from './dbf.js';
import { parseMrScatsDbfSummary, readMrScatsZipEntryBuffers } from './fileInventory.js';

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
  loadPlan: MrScatsLoadPlan;
  programme: MrScatsDbfRecord[];
  progress?: MrScatsLoadProgressTracker;
}

interface CoreTableSource {
  fileName: string;
  records: MrScatsDbfRecord[];
}

export interface MrScatsCatalogLoadProgress {
  callerName?: string;
  completed: number;
  currentFile?: string;
  currentTask?: string;
  total: number;
}

interface MrScatsCatalogLoadOptions {
  extraSteps?: number;
  onProgress?: (progress: MrScatsCatalogLoadProgress) => void | Promise<void>;
}

interface MrScatsLoadProgressTracker {
  completeFileScan: (fileName: string, callerName: string) => Promise<void>;
  completeRow: (fileName: string, callerName: string) => Promise<void>;
}

interface MrScatsSessionLoadPlan {
  auxiliaryDbfFileNames: string[];
  dbfFileNames: string[];
  noFileNames: string[];
  rawFiles: MrScatsRawFilePlan[];
}

interface MrScatsRawFilePlan {
  fileName: string;
  lines: string[];
  records: CtcRawCrossingRecord[];
  segmentIndex: number;
}

interface MrScatsLoadPlan {
  coreFileCount: number;
  coreRowCount: number;
  drivers: CoreTableSource;
  programme: CoreTableSource;
  sessionPlansById: Map<string, MrScatsSessionLoadPlan>;
  sessionFileCount: number;
  sessionRowCount: number;
  total: number;
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
const CROSSING_MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const CROSSING_TIME_OF_DAY_PROXIMITY_MILLISECONDS = 6 * 60 * 60 * 1000;
const CROSSING_ELAPSED_FIELDS = ['ELAPSED', 'ENTRYTIME'];
const CROSSING_TRANSPONDER_FIELDS = ['TXNUM', 'TX_NO', 'TRANSPONDR', 'TRANSPONDER'];
const CROSSING_PLATE_FIELDS = ['CARNUMBER', 'CAR', 'CAR_NO', 'CARNO'];
const CROSSING_LINE_FIELDS = ['LINE_NO', 'LINE', 'LINENO', 'LINE_NUM', 'LINE_NUMBER'];
const CROSSING_LOOP_FIELDS = ['LANE_NO', 'LANE', 'LANENO', 'LOOP', 'LOOP_NO', 'LOOPNO', 'LOOP_NUMBER'];
const CROSSING_GREEN_ELAPSED_FIELDS = ['GREENELAPS', 'GREEN_ELAP', 'STARTELAP', 'START_ELAP', 'STARTELPSD'];
const CROSSING_GREEN_FLAG_FIELDS = ['FLAG', 'SYNCMARK', 'STARTFIN'];
const AUXILIARY_DBF_EXTENSIONS = ['.AT1', '.AT2'];
const RAW_CROSSING_EXTENSIONS = ['.SRT', '.ERF'];

interface MrScatsSessionRecordBuildResult {
  records: EventTimeRecord[];
  timeRecordSources: TimeRecordSource[];
}

const createProgressTracker = (total: number, onProgress: MrScatsCatalogLoadOptions['onProgress']): MrScatsLoadProgressTracker => {
  let completed = 0;
  const fixedTotal = Math.max(1, total);

  const emit = async (currentFile: string | undefined, callerName: string): Promise<void> => {
    await onProgress?.({
      callerName,
      completed,
      currentFile,
      currentTask: currentFile ? `Processing ${currentFile}` : 'Processing MR-SCATS import',
      total: fixedTotal,
    });
  };

  void emit(undefined, 'createProgressTracker');

  return {
    completeFileScan: async (fileName, callerName) => {
      completed += 1;
      await emit(fileName, callerName);
    },
    completeRow: async (fileName, callerName) => {
      completed += 1;
      await emit(fileName, callerName);
    },
  };
};

const asString = (value: unknown): string => value === undefined || value === null ? '' : String(value).trim();

const normalizeBaseName = (fileName: string): string => path.basename(fileName, path.extname(fileName)).toUpperCase();

const createMrScatsSessionSourceId = (meetingCode: string, session: MrScatsImportedSession): ReturnType<typeof createTimeRecordSourceId> => {
  return createTimeRecordSourceId(`mr-scats:${meetingCode}:source:${session.eventCode}`);
};

const createMrScatsFileSourceId = (meetingCode: string, session: MrScatsImportedSession, fileName: string): ReturnType<typeof createTimeRecordSourceId> => {
  return createTimeRecordSourceId(`mr-scats:${meetingCode}:source:${session.eventCode}:${path.basename(fileName)}`);
};

const createMrScatsFileSource = (meetingCode: string, session: MrScatsImportedSession, fileName: string): TimeRecordSource => {
  const baseName = path.basename(fileName);
  return {
    description: `Imported MR-SCATS timing records from ${baseName}.`,
    filePath: fileName,
    id: createMrScatsFileSourceId(meetingCode, session, fileName),
    name: baseName,
  };
};

const addTimeRecordSource = (sourcesById: Map<string, TimeRecordSource>, source: TimeRecordSource): void => {
  sourcesById.set(source.id.toString(), source);
};

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

const readCoreTableSource = (
  buffers: Map<string, Buffer>,
  baseNames: string[],
  label: string
): CoreTableSource => {
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

const readPlannedCoreTableSource = async (
  buffers: Map<string, Buffer>,
  plannedSource: CoreTableSource,
  progress: MrScatsLoadProgressTracker
): Promise<CoreTableSource> => {
  await progress.completeFileScan(plannedSource.fileName, 'readPlannedCoreTableSource');
  return {
    fileName: plannedSource.fileName,
    records: (await readMrScatsDbfTableAsync(buffers.get(plannedSource.fileName)!, {
      onRecordRead: () => progress.completeRow(plannedSource.fileName, 'readPlannedCoreTableSource'),
    })).records,
  };
};

const readCoreTables = async (locationPath: string, options: MrScatsCatalogLoadOptions = {}): Promise<MrScatsCoreTables> => {
  const locationStat = await stat(locationPath);
  const buffers = locationStat.isDirectory()
    ? await readCoreTableBuffersFromDirectory(locationPath)
    : path.extname(locationPath).toLowerCase() === '.zip'
      ? await readCoreTableBuffersFromZip(locationPath)
      : (() => {
        throw new Error('MR-SCATS event loading currently supports directories and ZIP archives.');
      })();
  const loadPlan = createLoadPlan(buffers, locationPath, options.extraSteps || 0);
  const progress = createProgressTracker(loadPlan.total, options.onProgress);
  const programme = await readPlannedCoreTableSource(buffers, loadPlan.programme, progress);
  const drivers = await readPlannedCoreTableSource(buffers, loadPlan.drivers, progress);

  return {
    buffers,
    drivers: drivers.records,
    loadPlan,
    programme: programme.records,
    progress,
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
  const normalizedTime = /^\d{1,2}:\d{2}$/.test(time)
    ? `${time.padStart(5, '0')}:00`
    : /^\d{1,2}:\d{2}:\d{2}$/.test(time)
      ? time.padStart(8, '0')
      : '00:00:00';
  const zonedDate = new TZDate(`${date}T${normalizedTime}`, DEFAULT_TIME_ZONE);
  return Number.isNaN(zonedDate.getTime()) ? undefined : new Date(zonedDate.getTime()).toISOString();
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

const getFirstNumberMatch = (record: MrScatsDbfRecord, fields: string[]): { fieldName: string; value: number } | undefined => {
  for (const field of fields) {
    const parsed = parseNumber(record[field]);
    if (parsed !== undefined) {
      return {
        fieldName: field,
        value: parsed,
      };
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

const getDriverCategoryName = (driver: MrScatsDbfRecord): string => getCategoryName(asString(driver.DRIV_CODE) || driver.DRIV_CLASS);

const buildCategories = (meetingCode: string, programme: MrScatsDbfRecord[], drivers: MrScatsDbfRecord[]): EventCategory[] => {
  const categoryNames = [
    ...programme.map((row) => getCategoryName(row.CATEGORY)),
    ...drivers.map(getDriverCategoryName),
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
      const sessionStartText = [row.ACTUALSTRT, row.GRIDTIME, row.STARTTIME].map(asString).find((value) => value.length > 0);
      const scheduledStart = parseDateTime(row.STARTDATE, sessionStartText) ||
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

const findSessionDbfCrossingFileNames = (buffers: Map<string, Buffer>, session: MrScatsImportedSession): string[] => {
  const eventCode = session.eventCode.toUpperCase();
  return Array.from(buffers.keys())
    .filter((fileName) => normalizeBaseName(fileName) === eventCode)
    .filter((fileName) => path.extname(fileName).toUpperCase() === '.DBF');
};

const findSessionAuxiliaryDbfFileNames = (buffers: Map<string, Buffer>, session: MrScatsImportedSession): string[] => {
  const eventCode = session.eventCode.toUpperCase();
  return Array.from(buffers.keys())
    .filter((fileName) => normalizeBaseName(fileName) === eventCode)
    .filter((fileName) => AUXILIARY_DBF_EXTENSIONS.includes(path.extname(fileName).toUpperCase()));
};

const findSessionNoCrossingFileNames = (buffers: Map<string, Buffer>, session: MrScatsImportedSession): string[] => {
  const eventCode = session.eventCode.toUpperCase();
  return Array.from(buffers.keys())
    .filter((fileName) => normalizeBaseName(fileName) === eventCode)
    .filter((fileName) => /^\.NO\d+$/i.test(path.extname(fileName)));
};

const splitRawRecordsByStartRecords = (records: CtcRawCrossingRecord[]): CtcRawCrossingRecord[][] => {
  const segments: CtcRawCrossingRecord[][] = [];
  let currentSegment: CtcRawCrossingRecord[] = [];
  let seenStartRecord = false;

  records.forEach((record) => {
    const isStartRecord = record.specialType === 'start-of-race';
    if (isStartRecord && seenStartRecord && currentSegment.length > 0) {
      segments.push(currentSegment);
      currentSegment = [record];
      return;
    }

    if (isStartRecord) {
      seenStartRecord = true;
    }
    currentSegment.push(record);
  });

  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  return segments;
};

const parseSessionNumberFromEventCode = (eventCode: string): number | undefined => {
  const match = /^[A-Z]\d{4}[A-Z](\d{2})$/i.exec(eventCode.trim());
  return match ? Number(match[1]) : undefined;
};

const replaceSessionNumberInEventCode = (eventCode: string, sessionNumber: number): string => {
  return eventCode.replace(/(\d{2})$/u, String(sessionNumber).padStart(2, '0'));
};

const findSessionRawCrossingFiles = (buffers: Map<string, Buffer>, session: MrScatsImportedSession): MrScatsRawFilePlan[] => {
  const targetEventCode = session.eventCode.toUpperCase();
  const targetSessionNumber = parseSessionNumberFromEventCode(targetEventCode);
  const rawFiles: MrScatsRawFilePlan[] = [];

  RAW_CROSSING_EXTENSIONS.forEach((extension) => {
    const directMatch = Array.from(buffers.keys()).find((fileName) =>
      normalizeBaseName(fileName) === targetEventCode &&
      path.extname(fileName).toUpperCase() === extension
    );
    const sessionNumbersToTry = targetSessionNumber === undefined
      ? [undefined]
      : Array.from({ length: targetSessionNumber }, (_value, index) => targetSessionNumber - index);

    for (const candidateSessionNumber of sessionNumbersToTry) {
      const candidateEventCode = candidateSessionNumber === undefined
        ? targetEventCode
        : replaceSessionNumberInEventCode(targetEventCode, candidateSessionNumber);
      const fileName = candidateSessionNumber === targetSessionNumber && directMatch
        ? directMatch
        : Array.from(buffers.keys()).find((candidateFileName) =>
          normalizeBaseName(candidateFileName) === candidateEventCode &&
          path.extname(candidateFileName).toUpperCase() === extension
        );
      if (!fileName) {
        continue;
      }

      const segmentIndex = targetSessionNumber === undefined || candidateSessionNumber === undefined
        ? 0
        : targetSessionNumber - candidateSessionNumber;
      const allRecords = parseCtcRawCrossingFile(buffers.get(fileName)!);
      const segments = splitRawRecordsByStartRecords(allRecords);
      const records = segments[segmentIndex] || [];
      if (records.length > 0) {
        rawFiles.push({
          fileName,
          lines: records.map((record) => record.raw),
          records,
          segmentIndex,
        });
      }
      break;
    }
  });

  return rawFiles;
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
  findSessionDbfCrossingFileNames(buffers, session).forEach((fileName) => {
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

const createLoadPlan = (buffers: Map<string, Buffer>, locationPath: string, extraSteps: number): MrScatsLoadPlan => {
  const programme = readCoreTableSource(buffers, PROGRAMME_BASE_NAMES, 'programme');
  const drivers = readCoreTableSource(buffers, DRIVER_BASE_NAMES, 'driver');
  const meetingCode = getMeetingCode(programme.records, locationPath);
  const categories = buildCategories(meetingCode, programme.records, drivers.records);
  const categoryIdByName = new Map(categories.map((category) => [category.name, category.id]));
  const participants = buildParticipants(meetingCode, drivers.records, categoryIdByName);
  const sessions = inferSessionCategoryIds(buffers, buildSessions(meetingCode, programme.records, categoryIdByName), participants);
  const sessionPlansById = new Map<string, MrScatsSessionLoadPlan>();
  let sessionFileCount = 0;
  let sessionRowCount = 0;

  for (const session of sessions) {
    const auxiliaryDbfFileNames = findSessionAuxiliaryDbfFileNames(buffers, session);
    const dbfFileNames = findSessionDbfCrossingFileNames(buffers, session);
    const noFileNames = findSessionNoCrossingFileNames(buffers, session);
    const rawFiles = findSessionRawCrossingFiles(buffers, session);

    sessionFileCount += auxiliaryDbfFileNames.length + dbfFileNames.length + noFileNames.length + rawFiles.length;
    for (const fileName of [...dbfFileNames, ...noFileNames, ...auxiliaryDbfFileNames]) {
      const summary = parseMrScatsDbfSummary(buffers.get(fileName)!);
      sessionRowCount += summary?.recordCount || 0;
    }
    for (const rawFile of rawFiles) {
      sessionRowCount += rawFile.lines.length;
    }

    sessionPlansById.set(session.id.toString(), {
      auxiliaryDbfFileNames,
      dbfFileNames,
      noFileNames,
      rawFiles,
    });
  }

  const coreFileCount = 2;
  const coreRowCount = programme.records.length + drivers.records.length;

  return {
    coreFileCount,
    coreRowCount,
    drivers,
    programme,
    sessionFileCount,
    sessionPlansById,
    sessionRowCount,
    total: Math.max(1, coreFileCount + coreRowCount + sessionFileCount + sessionRowCount + extraSteps),
  };
};

const getElapsedMilliseconds = (record: MrScatsDbfRecord, fields: string[] = CROSSING_ELAPSED_FIELDS): number | undefined => {
  const elapsedTicks = getFirstNumberMatch(record, fields)?.value;
  if (elapsedTicks === undefined) {
    return undefined;
  }

  return (elapsedTicks / CROSSING_ELAPSED_TICKS_PER_SECOND) * 1000;
};

const getRawElapsedMilliseconds = (record: CtcRawCrossingRecord): number => {
  return (record.rawTimeTicks / CROSSING_ELAPSED_TICKS_PER_SECOND) * 1000;
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

const getTimeZoneDate = (date: Date): string => {
  const zonedDate = TZDate.tz(DEFAULT_TIME_ZONE, date);
  return `${zonedDate.getFullYear()}-${String(zonedDate.getMonth() + 1).padStart(2, '0')}-${String(zonedDate.getDate()).padStart(2, '0')}`;
};

const getTimeZoneMillisecondsSinceMidnight = (date: Date): number => {
  const zonedDate = TZDate.tz(DEFAULT_TIME_ZONE, date);
  return (((zonedDate.getHours() * 60) + zonedDate.getMinutes()) * 60 + zonedDate.getSeconds()) * 1000 + zonedDate.getMilliseconds();
};

const createTimeZoneDateTime = (dateText: string, millisecondsSinceMidnight: number): Date => {
  const totalMilliseconds = Math.round(millisecondsSinceMidnight);
  const hours = Math.floor(totalMilliseconds / (60 * 60 * 1000));
  const minutes = Math.floor((totalMilliseconds % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((totalMilliseconds % (60 * 1000)) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return new TZDate(
    `${dateText}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`,
    DEFAULT_TIME_ZONE
  );
};

const createTimeOfDayDateNearSession = (scheduledStartTime: Date, millisecondsSinceMidnight: number): Date => {
  const scheduledDate = getTimeZoneDate(scheduledStartTime);
  let candidate = createTimeZoneDateTime(scheduledDate, millisecondsSinceMidnight);
  while (candidate.getTime() < scheduledStartTime.getTime() - (12 * 60 * 60 * 1000)) {
    candidate = new Date(candidate.getTime() + CROSSING_MILLISECONDS_PER_DAY);
  }
  while (candidate.getTime() > scheduledStartTime.getTime() + (12 * 60 * 60 * 1000)) {
    candidate = new Date(candidate.getTime() - CROSSING_MILLISECONDS_PER_DAY);
  }
  return candidate;
};

const shouldTreatElapsedTicksAsTimeOfDay = (
  scheduledStartTime: Date,
  elapsedTicks: number
): boolean => {
  if (elapsedTicks < 0 || elapsedTicks >= CROSSING_MILLISECONDS_PER_DAY * CROSSING_ELAPSED_TICKS_PER_SECOND / 1000) {
    return false;
  }

  const millisecondsSinceMidnight = (elapsedTicks / CROSSING_ELAPSED_TICKS_PER_SECOND) * 1000;
  const scheduledMilliseconds = getTimeZoneMillisecondsSinceMidnight(scheduledStartTime);
  const directDifference = Math.abs(millisecondsSinceMidnight - scheduledMilliseconds);
  const wrappedDifference = CROSSING_MILLISECONDS_PER_DAY - directDifference;
  return Math.min(directDifference, wrappedDifference) <= CROSSING_TIME_OF_DAY_PROXIMITY_MILLISECONDS;
};

const getCrossingTime = (
  record: MrScatsDbfRecord,
  scheduledStartTime: Date,
  sessionElapsedZeroTime: Date
): { elapsedMilliseconds: number; time: Date } | undefined => {
  const elapsedClockMatch = getFirstNumberMatch(record, ['ELAPSED']);
  if (elapsedClockMatch && shouldTreatElapsedTicksAsTimeOfDay(scheduledStartTime, elapsedClockMatch.value)) {
    const elapsedMilliseconds = (elapsedClockMatch.value / CROSSING_ELAPSED_TICKS_PER_SECOND) * 1000;
    return {
      elapsedMilliseconds,
      time: createTimeOfDayDateNearSession(scheduledStartTime, elapsedMilliseconds),
    };
  }

  const elapsedMatch = getFirstNumberMatch(record, CROSSING_ELAPSED_FIELDS);
  if (!elapsedMatch) {
    return undefined;
  }

  const elapsedMilliseconds = (elapsedMatch.value / CROSSING_ELAPSED_TICKS_PER_SECOND) * 1000;
  return {
    elapsedMilliseconds,
    time: new Date(sessionElapsedZeroTime.getTime() + elapsedMilliseconds),
  };
};

const getNoFileLineNumber = (fileName: string): number | undefined => {
  const match = /^\.NO(\d+)$/i.exec(path.extname(fileName));
  if (!match) {
    return undefined;
  }

  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const getCrossingAntenna = (record: MrScatsDbfRecord, fileName: string): string | undefined => {
  const lineNumber = getFirstPositiveInteger(record, CROSSING_LINE_FIELDS) || getNoFileLineNumber(fileName);
  const loopNumber = getFirstPositiveInteger(record, CROSSING_LOOP_FIELDS);
  if (lineNumber === undefined) {
    return undefined;
  }

  return `Line ${lineNumber}${loopNumber !== undefined ? ` Loop ${loopNumber}` : ''}`;
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

const parseRawTimeOfDay = (timeText: string | undefined, fallbackTime: Date): Date => {
  const explicitTimeMatch = timeText ? /^(\d{2}):(\d{2}):(\d{2})\.(\d{4})$/.exec(timeText) : undefined;
  const explicitTimeOfDayMilliseconds = explicitTimeMatch
    ? ((((Number(explicitTimeMatch[1]) * 60) + Number(explicitTimeMatch[2])) * 60) + Number(explicitTimeMatch[3])) * 1000 +
      Math.floor(Number(explicitTimeMatch[4]) / 10)
    : undefined;

  return explicitTimeOfDayMilliseconds === undefined
    ? fallbackTime
    : createTimeOfDayDateNearSession(fallbackTime, explicitTimeOfDayMilliseconds);
};

const createSessionGreenResumeFlag = (
  meetingCode: string,
  session: MrScatsImportedSession,
  source: ReturnType<typeof createTimeRecordSourceId>,
  fileName: string,
  record: CtcRawCrossingRecord,
  sequence: number
): GreenFlagRecord => ({
  categoryIds: session.categoryIds,
  dataLine: record.raw,
  eventId: createEventId(`mr-scats:${meetingCode}:event`),
  flagType: 'green',
  flagValue: 'course',
  id: createTimeRecordId(`mr-scats:${meetingCode}:session:${session.eventCode}:${path.basename(fileName)}:raw-flag:${record.recordNumber}:${record.drtCode}`),
  indicatesRaceStart: false,
  recordType: EVENT_FLAG_DISPLAYED,
  sequence,
  sessionId: session.id,
  source,
  systemGenerated: true,
  time: parseRawTimeOfDay(record.timeText, new Date(session.scheduledStart)),
});

const createSessionYellowFlag = (
  meetingCode: string,
  session: MrScatsImportedSession,
  source: ReturnType<typeof createTimeRecordSourceId>,
  fileName: string,
  record: CtcRawCrossingRecord,
  sequence: number
): YellowFlagRecord => ({
  categoryIds: session.categoryIds,
  dataLine: record.raw,
  eventId: createEventId(`mr-scats:${meetingCode}:event`),
  flagType: 'yellow',
  flagValue: 'caution',
  id: createTimeRecordId(`mr-scats:${meetingCode}:session:${session.eventCode}:${path.basename(fileName)}:raw-flag:${record.recordNumber}:${record.drtCode}`),
  recordType: EVENT_FLAG_DISPLAYED,
  sequence,
  sessionId: session.id,
  source,
  systemGenerated: true,
  time: parseRawTimeOfDay(record.timeText, new Date(session.scheduledStart)),
});

const createCrossingRecord = (
  meetingCode: string,
  session: MrScatsImportedSession,
  source: ReturnType<typeof createTimeRecordSourceId>,
  fileName: string,
  record: MrScatsDbfRecord,
  rowIndex: number,
  scheduledStartTime: Date,
  sessionElapsedZeroTime: Date,
  sequence: number,
  participantsByPlate: Map<string, EventParticipant>,
  options: { isLapCompletion?: boolean } = {}
): EventTimeRecord | undefined => {
  const crossingTime = getCrossingTime(record, scheduledStartTime, sessionElapsedZeroTime);
  if (!crossingTime) {
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

  const stableRecordKey = [
    'mr-scats',
    meetingCode,
    session.eventCode,
    path.basename(fileName),
    asString(record.COUNTER) || `${rowIndex + 1}`,
    transponder === undefined ? '' : transponder.toString(),
    plateNumber,
    crossingTime.elapsedMilliseconds.toString(),
  ].join(':');
  const baseRecord: ParticipantPassingRecord & { antenna?: string } = {
    antenna: getCrossingAntenna(record, fileName),
    dataLine: JSON.stringify(record),
    elapsedTime: null,
    eventId: createEventId(`mr-scats:${meetingCode}:event`),
    id: createTimeRecordId(stableRecordKey),
    isLapCompletion: options.isLapCompletion,
    originRecordNumber: rowIndex + 1,
    recordType: RECORD_TX_CROSSING,
    sequence,
    sessionId: session.id,
    source,
    time: crossingTime.time,
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

const createRawCrossingRecord = (
  meetingCode: string,
  session: MrScatsImportedSession,
  source: ReturnType<typeof createTimeRecordSourceId>,
  fileName: string,
  record: CtcRawCrossingRecord,
  sessionElapsedZeroTime: Date,
  sequence: number,
  participantsByPlate: Map<string, EventParticipant>
): EventTimeRecord | undefined => {
  const transponder = record.transmitter !== undefined && record.transmitter > 0 ? record.transmitter : undefined;
  if (transponder === undefined) {
    return undefined;
  }

  const plateNumber = transponder.toString();
  const transponderLooksLikePlateNumber =
    hasParticipantPlate(participantsByPlate, plateNumber) &&
    !hasParticipantTransponderForPlate(participantsByPlate, plateNumber, transponder);
  const elapsedMilliseconds = getRawElapsedMilliseconds(record);
  const time = record.timeText === undefined
    ? new Date(sessionElapsedZeroTime.getTime() + elapsedMilliseconds)
    : parseRawTimeOfDay(record.timeText, new Date(session.scheduledStart));
  const stableRecordKey = [
    'mr-scats',
    meetingCode,
    session.eventCode,
    path.basename(fileName),
    record.recordNumber.toString(),
    record.drtCode,
    transponder.toString(),
    record.rawTimeTicks.toString(),
  ].join(':');
  const baseRecord: ParticipantPassingRecord & {
    antenna?: string;
    confidence?: string;
    drtCode?: string;
    rawStatus?: string;
  } = {
    antenna: record.lineNumber !== undefined
      ? `Line ${record.lineNumber}${record.laneNumber !== undefined ? ` Loop ${record.laneNumber}` : ''}`
      : undefined,
    confidence: record.confidence,
    dataLine: record.raw,
    drtCode: record.drtCode,
    elapsedTime: null,
    eventId: createEventId(`mr-scats:${meetingCode}:event`),
    id: createTimeRecordId(stableRecordKey),
    lineNumber: record.lineNumber,
    loopNumber: record.laneNumber,
    originRecordNumber: record.recordNumber,
    rawStatus: record.status,
    recordType: RECORD_TX_CROSSING,
    sequence,
    sessionId: session.id,
    source,
    time,
  };

  if (transponderLooksLikePlateNumber) {
    return {
      ...baseRecord,
      plateNumber,
    } as ParticipantPassingRecord & { plateNumber: string };
  }

  return {
    ...baseRecord,
    chipCode: transponder,
  } as ParticipantPassingRecord & { chipCode: number };
};

const buildSessionRecords = async (
  meetingCode: string,
  buffers: Map<string, Buffer>,
  sessions: MrScatsImportedSession[],
  participants: EventParticipant[],
  loadPlan: MrScatsLoadPlan,
  progress?: MrScatsLoadProgressTracker
): Promise<MrScatsSessionRecordBuildResult> => {
  const participantsByPlate = buildParticipantsByPlate(participants);
  const sessionRecords: EventTimeRecord[] = [];
  const timeRecordSourcesById = new Map<string, TimeRecordSource>();

  for (const session of sessions) {
    const sessionSource = createMrScatsSessionSourceId(meetingCode, session);
    const sessionPlan = loadPlan.sessionPlansById.get(session.id.toString()) || {
      auxiliaryDbfFileNames: [],
      dbfFileNames: [],
      noFileNames: [],
      rawFiles: [],
    };
    const parsedRawFiles = sessionPlan.rawFiles;
    const rawStartRecord = parsedRawFiles
      .flatMap((rawFile) => rawFile.records)
      .find((record) => record.specialType === 'start-of-race' && record.timeText !== undefined);
    const scheduledStartTime = rawStartRecord?.timeText
      ? parseRawTimeOfDay(rawStartRecord.timeText, new Date(session.scheduledStart))
      : new Date(session.scheduledStart);
    const sessionFileTables: Array<CoreTableSource & { isLapCompletion: boolean }> = [];
    for (const fileName of [...sessionPlan.dbfFileNames, ...sessionPlan.noFileNames, ...sessionPlan.auxiliaryDbfFileNames]) {
      let completedFileScan = false;
      try {
        await progress?.completeFileScan(fileName, 'buildSessionRecords[scan]');
        completedFileScan = true;
        sessionFileTables.push({
          fileName,
          isLapCompletion: !(sessionPlan.noFileNames.includes(fileName) || sessionPlan.auxiliaryDbfFileNames.includes(fileName)),
          records: (await readMrScatsDbfTableAsync(buffers.get(fileName)!, {
            onRecordRead: (rowNumber: number) => progress?.completeRow(fileName, `buildSessionRecords[onRecordRead:${rowNumber}]`),
          })).records,
        });
      } catch (_error) {
        if (!completedFileScan) {
          await progress?.completeFileScan(fileName, 'buildSessionRecords[error]');
        }
      }
    }
    const crossingRows = sessionFileTables
      .filter((table) => table.isLapCompletion)
      .flatMap((table) => table.records);
    const greenElapsedMilliseconds = getGreenElapsedMilliseconds(crossingRows);
    const sessionElapsedZeroTime = new Date(scheduledStartTime.getTime() - greenElapsedMilliseconds);
    const dbfCrossingRecords = sessionFileTables.flatMap((table) => table.records
      .map((record, rowIndex) => {
        const source = createMrScatsFileSource(meetingCode, session, table.fileName);
        addTimeRecordSource(timeRecordSourcesById, source);
        return createCrossingRecord(
          meetingCode,
          session,
          source.id,
          table.fileName,
          record,
          rowIndex,
          scheduledStartTime,
          sessionElapsedZeroTime,
          rowIndex + 2,
          participantsByPlate,
          { isLapCompletion: table.isLapCompletion }
        );
      })
      .filter((record): record is EventTimeRecord => record !== undefined));
    const rawCrossingRecords: EventTimeRecord[] = [];
    const rawFlagRecords: EventTimeRecord[] = [];
    for (const [fileIndex, rawFile] of parsedRawFiles.entries()) {
      const fileName = rawFile.fileName;
      const rawLines = rawFile.lines;
      await progress?.completeFileScan(fileName, 'buildSessionRecords');
      for (const _line of rawLines) {
        await progress?.completeRow(fileName, 'buildSessionRecords');
      }
      const rawRecords = rawFile.records;
      const baseSequence = sessionFileTables.reduce((total, table) => total + table.records.length, 0) + (fileIndex * 100000) + 2;
      const rawSource = createMrScatsFileSource(meetingCode, session, fileName);
      addTimeRecordSource(timeRecordSourcesById, rawSource);

      rawFlagRecords.push(...rawRecords.flatMap((record, rowIndex): EventTimeRecord[] => {
        if (record.specialType === 'yellow-flag') {
          return [createSessionYellowFlag(meetingCode, session, rawSource.id, fileName, record, baseSequence + rowIndex)];
        }
        if (record.specialType === 'yellow-end') {
          return [createSessionGreenResumeFlag(meetingCode, session, rawSource.id, fileName, record, baseSequence + rowIndex)];
        }
        return [];
      }));

      rawCrossingRecords.push(...rawRecords
        .map((record, rowIndex) => createRawCrossingRecord(
          meetingCode,
          session,
          rawSource.id,
          fileName,
          record,
          sessionElapsedZeroTime,
          baseSequence + rowIndex,
          participantsByPlate
        ))
        .filter((record): record is EventTimeRecord => record !== undefined));
    }
    const crossingRecords = [...dbfCrossingRecords, ...rawFlagRecords, ...rawCrossingRecords]
      .sort((left, right) => (left.time?.getTime() || 0) - (right.time?.getTime() || 0))
      .map((record, index): EventTimeRecord => ({
        ...record,
        sequence: index + 2,
      }));

    if (crossingRecords.length === 0) {
      continue;
    }

    sessionRecords.push(
      createSessionGreenFlag(meetingCode, session, sessionSource, scheduledStartTime, 1),
      ...crossingRecords,
    );
  }

  return {
    records: sessionRecords,
    timeRecordSources: Array.from(timeRecordSourcesById.values()),
  };
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

    const categoryName = getDriverCategoryName(driver);
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

export const loadMrScatsCatalogFromLocation = async (
  locationPath: string,
  options: MrScatsCatalogLoadOptions = {}
): Promise<MrScatsCatalogImport> => {
  const { buffers, drivers, loadPlan, programme, progress } = await readCoreTables(locationPath, options);
  const meetingCode = getMeetingCode(programme, locationPath);
  const categories = buildCategories(meetingCode, programme, drivers);
  const categoryIdByName = new Map(categories.map((category) => [category.name, category.id]));
  const participants = buildParticipants(meetingCode, drivers, categoryIdByName);
  const sessions = inferSessionCategoryIds(buffers, buildSessions(meetingCode, programme, categoryIdByName), participants);
  const sessionRecordBuildResult = await buildSessionRecords(meetingCode, buffers, sessions, participants, loadPlan, progress);
  const eventDate = getEventDate(programme);

  return {
    eventDate,
    eventId: createEventId(`mr-scats:${meetingCode}:event`),
    eventName: getEventName(programme, meetingCode),
    raceState: {
      categories,
      participants,
      records: sessionRecordBuildResult.records,
      teams: [],
      timeRecordSources: sessionRecordBuildResult.timeRecordSources,
    },
    sessions,
  };
};

export const MR_SCATS_DEFAULT_TIME_ZONE = DEFAULT_TIME_ZONE;
