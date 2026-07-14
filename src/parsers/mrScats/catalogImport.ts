import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { TZDate } from '@date-fns/tz';
import { generateResult, type EntrantResult } from '../../controllers/result.js';
import type { EventEntrantId } from '../../model/entrant.js';
import type { EventCategory } from '../../model/eventcategory.js';
import type { EventParticipant } from '../../model/eventparticipant.js';
import type { GreenFlagRecord, YellowFlagRecord } from '../../model/flag.js';
import { createCategoryId, createEventEntrantId, createEventId, createEventParticipantId, createSessionId, createTimeRecordId, createTimeRecordSourceId } from '../../model/ids.js';
import type { EventId, SessionId } from '../../model/raceevent.js';
import { Session, type RaceState } from '../../model/racestate.js';
import { EVENT_FLAG_DISPLAYED, RECORD_TX_CROSSING, type EntrantPassingRecord, type EventTimeRecord, type ParticipantPassingRecord, type TimeRecordSource } from '../../model/timerecord.js';
import { parseCtcRawCrossingFile, type CtcRawCrossingRecord } from '../ctc/rawCrossing.js';
import { readMrScatsDbfTable, readMrScatsDbfTableAsync, type MrScatsDbfRecord } from './dbf.js';
import { parseMrScatsDbfSummary, readMrScatsZipEntryBuffers } from './fileInventory.js';

export interface MrScatsImportedSession {
  categoryIds: string[];
  eventCode: string;
  eventType?: string;
  id: SessionId;
  minimumLapTimeMilliseconds: number;
  name: string;
  scheduledStart: string;
}

export interface MrScatsCatalogImport {
  eventDate: string;
  eventId: EventId;
  eventName: string;
  raceState: Partial<RaceState>;
  sessions: MrScatsImportedSession[];
  validationMessages?: string[];
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

interface SessionFileTable extends CoreTableSource {
  ignoredLineOneDbfFileName?: string;
  isLapCompletion: boolean;
  timeOffsetMilliseconds?: number;
}

interface SupplementalDriverSource {
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
  ignoreLineOneNo1CrossingsWhenDbfPresent?: boolean;
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

const DEFAULT_TIME_ZONE = 'Australia/Melbourne';
const FALLBACK_EVENT_DATE = '1970-01-01';
const PROGRAMME_BASE_NAMES = ['PRGMME', 'PROG', 'PRG', 'PROGRAM', 'PROGRAMME', 'PRG1'];
const DRIVER_BASE_NAMES = ['DRIVERS', 'DRIVER', 'DRIVE'];
const CORE_TABLE_READABLE_EXTENSIONS = ['.DBF', '.DAT'];
const CORE_TABLE_RELATED_EXTENSIONS = ['.DBF', '.DAT', '.TXT'];
const DRIVER_NAME_FIELDS = ['DRIVER', 'DRIVER_2', 'DRIVER_3', 'DRIVER_4'];
const DRIVER_METADATA_FIELDS = ['DRIV_CLASS', 'DRIV_CODE', 'ENTRANT', 'SCRN_NAME'];
const TRANSPONDER_FIELDS = ['TXNUM', 'TXNUM2', 'TXNUM3', 'TXNUM4', 'TXNUM5', 'TXNUM6', 'TXNUM7', 'TXNUM8'];
const CROSSING_ELAPSED_TICKS_PER_SECOND = 10000;
const CROSSING_MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const CROSSING_TIME_OF_DAY_PROXIMITY_MILLISECONDS = 6 * 60 * 60 * 1000;
const MINIMUM_TIME_OF_DAY_MILLISECONDS = 60 * 60 * 1000;
const GREEN_TIME_OF_DAY_THRESHOLD_MILLISECONDS = 12 * 60 * 60 * 1000;
const MR_SCATS_DEFAULT_MINIMUM_LAP_TIME_MILLISECONDS = 25_000;
const CROSSING_ELAPSED_FIELDS = ['ELAPSED', 'ENTRYTIME'];
const CROSSING_TRANSPONDER_FIELDS = ['TXNUM', 'TX_NO', 'TRANSPONDR', 'TRANSPONDER'];
const CROSSING_PLATE_FIELDS = ['CARNUMBER', 'CAR', 'CAR_NO', 'CARNO'];
const CROSSING_LINE_FIELDS = ['LINE_NO', 'LINE', 'LINENO', 'LINE_NUM', 'LINE_NUMBER'];
const CROSSING_LOOP_FIELDS = ['LANE_NO', 'LANE', 'LANENO', 'LOOP', 'LOOP_NO', 'LOOPNO', 'LOOP_NUMBER'];
const CROSSING_CONFIDENCE_FIELDS = ['CONFIDENCE', 'CONF_FACTOR', 'CONFID_FACT', 'CF', 'CONF'];
const CROSSING_HIT_COUNT_FIELDS = ['HITCOUNT', 'HIT_COUNT', 'HITS', 'READCOUNT', 'READ_COUNT', 'READS'];
const CROSSING_GREEN_ELAPSED_FIELDS = ['GREENELAPS', 'GREEN_ELAP', 'STARTELAP', 'START_ELAP', 'STARTELPSD'];
const CROSSING_GREEN_FLAG_FIELDS = ['FLAG', 'SYNCMARK', 'STARTFIN'];
const RAW_CROSSING_EXTENSIONS = ['.SRT', '.ERF'];
const COMPANION_IDENTITY_FIELDS = ['CARNUMBER', 'CAR', 'CAR_NO', 'CARNO', 'NUMBER', 'NO'];
const COMPANION_DRIVER_FIELDS = ['DRIVER', 'NAME', 'SCRN_NAME', 'ENTRANT'];
const COMPANION_ELAPSED_FIELDS = ['ELAPSED', 'TIME', 'TOTALTIME', 'TOTAL_TIME', 'RESULTTIME', 'RACETIME'];
const COMPANION_FASTEST_LAP_FIELDS = ['LAPTIME', 'LAP_TIME', 'FASTTIME', 'FAST_TIME', 'FST_TIME', 'TIME', 'ELAPSED'];
const COMPANION_LAP_COUNT_FIELDS = ['LAPS', 'LAPCOUNT', 'LAP_COUNT', 'NO_LAPS', 'NUMLAPS'];
const COMPANION_LAP_NUMBER_FIELDS = ['LAP', 'LAPNO', 'LAP_NO', 'LAPNUM', 'LAP_NUMBER'];
const COMPANION_LAP_FROM_FIELDS = ['LAP_FROM', 'FROM_LAP', 'FROM'];
const COMPANION_LAP_TO_FIELDS = ['LAP_TO', 'TO_LAP', 'TO'];
const COMPANION_POSITION_FIELDS = ['POS', 'POSITION', 'PLACE', 'FIN_POS', 'RESULTPOS'];
const DURATION_COMPARE_TOLERANCE_MILLISECONDS = 1;

interface MrScatsSessionRecordBuildResult {
  records: EventTimeRecord[];
  timeRecordSources: TimeRecordSource[];
}

interface RawCrossingTimeAnchor {
  fileName: string;
  key: string;
  record: CtcRawCrossingRecord;
  time: Date;
}

interface DbfCrossingTimeAnchor {
  elapsedMilliseconds: number;
  record: MrScatsDbfRecord;
  sequence: number;
  transmitter: number;
}

interface SessionElapsedAlignment {
  greenFlagTime: Date;
  sessionElapsedZeroTime: Date;
}

interface SrtCrossingTimeAnchor {
  fileName: string;
  record: CtcRawCrossingRecord;
  sequence: number;
  time: Date;
  transmitter: number;
}

interface SrtRawRecordTimeAnchor {
  fileName: string;
  record: CtcRawCrossingRecord;
  sequence: number;
  time: Date;
}

interface TableCrossingTimeAnchor {
  key: string;
  sequence: number;
  time: Date;
  timeTenthOfMillisecond: number;
}

interface CrossingTime {
  elapsedMilliseconds: number;
  elapsedTicks: number;
  time: Date;
  timeTenthOfMillisecond: number;
}

interface CrossingTimeOfDayMatch {
  elapsedMilliseconds: number;
  elapsedTicks: number;
  timeTenthOfMillisecond: number;
}

interface NoFileTimeOffsetScore {
  distinctKeyCount: number;
  matchedCount: number;
  offsetMilliseconds: number;
  totalDeltaMilliseconds: number;
  totalSequenceDistance: number;
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

const hasDriverIdentityField = (record: MrScatsDbfRecord): boolean =>
  [...DRIVER_NAME_FIELDS, ...DRIVER_METADATA_FIELDS].some((field) => asString(record[field]).length > 0);

const hasDriverTransponderField = (record: MrScatsDbfRecord): boolean =>
  TRANSPONDER_FIELDS.some((field) => {
    const value = parseInteger(asString(record[field]));
    return value !== undefined && value > 0;
  });

const isSupplementalDriverRecord = (record: MrScatsDbfRecord): boolean =>
  asString(record.CARNUMBER).length > 0 && (hasDriverIdentityField(record) || hasDriverTransponderField(record));

const readSupplementalDriverSources = (
  buffers: Map<string, Buffer>,
  programmeRecords: MrScatsDbfRecord[],
  primaryDriverFileName: string
): SupplementalDriverSource[] => {
  const sessionEventCodes = new Set(
    programmeRecords
      .map((record) => asString(record.EV_CODE).toUpperCase())
      .filter((value) => value.length > 0)
  );

  return Array.from(buffers.entries()).flatMap(([fileName, buffer]): SupplementalDriverSource[] => {
    if (fileName === primaryDriverFileName) {
      return [];
    }

    if (!CORE_TABLE_READABLE_EXTENSIONS.includes(path.extname(fileName).toUpperCase())) {
      return [];
    }

    const upperBaseName = normalizeBaseName(fileName);
    if (PROGRAMME_BASE_NAMES.includes(upperBaseName) || DRIVER_BASE_NAMES.includes(upperBaseName) || sessionEventCodes.has(upperBaseName)) {
      return [];
    }

    try {
      const records = readMrScatsDbfTable(buffer).records.filter(isSupplementalDriverRecord);
      return records.length > 0 ? [{ fileName, records }] : [];
    } catch (_error) {
      return [];
    }
  });
};

const mergeDriverRecords = (
  primaryDrivers: MrScatsDbfRecord[],
  supplementalSources: SupplementalDriverSource[]
): MrScatsDbfRecord[] => {
  const driversByIdentity = new Map<string, MrScatsDbfRecord>();

  primaryDrivers.forEach((driver) => {
    const plateNumber = asString(driver.CARNUMBER);
    if (plateNumber.length > 0) {
      driversByIdentity.set(getDriverIdentityKey(driver), { ...driver });
    }
  });

  supplementalSources.forEach((source) => {
    source.records.forEach((driver) => {
      const plateNumber = asString(driver.CARNUMBER);
      if (plateNumber.length === 0) {
        return;
      }

      const existing = driversByIdentity.get(getDriverIdentityKey(driver));
      if (!existing) {
        driversByIdentity.set(getDriverIdentityKey(driver), { ...driver });
        return;
      }

      [...DRIVER_NAME_FIELDS, ...DRIVER_METADATA_FIELDS].forEach((field) => {
        if (asString(existing[field]).length === 0 && asString(driver[field]).length > 0) {
          existing[field] = driver[field];
        }
      });

      const existingTransponders = new Set(
        TRANSPONDER_FIELDS
          .map((field) => parseInteger(asString(existing[field])))
          .filter((value): value is number => value !== undefined && value > 0)
      );

      TRANSPONDER_FIELDS.forEach((field) => {
        const transponder = parseInteger(asString(driver[field]));
        if (transponder === undefined || transponder <= 0 || existingTransponders.has(transponder)) {
          return;
        }

        const targetField = TRANSPONDER_FIELDS.find((candidateField) => {
          const candidateValue = parseInteger(asString(existing[candidateField]));
          return candidateValue === undefined || candidateValue <= 0;
        });
        if (!targetField) {
          return;
        }

        existing[targetField] = transponder;
        existingTransponders.add(transponder);
      });
    });
  });

  return Array.from(driversByIdentity.values());
};

const getMergedDriverRecords = (
  buffers: Map<string, Buffer>,
  programmeRecords: MrScatsDbfRecord[],
  primaryDriverSource: CoreTableSource
): MrScatsDbfRecord[] => mergeDriverRecords(
  primaryDriverSource.records,
  readSupplementalDriverSources(buffers, programmeRecords, primaryDriverSource.fileName)
);

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

const parseDateParts = (dateText: string): { day: number; month: number; year: number } => ({
  day: Number(dateText.slice(8, 10)),
  month: Number(dateText.slice(5, 7)),
  year: Number(dateText.slice(0, 4)),
});

const createTimeZoneDateTime = (dateText: string, millisecondsSinceMidnight: number): Date => {
  const totalMilliseconds = Math.round(millisecondsSinceMidnight);
  const hours = Math.floor(totalMilliseconds / (60 * 60 * 1000));
  const minutes = Math.floor((totalMilliseconds % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((totalMilliseconds % (60 * 1000)) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  const { day, month, year } = parseDateParts(dateText);

  return new TZDate(
    year,
    month - 1,
    day,
    hours,
    minutes,
    seconds,
    milliseconds,
    DEFAULT_TIME_ZONE
  );
};

const parseDateTime = (dateValue: unknown, timeValue: unknown): string | undefined => {
  const date = parseDate(dateValue);
  if (!date) {
    return undefined;
  }

  const time = asString(timeValue);
  const timeMatch = /^(?<clock>\d{1,2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)(?<offset>Z|[+-]\d{2}:\d{2})?$/u.exec(time);
  const normalizedClock = !timeMatch
    ? '00:00:00'
    : /^\d{1,2}:\d{2}$/.test(timeMatch.groups!.clock)
      ? `${timeMatch.groups!.clock.padStart(5, '0')}:00`
      : timeMatch.groups!.clock.padStart(8, '0');
  const millisecondsNormalizedClock = normalizedClock.includes('.')
    ? normalizedClock.replace(/\.(\d{1,3})$/u, (_match: string, milliseconds: string) => `.${milliseconds.padEnd(3, '0')}`)
    : `${normalizedClock}.000`;

  if (timeMatch?.groups?.offset) {
    const offsetDate = new Date(`${date}T${millisecondsNormalizedClock}${timeMatch.groups.offset}`);
    return Number.isNaN(offsetDate.getTime()) ? undefined : offsetDate.toISOString();
  }

  const clockMatch = /^(?<hours>\d{2}):(?<minutes>\d{2}):(?<seconds>\d{2})\.(?<milliseconds>\d{3})$/u.exec(millisecondsNormalizedClock);
  if (!clockMatch?.groups) {
    return undefined;
  }

  const { day, month, year } = parseDateParts(date);
  const zonedDate = new TZDate(
    year,
    month - 1,
    day,
    Number(clockMatch.groups.hours),
    Number(clockMatch.groups.minutes),
    Number(clockMatch.groups.seconds),
    Number(clockMatch.groups.milliseconds),
    DEFAULT_TIME_ZONE
  );
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

const parseTimeOfDayMatch = (value: unknown): CrossingTimeOfDayMatch | undefined => {
  const raw = asString(value);
  const timeMatch = /^(?<hours>\d{1,2}):(?<minutes>\d{2}):(?<seconds>\d{2})(?:\.(?<fraction>\d{1,4}))?$/u.exec(raw);
  if (!timeMatch?.groups) {
    return undefined;
  }

  const hours = Number(timeMatch.groups.hours);
  const minutes = Number(timeMatch.groups.minutes);
  const seconds = Number(timeMatch.groups.seconds);
  if (hours > 23 || minutes > 59 || seconds > 59) {
    return undefined;
  }

  const fraction = (timeMatch.groups.fraction || '').padEnd(4, '0');
  const fractionTicks = Number(fraction);
  const elapsedTicks = ((((hours * 60) + minutes) * 60) + seconds) * CROSSING_ELAPSED_TICKS_PER_SECOND + fractionTicks;
  return {
    elapsedMilliseconds: elapsedTicksToMilliseconds(elapsedTicks),
    elapsedTicks,
    timeTenthOfMillisecond: getTimeTenthOfMillisecond(elapsedTicks),
  };
};

const getFirstTimeOfDayMatch = (record: MrScatsDbfRecord, fields: string[]): CrossingTimeOfDayMatch | undefined => {
  for (const field of fields) {
    const parsed = parseTimeOfDayMatch(record[field]);
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

const getFirstNonNegativeInteger = (record: MrScatsDbfRecord, fields: string[]): number | undefined => {
  const parsed = getFirstNumber(record, fields);
  if (parsed === undefined) {
    return undefined;
  }

  const integer = Math.trunc(parsed);
  return integer >= 0 ? integer : undefined;
};

const hasParticipantPlate = (participantsByPlate: Map<string, EventParticipant[]>, plateNumber: string): boolean =>
  (participantsByPlate.get(plateNumber)?.length || 0) > 0;

const buildParticipantsByPlate = (participants: EventParticipant[]): Map<string, EventParticipant[]> => {
  const participantsByPlate = new Map<string, EventParticipant[]>();
  participants.forEach((participant) => {
    participant.identifiers.forEach((identifier) => {
      const racePlate = (identifier as unknown as { racePlate?: unknown }).racePlate;
      if (racePlate !== undefined && racePlate !== null) {
        const normalizedPlate = racePlate.toString().trim();
        const existingParticipants = participantsByPlate.get(normalizedPlate) || [];
        existingParticipants.push(participant);
        participantsByPlate.set(normalizedPlate, existingParticipants);
      }
    });
  });
  return participantsByPlate;
};

const hasParticipantTransponderForPlate = (
  participantsByPlate: Map<string, EventParticipant[]>,
  plateNumber: string,
  transponder: number | undefined
): boolean => {
  if (transponder === undefined) {
    return false;
  }

  const participants = participantsByPlate.get(plateNumber);
  if (!participants || participants.length === 0) {
    return false;
  }

  return participants.some((participant) => participant.identifiers.some((identifier) => {
    const txNo = (identifier as unknown as { txNo?: unknown }).txNo;
    return txNo !== undefined && txNo !== null && txNo.toString() === transponder.toString();
  }));
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

const getRawCrossingAnchorKey = (record: {
  plateNumber?: string;
  transmitter?: number;
}): string | undefined => {
  if (record.transmitter !== undefined && record.transmitter > 0) {
    return `tx:${record.transmitter}`;
  }

  const normalizedPlateNumber = record.plateNumber?.trim();
  return normalizedPlateNumber ? `plate:${normalizedPlateNumber}` : undefined;
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

const getDriverIdentityKey = (driver: MrScatsDbfRecord): string => {
  return `${getDriverCategoryName(driver)}::${asString(driver.CARNUMBER)}`;
};

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
        minimumLapTimeMilliseconds: MR_SCATS_DEFAULT_MINIMUM_LAP_TIME_MILLISECONDS,
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

const findSessionNoCrossingFileNames = (buffers: Map<string, Buffer>, session: MrScatsImportedSession): string[] => {
  const eventCode = session.eventCode.toUpperCase();
  return Array.from(buffers.keys())
    .filter((fileName) => normalizeBaseName(fileName) === eventCode)
    .filter((fileName) => /^\.NO\d+$/i.test(path.extname(fileName)));
};

const hasSessionNo1CrossingFile = (fileNames: string[]): boolean =>
  fileNames.some((fileName) => path.extname(fileName).toUpperCase() === '.NO1');

const splitRawRecordsByStartRecords = (records: CtcRawCrossingRecord[]): CtcRawCrossingRecord[][] => {
  const segments: CtcRawCrossingRecord[][] = [];
  let currentSegment: CtcRawCrossingRecord[] = [];
  let seenStartRecord = false;

  records.forEach((record) => {
    const isStartRecord = record.specialType === 'start-of-race';
    if (isStartRecord && !seenStartRecord && currentSegment.length > 0) {
      segments.push(currentSegment);
      currentSegment = [record];
      seenStartRecord = true;
      return;
    }

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

const getRawSegmentStartTime = (segment: CtcRawCrossingRecord[], session: MrScatsImportedSession): Date | undefined => {
  const startRecord = segment.find((record) => record.specialType === 'start-of-race' && record.timeText !== undefined);
  return startRecord?.timeText ? parseRawTimeOfDay(startRecord.timeText, new Date(session.scheduledStart)) : undefined;
};

const selectSessionRawSegment = (
  records: CtcRawCrossingRecord[],
  session: MrScatsImportedSession,
  preferredSegmentIndex: number
): { records: CtcRawCrossingRecord[]; segmentIndex: number } => {
  const segments = splitRawRecordsByStartRecords(records);
  const scheduledStartTime = new Date(session.scheduledStart);
  const timedSegments = segments
    .map((segment, segmentIndex) => ({
      segment,
      segmentIndex,
      startTime: getRawSegmentStartTime(segment, session),
    }))
    .filter((candidate): candidate is { segment: CtcRawCrossingRecord[]; segmentIndex: number; startTime: Date } =>
      candidate.startTime !== undefined
    )
    .sort((left, right) =>
      Math.abs(left.startTime.getTime() - scheduledStartTime.getTime()) -
      Math.abs(right.startTime.getTime() - scheduledStartTime.getTime())
    );

  const selectedTimedSegment = timedSegments[0];
  if (selectedTimedSegment) {
    return {
      records: selectedTimedSegment.segment,
      segmentIndex: selectedTimedSegment.segmentIndex,
    };
  }

  return {
    records: segments[preferredSegmentIndex] || [],
    segmentIndex: preferredSegmentIndex,
  };
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
      const selectedSegment = selectSessionRawSegment(allRecords, session, segmentIndex);
      const records = selectedSegment.records;
      if (records.length > 0) {
        rawFiles.push({
          fileName,
          lines: records.map((record) => record.raw),
          records,
          segmentIndex: selectedSegment.segmentIndex,
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
  participantsByPlate: Map<string, EventParticipant[]>,
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
        (participantsByPlate.get(plateNumber) || []).forEach((participant) => {
          if (participant.categoryId) {
            inferredCategoryIds.add(participant.categoryId.toString());
          }
        });
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
  const mergedDrivers = getMergedDriverRecords(buffers, programme.records, drivers);
  const meetingCode = getMeetingCode(programme.records, locationPath);
  const categories = buildCategories(meetingCode, programme.records, mergedDrivers);
  const categoryIdByName = new Map(categories.map((category) => [category.name, category.id]));
  const participants = buildParticipants(meetingCode, mergedDrivers, categoryIdByName);
  const sessions = inferSessionCategoryIds(buffers, buildSessions(meetingCode, programme.records, categoryIdByName), participants);
  const sessionPlansById = new Map<string, MrScatsSessionLoadPlan>();
  let sessionFileCount = 0;
  let sessionRowCount = 0;

  for (const session of sessions) {
    const auxiliaryDbfFileNames: string[] = [];
    const dbfFileNames = findSessionDbfCrossingFileNames(buffers, session);
    const noFileNames = findSessionNoCrossingFileNames(buffers, session);
    const rawFiles = hasSessionNo1CrossingFile(noFileNames) ? [] : findSessionRawCrossingFiles(buffers, session);

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
  return Math.trunc(record.rawTimeTicks / (CROSSING_ELAPSED_TICKS_PER_SECOND / 1000));
};

const elapsedTicksToMilliseconds = (elapsedTicks: number): number => {
  return Math.trunc(elapsedTicks / (CROSSING_ELAPSED_TICKS_PER_SECOND / 1000));
};

const getTimeTenthOfMillisecond = (elapsedTicks: number): number => {
  return Math.abs(Math.trunc(elapsedTicks)) % 10;
};

const getGreenElapsedMilliseconds = (records: MrScatsDbfRecord[]): number => {
  const explicitElapsed = records
    .map((record) => getFirstNumber(record, CROSSING_GREEN_ELAPSED_FIELDS))
    .find((value): value is number => value !== undefined);
  if (explicitElapsed !== undefined) {
    return elapsedTicksToMilliseconds(explicitElapsed);
  }

  const flaggedRecord = records.find((record) => {
    return CROSSING_GREEN_FLAG_FIELDS.some((field) => {
      const value = asString(record[field]).toUpperCase();
      return value === 'G' || value === 'GREEN' || value === 'START' || value === 'S';
    });
  });

  return flaggedRecord ? getElapsedMilliseconds(flaggedRecord) || 0 : 0;
};

const getTimeZoneParts = (date: Date): { day: number; hour: number; millisecond: number; minute: number; month: number; second: number; year: number } => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone: DEFAULT_TIME_ZONE,
    year: 'numeric',
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));

  return {
    day: Number(parts.day),
    hour: Number(parts.hour),
    millisecond: date.getUTCMilliseconds(),
    minute: Number(parts.minute),
    month: Number(parts.month),
    second: Number(parts.second),
    year: Number(parts.year),
  };
};

const getTimeZoneDate = (date: Date): string => {
  const parts = getTimeZoneParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
};

const getTimeZoneMillisecondsSinceMidnight = (date: Date): number => {
  const parts = getTimeZoneParts(date);
  return (((parts.hour * 60) + parts.minute) * 60 + parts.second) * 1000 + parts.millisecond;
};

const shouldTreatMillisecondsAsTimeOfDay = (
  scheduledStartTime: Date,
  millisecondsSinceMidnight: number
): boolean => {
  if (millisecondsSinceMidnight < 0 || millisecondsSinceMidnight >= CROSSING_MILLISECONDS_PER_DAY) {
    return false;
  }

  const scheduledMilliseconds = getTimeZoneMillisecondsSinceMidnight(scheduledStartTime);
  const directDifference = Math.abs(millisecondsSinceMidnight - scheduledMilliseconds);
  const wrappedDifference = CROSSING_MILLISECONDS_PER_DAY - directDifference;
  return Math.min(directDifference, wrappedDifference) <= CROSSING_TIME_OF_DAY_PROXIMITY_MILLISECONDS;
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

  const elapsedMilliseconds = elapsedTicksToMilliseconds(elapsedTicks);
  if (elapsedMilliseconds < MINIMUM_TIME_OF_DAY_MILLISECONDS) {
    return false;
  }

  return shouldTreatMillisecondsAsTimeOfDay(scheduledStartTime, elapsedMilliseconds);
};

const getCrossingTime = (
  record: MrScatsDbfRecord,
  scheduledStartTime: Date,
  sessionElapsedZeroTime: Date
): CrossingTime | undefined => {
  const entryTimeOfDayMatch = getFirstTimeOfDayMatch(record, ['ENTRYTIME']);
  if (entryTimeOfDayMatch) {
    return {
      ...entryTimeOfDayMatch,
      time: createTimeOfDayDateNearSession(scheduledStartTime, entryTimeOfDayMatch.elapsedMilliseconds),
    };
  }

  const entryTimeMatch = getFirstNumberMatch(record, ['ENTRYTIME']);
  if (entryTimeMatch) {
    const elapsedMilliseconds = elapsedTicksToMilliseconds(entryTimeMatch.value);
    if (shouldTreatElapsedTicksAsTimeOfDay(scheduledStartTime, entryTimeMatch.value)) {
      return {
        elapsedMilliseconds,
        elapsedTicks: entryTimeMatch.value,
        time: createTimeOfDayDateNearSession(scheduledStartTime, elapsedMilliseconds),
        timeTenthOfMillisecond: getTimeTenthOfMillisecond(entryTimeMatch.value),
      };
    }

    return {
      elapsedMilliseconds,
      elapsedTicks: entryTimeMatch.value,
      time: new Date(sessionElapsedZeroTime.getTime() + elapsedMilliseconds),
      timeTenthOfMillisecond: getTimeTenthOfMillisecond(entryTimeMatch.value),
    };
  }

  const elapsedMatch = getFirstNumberMatch(record, CROSSING_ELAPSED_FIELDS);
  if (!elapsedMatch) {
    return undefined;
  }

  const elapsedMilliseconds = elapsedTicksToMilliseconds(elapsedMatch.value);
  return {
    elapsedMilliseconds,
    elapsedTicks: elapsedMatch.value,
    time: new Date(sessionElapsedZeroTime.getTime() + elapsedMilliseconds),
    timeTenthOfMillisecond: getTimeTenthOfMillisecond(elapsedMatch.value),
  };
};

const applyCrossingTimeOffset = (
  crossingTime: CrossingTime,
  timeOffsetMilliseconds: number | undefined
): CrossingTime => {
  if (!timeOffsetMilliseconds) {
    return crossingTime;
  }

  return {
    ...crossingTime,
    elapsedMilliseconds: crossingTime.elapsedMilliseconds + timeOffsetMilliseconds,
    time: new Date(crossingTime.time.getTime() + timeOffsetMilliseconds),
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

const getCrossingLineNumber = (record: MrScatsDbfRecord, fileName: string): number | undefined =>
  getFirstPositiveInteger(record, CROSSING_LINE_FIELDS) || getNoFileLineNumber(fileName);

const getCrossingLoopNumber = (record: MrScatsDbfRecord): number | undefined =>
  getFirstPositiveInteger(record, CROSSING_LOOP_FIELDS);

const getCrossingConfidenceFactor = (record: MrScatsDbfRecord): number | undefined =>
  getFirstNonNegativeInteger(record, CROSSING_CONFIDENCE_FIELDS);

const getCrossingHitCount = (record: MrScatsDbfRecord): number | undefined =>
  getFirstNonNegativeInteger(record, CROSSING_HIT_COUNT_FIELDS);

const getSessionTransponderNumbers = (
  participants: EventParticipant[],
  session: MrScatsImportedSession
): Set<number> => {
  const sessionCategoryIds = new Set(session.categoryIds.map((categoryId) => categoryId.toString()));
  return participants.reduce<Set<number>>((transponders, participant) => {
    if (!sessionCategoryIds.has(participant.categoryId.toString())) {
      return transponders;
    }

    participant.identifiers.forEach((identifier) => {
      const txNo = (identifier as unknown as { txNo?: unknown }).txNo;
      const parsedTxNo = parseInteger(txNo);
      if (parsedTxNo !== undefined && parsedTxNo > 0) {
        transponders.add(parsedTxNo);
      }
    });

    return transponders;
  }, new Set<number>());
};

const getDbfElapsedMillisecondsForAlignment = (record: MrScatsDbfRecord): number | undefined => {
  const elapsedMatch = getFirstNumberMatch(record, CROSSING_ELAPSED_FIELDS);
  return elapsedMatch ? elapsedTicksToMilliseconds(elapsedMatch.value) : undefined;
};

const buildDbfCrossingTimeAnchors = (
  sessionFileTables: Array<CoreTableSource & { isLapCompletion: boolean }>,
  competitorTransponders: Set<number>
): DbfCrossingTimeAnchor[] => {
  return sessionFileTables
    .filter((table) => table.isLapCompletion)
    .flatMap((table, tableIndex) => table.records.flatMap((record, rowIndex): DbfCrossingTimeAnchor[] => {
    const transmitter = getFirstPositiveInteger(record, CROSSING_TRANSPONDER_FIELDS);
    const elapsedMilliseconds = getDbfElapsedMillisecondsForAlignment(record);
    if (transmitter === undefined || elapsedMilliseconds === undefined || !competitorTransponders.has(transmitter)) {
      return [];
    }

    return [{
      elapsedMilliseconds,
      record,
      sequence: (tableIndex * 1_000_000) + rowIndex,
      transmitter,
    }];
  }));
};

const buildSrtCrossingTimeAnchors = (
  parsedRawFiles: MrScatsRawFilePlan[],
  session: MrScatsImportedSession,
  competitorTransponders: Set<number>
): SrtCrossingTimeAnchor[] => {
  return parsedRawFiles.flatMap((rawFile, rawFileIndex) => rawFile.records.flatMap((record, recordIndex): SrtCrossingTimeAnchor[] => {
    const transmitter = record.transmitter;
    if (transmitter === undefined || transmitter <= 0 || !competitorTransponders.has(transmitter) || record.timeText === undefined) {
      return [];
    }

    return [{
      fileName: rawFile.fileName,
      record,
      sequence: (rawFileIndex * 1_000_000) + recordIndex,
      time: parseRawTimeOfDay(record.timeText, new Date(session.scheduledStart)),
      transmitter,
    }];
  }));
};

const buildSrtRawRecordTimeAnchors = (
  parsedRawFiles: MrScatsRawFilePlan[],
  session: MrScatsImportedSession
): SrtRawRecordTimeAnchor[] => {
  return parsedRawFiles.flatMap((rawFile, rawFileIndex) => rawFile.records.flatMap((record, recordIndex): SrtRawRecordTimeAnchor[] => {
    if (record.timeText === undefined) {
      return [];
    }

    return [{
      fileName: rawFile.fileName,
      record,
      sequence: (rawFileIndex * 1_000_000) + recordIndex,
      time: parseRawTimeOfDay(record.timeText, new Date(session.scheduledStart)),
    }];
  }));
};

const areAlignedMilliseconds = (left: number, right: number): boolean =>
  Math.abs(left - right) <= 1;

const findFirstDbfLapDelta = (
  dbfAnchors: DbfCrossingTimeAnchor[]
): { firstAnchor: DbfCrossingTimeAnchor; lapDeltaMilliseconds: number } | undefined => {
  const orderedAnchors = [...dbfAnchors].sort((left, right) => left.sequence - right.sequence);
  const firstAnchor = orderedAnchors[0];
  if (!firstAnchor) {
    return undefined;
  }

  const nextAnchor = orderedAnchors.find((anchor) =>
    anchor.sequence > firstAnchor.sequence &&
    anchor.transmitter === firstAnchor.transmitter
  );
  if (!nextAnchor) {
    return undefined;
  }

  const lapDeltaMilliseconds = nextAnchor.elapsedMilliseconds - firstAnchor.elapsedMilliseconds;
  return lapDeltaMilliseconds > 0 ? { firstAnchor, lapDeltaMilliseconds } : undefined;
};

const findFirstMatchingSrtLapDelta = (
  srtAnchors: SrtCrossingTimeAnchor[],
  transmitter: number,
  lapDeltaMilliseconds: number
): SrtCrossingTimeAnchor | undefined => {
  const selectedAnchors = srtAnchors
    .filter((anchor) => anchor.transmitter === transmitter)
    .sort((left, right) => left.sequence - right.sequence);

  for (let index = 0; index < selectedAnchors.length - 1; index += 1) {
    const firstAnchor = selectedAnchors[index]!;
    for (let nextIndex = index + 1; nextIndex < selectedAnchors.length; nextIndex += 1) {
      const nextAnchor = selectedAnchors[nextIndex]!;
      const srtDeltaMilliseconds = nextAnchor.time.getTime() - firstAnchor.time.getTime();
      if (areAlignedMilliseconds(srtDeltaMilliseconds, lapDeltaMilliseconds)) {
        return firstAnchor;
      }
      if (srtDeltaMilliseconds > lapDeltaMilliseconds + 1) {
        break;
      }
    }
  }

  return undefined;
};

const findPrecedingSrtGreenFlagTime = (
  rawRecordAnchors: SrtRawRecordTimeAnchor[],
  crossingAnchor: SrtCrossingTimeAnchor
): Date | undefined => {
  return rawRecordAnchors
    .filter((anchor) =>
      anchor.fileName === crossingAnchor.fileName &&
      anchor.sequence < crossingAnchor.sequence &&
      anchor.record.specialType === 'start-of-race'
    )
    .sort((left, right) => right.sequence - left.sequence)[0]?.time;
};

const deriveSrtGreenFlagSessionAlignment = (
  sessionFileTables: Array<CoreTableSource & { isLapCompletion: boolean }>,
  parsedRawFiles: MrScatsRawFilePlan[],
  session: MrScatsImportedSession,
  participants: EventParticipant[]
): SessionElapsedAlignment | undefined => {
  const competitorTransponders = getSessionTransponderNumbers(participants, session);
  if (competitorTransponders.size === 0) {
    return undefined;
  }

  const dbfLapDelta = findFirstDbfLapDelta(buildDbfCrossingTimeAnchors(sessionFileTables, competitorTransponders));
  if (!dbfLapDelta) {
    return undefined;
  }

  const srtCrossingAnchors = buildSrtCrossingTimeAnchors(parsedRawFiles, session, new Set([dbfLapDelta.firstAnchor.transmitter]));
  const firstSrtAnchor = findFirstMatchingSrtLapDelta(
    srtCrossingAnchors,
    dbfLapDelta.firstAnchor.transmitter,
    dbfLapDelta.lapDeltaMilliseconds
  );
  if (!firstSrtAnchor) {
    return undefined;
  }

  const greenFlagTime = findPrecedingSrtGreenFlagTime(buildSrtRawRecordTimeAnchors(parsedRawFiles, session), firstSrtAnchor);
  if (!greenFlagTime) {
    return undefined;
  }

  const expectedFirstCrossingTime = greenFlagTime.getTime() + dbfLapDelta.firstAnchor.elapsedMilliseconds;
  if (!areAlignedMilliseconds(expectedFirstCrossingTime, firstSrtAnchor.time.getTime())) {
    return undefined;
  }

  return {
    greenFlagTime,
    sessionElapsedZeroTime: greenFlagTime,
  };
};

const buildRawCrossingTimeAnchors = (
  parsedRawFiles: MrScatsRawFilePlan[],
  session: MrScatsImportedSession
): Map<string, RawCrossingTimeAnchor[]> => {
  const anchorsByKey = new Map<string, RawCrossingTimeAnchor[]>();

  parsedRawFiles.forEach((rawFile) => {
    rawFile.records.forEach((record) => {
      if (record.timeText === undefined) {
        return;
      }

      const key = getRawCrossingAnchorKey({
        transmitter: record.transmitter,
      });
      if (!key) {
        return;
      }

      const time = parseRawTimeOfDay(record.timeText, new Date(session.scheduledStart));
      const existingAnchors = anchorsByKey.get(key) || [];
      existingAnchors.push({
        fileName: rawFile.fileName,
        key,
        record,
        time,
      });
      anchorsByKey.set(key, existingAnchors);
    });
  });

  return anchorsByKey;
};

const deriveAnchoredSessionElapsedZeroTime = (
  sessionFileTables: Array<CoreTableSource & { isLapCompletion: boolean }>,
  parsedRawFiles: MrScatsRawFilePlan[],
  session: MrScatsImportedSession,
  scheduledStartTime: Date
): Date | undefined => {
  const anchorsByKey = buildRawCrossingTimeAnchors(parsedRawFiles, session);
  if (anchorsByKey.size === 0) {
    return undefined;
  }

  const anchorIndexByKey = new Map<string, number>();
  const anchoredZeroTimes: number[] = [];

  sessionFileTables.forEach((table) => {
    table.records.forEach((record) => {
      const key = getRawCrossingAnchorKey({
        plateNumber: getFirstString(record, CROSSING_PLATE_FIELDS),
        transmitter: getFirstPositiveInteger(record, CROSSING_TRANSPONDER_FIELDS),
      });
      if (!key) {
        return;
      }

      const anchors = anchorsByKey.get(key);
      const anchorIndex = anchorIndexByKey.get(key) || 0;
      const anchor = anchors?.[anchorIndex];
      if (!anchor) {
        return;
      }

      const candidateZeroTimes = ['ENTRYTIME', 'ELAPSED']
        .map((field) => getFirstNumberMatch(record, [field]))
        .filter((match): match is { fieldName: string; value: number } => match !== undefined)
        .map((match) => anchor.time.getTime() - elapsedTicksToMilliseconds(match.value))
        .filter((candidateTime) => Math.abs(candidateTime - scheduledStartTime.getTime()) <= (12 * 60 * 60 * 1000))
        .sort((left, right) => {
          return Math.abs(left - scheduledStartTime.getTime()) - Math.abs(right - scheduledStartTime.getTime());
        });

      if (candidateZeroTimes.length === 0) {
        return;
      }

      anchoredZeroTimes.push(candidateZeroTimes[0]!);
      anchorIndexByKey.set(key, anchorIndex + 1);
    });
  });

  if (anchoredZeroTimes.length === 0) {
    return undefined;
  }

  const sortedZeroTimes = [...anchoredZeroTimes].sort((left, right) => left - right);
  return new Date(sortedZeroTimes[Math.floor(sortedZeroTimes.length / 2)]!);
};

const createRawRecordKey = (fileName: string, record: CtcRawCrossingRecord): string =>
  `${fileName}:${record.recordNumber}:${record.raw}`;

const findMatchingRawCrossingRecord = (
  record: MrScatsDbfRecord,
  scheduledStartTime: Date,
  sessionElapsedZeroTime: Date,
  anchorsByKey: Map<string, RawCrossingTimeAnchor[]>,
  anchorIndexByKey: Map<string, number>,
  matchedRawRecordKeys: Set<string>
): CtcRawCrossingRecord | undefined => {
  const key = getRawCrossingAnchorKey({
    plateNumber: getFirstString(record, CROSSING_PLATE_FIELDS),
    transmitter: getFirstPositiveInteger(record, CROSSING_TRANSPONDER_FIELDS),
  });
  const crossingTime = getCrossingTime(record, scheduledStartTime, sessionElapsedZeroTime);
  const anchors = key ? anchorsByKey.get(key) : undefined;
  if (!key || !crossingTime || !anchors) {
    return undefined;
  }

  const startIndex = anchorIndexByKey.get(key) || 0;
  const matchingAnchorIndex = anchors.findIndex((anchor, index) =>
    index >= startIndex &&
    Math.abs(anchor.time.getTime() - crossingTime.time.getTime()) <= 1 &&
    !matchedRawRecordKeys.has(createRawRecordKey(anchor.fileName, anchor.record))
  );
  if (matchingAnchorIndex < 0) {
    return undefined;
  }

  const matchingAnchor = anchors[matchingAnchorIndex]!;
  anchorIndexByKey.set(key, matchingAnchorIndex + 1);
  matchedRawRecordKeys.add(createRawRecordKey(matchingAnchor.fileName, matchingAnchor.record));
  return matchingAnchor.record;
};

const mergeRawCrossingDataIntoDbfRecord = (
  record: MrScatsDbfRecord,
  rawRecord: CtcRawCrossingRecord | undefined
): MrScatsDbfRecord => {
  if (!rawRecord) {
    return record;
  }

  return {
    ...record,
    ...(getCrossingLineNumber(record, '') === undefined && rawRecord.lineNumber !== undefined ? { LINE_NO: rawRecord.lineNumber } : {}),
    ...(getCrossingLoopNumber(record) === undefined && rawRecord.laneNumber !== undefined ? { LANE_NO: rawRecord.laneNumber } : {}),
    ...(getCrossingConfidenceFactor(record) === undefined && rawRecord.confidence !== undefined ? { CONFIDENCE: rawRecord.confidence } : {}),
    ...(getCrossingHitCount(record) === undefined && rawRecord.hitCount !== undefined ? { HITS: rawRecord.hitCount } : {}),
  };
};

const mergeRawCrossingDataIntoSessionTables = (
  sessionFileTables: SessionFileTable[],
  parsedRawFiles: MrScatsRawFilePlan[],
  session: MrScatsImportedSession,
  scheduledStartTime: Date,
  sessionElapsedZeroTime: Date,
  matchedRawRecordKeys: Set<string>
): SessionFileTable[] => {
  const anchorsByKey = buildRawCrossingTimeAnchors(parsedRawFiles, session);
  const anchorIndexByKey = new Map<string, number>();

  return sessionFileTables.map((table) => ({
    ...table,
    records: table.records.map((record) => mergeRawCrossingDataIntoDbfRecord(
      record,
      findMatchingRawCrossingRecord(
        record,
        scheduledStartTime,
        sessionElapsedZeroTime,
        anchorsByKey,
        anchorIndexByKey,
        matchedRawRecordKeys
      )
    )),
  }));
};

const isNoCrossingFileName = (fileName: string): boolean =>
  /^\.NO\d+$/i.test(path.extname(fileName));

const getCrossingIdentityKey = (record: MrScatsDbfRecord): string | undefined => {
  const transmitter = getFirstPositiveInteger(record, CROSSING_TRANSPONDER_FIELDS);
  if (transmitter !== undefined) {
    return `tx:${transmitter}`;
  }

  const plateNumber = getFirstString(record, CROSSING_PLATE_FIELDS);
  return plateNumber.length > 0 ? `plate:${plateNumber}` : undefined;
};

const getTableRecordLineNumber = (
  table: SessionFileTable,
  record: MrScatsDbfRecord
): number | undefined =>
  getCrossingLineNumber(record, table.fileName) || (table.isLapCompletion ? 1 : undefined);

const getMatchingSessionDbfFileName = (fileName: string, dbfFileNames: string[]): string | undefined =>
  dbfFileNames.find((dbfFileName) => normalizeBaseName(dbfFileName) === normalizeBaseName(fileName));

const getIgnoredLineOneDbfFileName = (
  fileName: string,
  dbfFileNames: string[],
  ignoreLineOneNo1CrossingsWhenDbfPresent: boolean
): string | undefined => {
  if (!ignoreLineOneNo1CrossingsWhenDbfPresent || !isNoCrossingFileName(fileName)) {
    return undefined;
  }

  return getMatchingSessionDbfFileName(fileName, dbfFileNames);
};

const buildLineOneCrossingTimeAnchors = (
  table: SessionFileTable,
  scheduledStartTime: Date,
  sessionElapsedZeroTime: Date
): TableCrossingTimeAnchor[] => {
  return table.records.flatMap((record, rowIndex): TableCrossingTimeAnchor[] => {
    if (getTableRecordLineNumber(table, record) !== 1) {
      return [];
    }

    const key = getCrossingIdentityKey(record);
    const crossingTime = getCrossingTime(record, scheduledStartTime, sessionElapsedZeroTime);
    if (!key || !crossingTime) {
      return [];
    }

    return [{
      key,
      sequence: rowIndex,
      time: crossingTime.time,
      timeTenthOfMillisecond: crossingTime.timeTenthOfMillisecond,
    }];
  });
};

const buildCrossingTimeAnchorsByKey = (
  anchors: TableCrossingTimeAnchor[]
): Map<string, TableCrossingTimeAnchor[]> => anchors
  .reduce<Map<string, TableCrossingTimeAnchor[]>>((anchorsByKey, anchor) => {
    const keyAnchors = anchorsByKey.get(anchor.key) || [];
    keyAnchors.push(anchor);
    anchorsByKey.set(anchor.key, keyAnchors);
    return anchorsByKey;
  }, new Map<string, TableCrossingTimeAnchor[]>());

const sortTableCrossingTimeAnchors = (anchorsByKey: Map<string, TableCrossingTimeAnchor[]>): void => {
  anchorsByKey.forEach((anchors) => anchors.sort((left, right) => {
    const timeDifference = left.time.getTime() - right.time.getTime();
    return timeDifference === 0 ? left.sequence - right.sequence : timeDifference;
  }));
};

const getMatchingAlignedAnchor = (
  anchor: TableCrossingTimeAnchor,
  candidates: TableCrossingTimeAnchor[],
  offsetMilliseconds: number
): { deltaMilliseconds: number; sequenceDistance: number } | undefined => {
  const alignedTime = anchor.time.getTime() + offsetMilliseconds;

  return candidates
    .map((candidate) => ({
      deltaMilliseconds: Math.abs(candidate.time.getTime() - alignedTime),
      sequenceDistance: Math.abs(candidate.sequence - anchor.sequence),
      timeTenthOfMillisecond: candidate.timeTenthOfMillisecond,
    }))
    .filter((candidate) =>
      candidate.timeTenthOfMillisecond === anchor.timeTenthOfMillisecond &&
      areAlignedMilliseconds(candidate.deltaMilliseconds, 0)
    )
    .sort((left, right) => {
      if (left.deltaMilliseconds !== right.deltaMilliseconds) {
        return left.deltaMilliseconds - right.deltaMilliseconds;
      }

      return left.sequenceDistance - right.sequenceDistance;
    })[0];
};

const scoreNoFileTimeOffset = (
  noAnchors: TableCrossingTimeAnchor[],
  dbfAnchorsByKey: Map<string, TableCrossingTimeAnchor[]>,
  offsetMilliseconds: number
): NoFileTimeOffsetScore => {
  const matchedKeys = new Set<string>();
  let matchedCount = 0;
  let totalDeltaMilliseconds = 0;
  let totalSequenceDistance = 0;

  noAnchors.forEach((anchor) => {
    const match = getMatchingAlignedAnchor(anchor, dbfAnchorsByKey.get(anchor.key) || [], offsetMilliseconds);
    if (!match) {
      return;
    }

    matchedKeys.add(anchor.key);
    matchedCount += 1;
    totalDeltaMilliseconds += match.deltaMilliseconds;
    totalSequenceDistance += match.sequenceDistance;
  });

  return {
    distinctKeyCount: matchedKeys.size,
    matchedCount,
    offsetMilliseconds,
    totalDeltaMilliseconds,
    totalSequenceDistance,
  };
};

const getNoFileOffsetCandidates = (
  noAnchors: TableCrossingTimeAnchor[],
  dbfAnchorsByKey: Map<string, TableCrossingTimeAnchor[]>
): number[] => {
  const candidates = new Set<number>();
  noAnchors.forEach((noAnchor) => {
    (dbfAnchorsByKey.get(noAnchor.key) || []).forEach((dbfAnchor) => {
      if (dbfAnchor.timeTenthOfMillisecond === noAnchor.timeTenthOfMillisecond) {
        candidates.add(dbfAnchor.time.getTime() - noAnchor.time.getTime());
      }
    });
  });

  return Array.from(candidates);
};

const chooseBestNoFileTimeOffset = (
  noAnchors: TableCrossingTimeAnchor[],
  dbfAnchorsByKey: Map<string, TableCrossingTimeAnchor[]>
): number | undefined => getNoFileOffsetCandidates(noAnchors, dbfAnchorsByKey)
  .map((offsetMilliseconds) => scoreNoFileTimeOffset(noAnchors, dbfAnchorsByKey, offsetMilliseconds))
  .filter((score) => score.matchedCount > 0)
  .sort((left, right) => {
    if (left.matchedCount !== right.matchedCount) {
      return right.matchedCount - left.matchedCount;
    }
    if (left.distinctKeyCount !== right.distinctKeyCount) {
      return right.distinctKeyCount - left.distinctKeyCount;
    }
    if (left.totalDeltaMilliseconds !== right.totalDeltaMilliseconds) {
      return left.totalDeltaMilliseconds - right.totalDeltaMilliseconds;
    }
    if (left.totalSequenceDistance !== right.totalSequenceDistance) {
      return left.totalSequenceDistance - right.totalSequenceDistance;
    }

    return Math.abs(left.offsetMilliseconds) - Math.abs(right.offsetMilliseconds);
  })[0]?.offsetMilliseconds;

const deriveNoFileTimeOffsets = (
  sessionFileTables: SessionFileTable[],
  scheduledStartTime: Date,
  sessionElapsedZeroTime: Date
): Map<string, number> => {
  const dbfAnchorsByKey = buildCrossingTimeAnchorsByKey(sessionFileTables
    .filter((table) => table.isLapCompletion)
    .flatMap((table) => buildLineOneCrossingTimeAnchors(table, scheduledStartTime, sessionElapsedZeroTime)));

  sortTableCrossingTimeAnchors(dbfAnchorsByKey);
  const offsetsByFileName = new Map<string, number>();

  sessionFileTables
    .filter((table) => isNoCrossingFileName(table.fileName))
    .forEach((table) => {
      const noAnchors = buildLineOneCrossingTimeAnchors(table, scheduledStartTime, sessionElapsedZeroTime);
      const offsetMilliseconds = chooseBestNoFileTimeOffset(noAnchors, dbfAnchorsByKey);
      if (offsetMilliseconds !== undefined && Math.abs(offsetMilliseconds) > 1) {
        offsetsByFileName.set(table.fileName, offsetMilliseconds);
      }
    });

  return offsetsByFileName;
};

const applyNoFileTimeOffsets = (
  sessionFileTables: SessionFileTable[],
  scheduledStartTime: Date,
  sessionElapsedZeroTime: Date
): SessionFileTable[] => {
  const offsetsByFileName = deriveNoFileTimeOffsets(sessionFileTables, scheduledStartTime, sessionElapsedZeroTime);
  if (offsetsByFileName.size === 0) {
    return sessionFileTables;
  }

  return sessionFileTables.map((table) => ({
    ...table,
    timeOffsetMilliseconds: (table.timeOffsetMilliseconds || 0) + (offsetsByFileName.get(table.fileName) || 0),
  }));
};

const getCrossingRecordMergeKey = (record: EventTimeRecord): string | undefined => {
  if (record.recordType !== RECORD_TX_CROSSING || !record.time) {
    return undefined;
  }

  const crossing = record as ParticipantPassingRecord & { chipCode?: number; plateNumber?: string | number };
  if (crossing.isExcluded) {
    return undefined;
  }

  const identifier = crossing.chipCode !== undefined
    ? `tx:${crossing.chipCode}`
    : crossing.plateNumber !== undefined
      ? `plate:${crossing.plateNumber.toString().trim()}`
      : undefined;
  if (!identifier) {
    return undefined;
  }

  return [
    identifier,
    record.time.getTime().toString(),
    (record.timeTenthOfMillisecond || 0).toString(),
  ].join(':');
};

const mergeCrossingRecordMetadata = (
  primaryRecord: EventTimeRecord,
  secondaryRecord: EventTimeRecord
): EventTimeRecord => {
  if (primaryRecord.recordType !== RECORD_TX_CROSSING || secondaryRecord.recordType !== RECORD_TX_CROSSING) {
    return primaryRecord;
  }

  const primary = primaryRecord as ParticipantPassingRecord;
  const secondary = secondaryRecord as ParticipantPassingRecord;
  return {
    ...primary,
    ...(primary.lineNumber === undefined && secondary.lineNumber !== undefined ? { lineNumber: secondary.lineNumber } : {}),
    ...(primary.loopNumber === undefined && secondary.loopNumber !== undefined ? { loopNumber: secondary.loopNumber } : {}),
    ...(primary.confidenceFactor === undefined && secondary.confidenceFactor !== undefined ? { confidenceFactor: secondary.confidenceFactor } : {}),
    ...(primary.hitCount === undefined && secondary.hitCount !== undefined ? { hitCount: secondary.hitCount } : {}),
  } as EventTimeRecord;
};

const mergeDuplicateCrossingRecords = (
  records: EventTimeRecord[]
): EventTimeRecord[] => {
  const mergedRecords: EventTimeRecord[] = [];
  const recordIndexByKey = new Map<string, number>();

  records.forEach((record) => {
    const key = getCrossingRecordMergeKey(record);
    if (!key) {
      mergedRecords.push(record);
      return;
    }

    const existingIndex = recordIndexByKey.get(key);
    if (existingIndex === undefined) {
      recordIndexByKey.set(key, mergedRecords.length);
      mergedRecords.push(record);
      return;
    }

    mergedRecords[existingIndex] = mergeCrossingRecordMetadata(mergedRecords[existingIndex]!, record);
  });

  return mergedRecords;
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

const getRawTimeTenthOfMillisecond = (timeText: string | undefined, fallbackTicks: number): number => {
  const explicitTimeMatch = timeText ? /^(\d{2}):(\d{2}):(\d{2})\.(\d{4})$/.exec(timeText) : undefined;
  if (explicitTimeMatch) {
    return Number(explicitTimeMatch[4]) % 10;
  }

  return getTimeTenthOfMillisecond(fallbackTicks);
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
  participantsByPlate: Map<string, EventParticipant[]>,
  options: { ignoredReason?: string; isLapCompletion?: boolean; timeOffsetMilliseconds?: number } = {}
): EventTimeRecord | undefined => {
  const baseCrossingTime = getCrossingTime(record, scheduledStartTime, sessionElapsedZeroTime);
  if (!baseCrossingTime) {
    return undefined;
  }
  const crossingTime = applyCrossingTimeOffset(baseCrossingTime, options.timeOffsetMilliseconds);

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
    crossingTime.elapsedTicks.toString(),
  ].join(':');
  const baseRecord: ParticipantPassingRecord = {
    confidenceFactor: getCrossingConfidenceFactor(record),
    dataLine: JSON.stringify(record),
    elapsedTime: null,
    eventId: createEventId(`mr-scats:${meetingCode}:event`),
    hitCount: getCrossingHitCount(record),
    id: createTimeRecordId(stableRecordKey),
    ...(options.ignoredReason ? { isExcluded: true, unrelatedReason: options.ignoredReason } : {}),
    isLapCompletion: options.isLapCompletion,
    lineNumber: getCrossingLineNumber(record, fileName),
    loopNumber: getCrossingLoopNumber(record),
    originRecordNumber: rowIndex + 1,
    recordType: RECORD_TX_CROSSING,
    sequence,
    sessionId: session.id,
    source,
    time: crossingTime.time,
    timeTenthOfMillisecond: crossingTime.timeTenthOfMillisecond,
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
  participantsByPlate: Map<string, EventParticipant[]>
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
    drtCode?: string;
    rawStatus?: string;
  } = {
    confidenceFactor: record.confidence !== undefined ? Number.parseInt(record.confidence, 10) : undefined,
    dataLine: record.raw,
    drtCode: record.drtCode,
    elapsedTime: null,
    eventId: createEventId(`mr-scats:${meetingCode}:event`),
    hitCount: record.hitCount,
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
    timeTenthOfMillisecond: getRawTimeTenthOfMillisecond(record.timeText, record.rawTimeTicks),
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
  progress?: MrScatsLoadProgressTracker,
  options: Pick<MrScatsCatalogLoadOptions, 'ignoreLineOneNo1CrossingsWhenDbfPresent'> = {}
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
    const ignoreLineOneNo1CrossingsWhenDbfPresent = options.ignoreLineOneNo1CrossingsWhenDbfPresent !== false;
    const rawStartRecord = parsedRawFiles
      .flatMap((rawFile) => rawFile.records)
      .find((record) => record.specialType === 'start-of-race' && record.timeText !== undefined);
    const programmeStartTime = new Date(session.scheduledStart);
    const scheduledStartTime = rawStartRecord?.timeText
      ? parseRawTimeOfDay(rawStartRecord.timeText, new Date(session.scheduledStart))
      : programmeStartTime;
    const sessionFileTables: SessionFileTable[] = [];
    for (const fileName of [...sessionPlan.dbfFileNames, ...sessionPlan.noFileNames, ...sessionPlan.auxiliaryDbfFileNames]) {
      let completedFileScan = false;
      try {
        await progress?.completeFileScan(fileName, 'buildSessionRecords[scan]');
        completedFileScan = true;
        sessionFileTables.push({
          fileName,
          ignoredLineOneDbfFileName: getIgnoredLineOneDbfFileName(
            fileName,
            sessionPlan.dbfFileNames,
            ignoreLineOneNo1CrossingsWhenDbfPresent
          ),
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
    const sessionElapsedZeroTime = programmeStartTime;
    const greenFlagTime = programmeStartTime;
    const timeAlignedSessionFileTables = sessionFileTables;
    const matchedRawRecordKeys = new Set<string>();
    const mergedSessionFileTables = mergeRawCrossingDataIntoSessionTables(
      timeAlignedSessionFileTables,
      parsedRawFiles,
      session,
      scheduledStartTime,
      sessionElapsedZeroTime,
      matchedRawRecordKeys
    );
    const dbfCrossingRecords = mergedSessionFileTables.flatMap((table) => table.records
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
          {
            ignoredReason: table.ignoredLineOneDbfFileName && getTableRecordLineNumber(table, record) === 1
              ? `Line 1 imported from ${path.basename(table.ignoredLineOneDbfFileName)}`
              : undefined,
            isLapCompletion: table.isLapCompletion,
            timeOffsetMilliseconds: table.timeOffsetMilliseconds,
          }
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
        .filter((record) => !matchedRawRecordKeys.has(createRawRecordKey(fileName, record)))
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
    const crossingRecords = mergeDuplicateCrossingRecords([...dbfCrossingRecords, ...rawFlagRecords, ...rawCrossingRecords])
      .sort((left, right) => {
        const leftTime = left.time?.getTime() || 0;
        const rightTime = right.time?.getTime() || 0;
        if (leftTime !== rightTime) {
          return leftTime - rightTime;
        }

        return (left.timeTenthOfMillisecond || 0) - (right.timeTenthOfMillisecond || 0);
      })
      .map((record, index): EventTimeRecord => ({
        ...record,
        sequence: index + 2,
      }));

    if (crossingRecords.length === 0) {
      continue;
    }

    sessionRecords.push(
      createSessionGreenFlag(meetingCode, session, sessionSource, greenFlagTime, 1),
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
    const entrantId = createEventEntrantId(`mr-scats:${meetingCode}:entrant:${categoryId}:${plateNumber}`);
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
        id: createEventParticipantId(`mr-scats:${meetingCode}:participant:${categoryId}:${plateNumber}:${index + 1}`),
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

interface MrScatsCompanionTable {
  fileName: string;
  records: MrScatsDbfRecord[];
}

interface MrScatsCalculatedEntrant {
  driverNames: string[];
  entrantId: EventEntrantId;
  fastestLapMilliseconds?: number;
  lapCount: number;
  lapElapsedMillisecondsByLap: Map<number, number>;
  plateNumbers: string[];
  position: number;
  totalElapsedMilliseconds: number;
}

interface MrScatsLeaderByLap {
  entrant: MrScatsCalculatedEntrant;
  lapNumber: number;
}

const findSessionCompanionFileNames = (
  buffers: Map<string, Buffer>,
  session: MrScatsImportedSession,
  extension: string
): string[] => {
  const eventCode = session.eventCode.toUpperCase();
  return Array.from(buffers.keys())
    .filter((fileName) => normalizeBaseName(fileName) === eventCode)
    .filter((fileName) => path.extname(fileName).toUpperCase() === extension.toUpperCase());
};

const readCompanionTables = (
  buffers: Map<string, Buffer>,
  session: MrScatsImportedSession,
  extension: string,
  validationMessages: string[]
): MrScatsCompanionTable[] => findSessionCompanionFileNames(buffers, session, extension).flatMap((fileName): MrScatsCompanionTable[] => {
  try {
    return [{
      fileName,
      records: readMrScatsDbfTable(buffers.get(fileName)!).records,
    }];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    validationMessages.push(`MR-SCATS ${path.basename(fileName)} could not be compared for session ${session.eventCode}: ${message}`);
    return [];
  }
});

const getRecordIdentity = (record: MrScatsDbfRecord): string => {
  const plateNumber = getFirstString(record, COMPANION_IDENTITY_FIELDS);
  if (plateNumber.length > 0) {
    return plateNumber;
  }

  return COMPANION_DRIVER_FIELDS.map((field) => asString(record[field])).find((value) => value.length > 0) || '';
};

const getRecordPosition = (record: MrScatsDbfRecord): number | undefined =>
  getFirstNonNegativeInteger(record, COMPANION_POSITION_FIELDS);

const getRecordLapCount = (record: MrScatsDbfRecord): number | undefined =>
  getFirstNonNegativeInteger(record, COMPANION_LAP_COUNT_FIELDS);

const getRecordLapNumber = (record: MrScatsDbfRecord): number | undefined =>
  getFirstNonNegativeInteger(record, COMPANION_LAP_NUMBER_FIELDS);

const parseDurationMilliseconds = (value: unknown): number | undefined => {
  const timeOfDay = parseTimeOfDayMatch(value);
  if (timeOfDay) {
    return timeOfDay.elapsedMilliseconds;
  }

  const parsed = parseNumber(value);
  if (parsed === undefined) {
    return undefined;
  }

  return elapsedTicksToMilliseconds(parsed);
};

const getRecordDurationMilliseconds = (record: MrScatsDbfRecord, fields: string[]): number | undefined => {
  for (const field of fields) {
    const parsed = parseDurationMilliseconds(record[field]);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
};

const getParticipantPlateNumbers = (participant: EventParticipant): string[] =>
  participant.identifiers
    .map((identifier) => (identifier as unknown as { racePlate?: unknown }).racePlate)
    .filter((racePlate): racePlate is string | number => racePlate !== undefined && racePlate !== null)
    .map((racePlate) => racePlate.toString().trim())
    .filter((racePlate) => racePlate.length > 0);

const getParticipantDisplayName = (participant: EventParticipant): string =>
  `${participant.firstname} ${participant.surname}`.trim();

const buildCalculatedEntrants = (
  session: MrScatsImportedSession,
  raceState: Partial<RaceState>
): MrScatsCalculatedEntrant[] => {
  const records = (raceState.records || []).filter((record) => (record as { sessionId?: SessionId }).sessionId === session.id);
  const sessionState = new Session({
    categories: raceState.categories || [],
    participants: raceState.participants || [],
    records,
    teams: raceState.teams || [],
    timeRecordSources: raceState.timeRecordSources || [],
  });
  sessionState.setMinimumLapTimeMilliseconds(session.minimumLapTimeMilliseconds);
  sessionState.setSessionValidCategoryIds(new Set(session.categoryIds));

  const participantsByEntrantId = (raceState.participants || []).reduce<Map<string, EventParticipant[]>>((map, participant) => {
    const entrants = map.get(participant.entrantId.toString()) || [];
    entrants.push(participant);
    map.set(participant.entrantId.toString(), entrants);
    return map;
  }, new Map<string, EventParticipant[]>());
  const passingsByEntrantId = new Map<EventEntrantId, EntrantPassingRecord[]>();

  (raceState.participants || []).forEach((participant) => {
    const participantLaps = sessionState.getParticipantLaps(participant.id) || [];
    if (participantLaps.length === 0) {
      return;
    }

    const entrantPassings = passingsByEntrantId.get(participant.entrantId) || [];
    entrantPassings.push(...participantLaps);
    passingsByEntrantId.set(participant.entrantId, entrantPassings);
  });

  return generateResult(passingsByEntrantId)
    .sort((left, right) => {
      if (left.lapCount !== right.lapCount) {
        return right.lapCount - left.lapCount;
      }

      return left.totalTime - right.totalTime;
    })
    .map((result: EntrantResult, index): MrScatsCalculatedEntrant => {
      const entrantParticipants = participantsByEntrantId.get(result.entrantId.toString()) || [];
      const lapElapsedMillisecondsByLap = result.laps.reduce<Map<number, number>>((map, lap) => {
        if (typeof lap.lapNo === 'number' && typeof lap.elapsedTime === 'number') {
          map.set(lap.lapNo, lap.elapsedTime);
        }
        return map;
      }, new Map<number, number>());

      return {
        driverNames: entrantParticipants.map(getParticipantDisplayName).filter((name) => name.length > 0),
        entrantId: result.entrantId,
        fastestLapMilliseconds: typeof result.fastestLap?.lapTime === 'number' ? result.fastestLap.lapTime : undefined,
        lapCount: result.lapCount,
        lapElapsedMillisecondsByLap,
        plateNumbers: entrantParticipants.flatMap(getParticipantPlateNumbers),
        position: index + 1,
        totalElapsedMilliseconds: result.totalTime,
      };
    });
};

const calculatedEntrantMatchesRecord = (
  entrant: MrScatsCalculatedEntrant,
  record: MrScatsDbfRecord
): boolean => {
  const plateNumber = getFirstString(record, COMPANION_IDENTITY_FIELDS);
  if (plateNumber.length > 0) {
    return entrant.plateNumbers.includes(plateNumber);
  }

  const driverName = COMPANION_DRIVER_FIELDS.map((field) => asString(record[field]).toLowerCase()).find((value) => value.length > 0);
  return driverName
    ? entrant.driverNames.some((name) => name.toLowerCase() === driverName)
    : false;
};

const findCalculatedEntrant = (
  entrants: MrScatsCalculatedEntrant[],
  record: MrScatsDbfRecord
): MrScatsCalculatedEntrant | undefined =>
  entrants.find((entrant) => calculatedEntrantMatchesRecord(entrant, record));

const formatCalculatedEntrant = (entrant: MrScatsCalculatedEntrant | undefined): string => {
  if (!entrant) {
    return 'not found';
  }

  const plates = entrant.plateNumbers.length > 0 ? entrant.plateNumbers.join('/') : 'no plate';
  const names = entrant.driverNames.length > 0 ? entrant.driverNames.join(' / ') : entrant.entrantId.toString();
  return `${plates} ${names}`;
};

const formatDuration = (milliseconds: number | undefined): string =>
  milliseconds === undefined ? 'missing' : `${milliseconds}ms`;

const durationsMatch = (left: number | undefined, right: number | undefined): boolean =>
  left !== undefined &&
  right !== undefined &&
  Math.abs(left - right) <= DURATION_COMPARE_TOLERANCE_MILLISECONDS;

const appendResValidationMessages = (
  table: MrScatsCompanionTable,
  session: MrScatsImportedSession,
  entrants: MrScatsCalculatedEntrant[],
  validationMessages: string[]
): void => {
  table.records.forEach((record, rowIndex) => {
    const expectedIdentity = getRecordIdentity(record);
    const expectedElapsed = getRecordDurationMilliseconds(record, COMPANION_ELAPSED_FIELDS);
    const expectedLaps = getRecordLapCount(record);
    const expectedPosition = getRecordPosition(record);
    const calculated = findCalculatedEntrant(entrants, record);
    const mismatches: string[] = [];

    if (!calculated) {
      mismatches.push(`identity file=${expectedIdentity || 'missing'} calculated=not found`);
    }
    if (calculated && expectedElapsed !== undefined && !durationsMatch(expectedElapsed, calculated.totalElapsedMilliseconds)) {
      mismatches.push(`elapsed file=${formatDuration(expectedElapsed)} calculated=${formatDuration(calculated.totalElapsedMilliseconds)}`);
    }
    if (calculated && expectedLaps !== undefined && expectedLaps !== calculated.lapCount) {
      mismatches.push(`laps file=${expectedLaps} calculated=${calculated.lapCount}`);
    }
    if (calculated && expectedPosition !== undefined && expectedPosition !== calculated.position) {
      mismatches.push(`position file=${expectedPosition} calculated=${calculated.position}`);
    }

    if (mismatches.length > 0) {
      validationMessages.push(
        `MR-SCATS ${path.basename(table.fileName)} row ${rowIndex + 1} results mismatch for session ${session.eventCode}: ` +
        `${mismatches.join('; ')}; file identity=${expectedIdentity || 'missing'}; calculated identity=${formatCalculatedEntrant(calculated)}.`
      );
    }
  });
};

const appendFstValidationMessages = (
  table: MrScatsCompanionTable,
  session: MrScatsImportedSession,
  entrants: MrScatsCalculatedEntrant[],
  validationMessages: string[]
): void => {
  const calculatedFastest = entrants
    .filter((entrant) => entrant.fastestLapMilliseconds !== undefined)
    .sort((left, right) => left.fastestLapMilliseconds! - right.fastestLapMilliseconds!)[0];

  table.records.forEach((record, rowIndex) => {
    const expectedIdentity = getRecordIdentity(record);
    const expectedLapTime = getRecordDurationMilliseconds(record, COMPANION_FASTEST_LAP_FIELDS);
    const calculatedMatchesIdentity = calculatedFastest ? calculatedEntrantMatchesRecord(calculatedFastest, record) : false;
    const mismatches: string[] = [];

    if (!calculatedFastest || !calculatedMatchesIdentity) {
      mismatches.push(`identity file=${expectedIdentity || 'missing'} calculated=${formatCalculatedEntrant(calculatedFastest)}`);
    }
    if (!durationsMatch(expectedLapTime, calculatedFastest?.fastestLapMilliseconds)) {
      mismatches.push(`fastest lap time file=${formatDuration(expectedLapTime)} calculated=${formatDuration(calculatedFastest?.fastestLapMilliseconds)}`);
    }

    if (mismatches.length > 0) {
      validationMessages.push(
        `MR-SCATS ${path.basename(table.fileName)} row ${rowIndex + 1} fastest-lap mismatch for session ${session.eventCode}: ${mismatches.join('; ')}.`
      );
    }
  });
};

const buildLeaderByLap = (entrants: MrScatsCalculatedEntrant[]): Map<number, MrScatsLeaderByLap> => {
  const maxLap = Math.max(0, ...entrants.map((entrant) => entrant.lapCount));
  const leaders = new Map<number, MrScatsLeaderByLap>();

  for (let lapNumber = 1; lapNumber <= maxLap; lapNumber += 1) {
    const leader = entrants
      .filter((entrant) => entrant.lapElapsedMillisecondsByLap.has(lapNumber))
      .sort((left, right) => left.lapElapsedMillisecondsByLap.get(lapNumber)! - right.lapElapsedMillisecondsByLap.get(lapNumber)!)[0];
    if (leader) {
      leaders.set(lapNumber, { entrant: leader, lapNumber });
    }
  }

  return leaders;
};

const appendLdrValidationMessages = (
  table: MrScatsCompanionTable,
  session: MrScatsImportedSession,
  entrants: MrScatsCalculatedEntrant[],
  validationMessages: string[]
): void => {
  const leaderByLap = buildLeaderByLap(entrants);

  table.records.forEach((record, rowIndex) => {
    const expectedIdentity = getRecordIdentity(record);
    const lapFrom = getFirstNonNegativeInteger(record, COMPANION_LAP_FROM_FIELDS) || getRecordLapNumber(record);
    const lapTo = getFirstNonNegativeInteger(record, COMPANION_LAP_TO_FIELDS) || lapFrom;
    if (lapFrom === undefined || lapTo === undefined) {
      validationMessages.push(
        `MR-SCATS ${path.basename(table.fileName)} row ${rowIndex + 1} leader mismatch for session ${session.eventCode}: file lap range is missing; calculated leaders cannot be matched.`
      );
      return;
    }

    for (let lapNumber = lapFrom; lapNumber <= lapTo; lapNumber += 1) {
      const calculatedLeader = leaderByLap.get(lapNumber)?.entrant;
      if (!calculatedLeader || !calculatedEntrantMatchesRecord(calculatedLeader, record)) {
        validationMessages.push(
          `MR-SCATS ${path.basename(table.fileName)} row ${rowIndex + 1} leader mismatch for session ${session.eventCode} lap ${lapNumber}: ` +
          `file identity=${expectedIdentity || 'missing'} lapFrom=${lapFrom} lapTo=${lapTo}; calculated identity=${formatCalculatedEntrant(calculatedLeader)}.`
        );
      }
    }
  });
};

const validateMrScatsCompanionFiles = (
  buffers: Map<string, Buffer>,
  sessions: MrScatsImportedSession[],
  raceState: Partial<RaceState>
): string[] => {
  const validationMessages: string[] = [];

  sessions.forEach((session) => {
    const hasCompanionFiles = ['.RES', '.FST', '.LDR'].some((extension) =>
      findSessionCompanionFileNames(buffers, session, extension).length > 0
    );
    if (!hasCompanionFiles) {
      return;
    }

    const calculatedEntrants = buildCalculatedEntrants(session, raceState);
    readCompanionTables(buffers, session, '.RES', validationMessages)
      .forEach((table) => appendResValidationMessages(table, session, calculatedEntrants, validationMessages));
    readCompanionTables(buffers, session, '.FST', validationMessages)
      .forEach((table) => appendFstValidationMessages(table, session, calculatedEntrants, validationMessages));
    readCompanionTables(buffers, session, '.LDR', validationMessages)
      .forEach((table) => appendLdrValidationMessages(table, session, calculatedEntrants, validationMessages));
  });

  return validationMessages;
};

export const loadMrScatsCatalogFromLocation = async (
  locationPath: string,
  options: MrScatsCatalogLoadOptions = {}
): Promise<MrScatsCatalogImport> => {
  const { buffers, drivers, loadPlan, programme, progress } = await readCoreTables(locationPath, options);
  const mergedDrivers = getMergedDriverRecords(buffers, programme, {
    fileName: loadPlan.drivers.fileName,
    records: drivers,
  });
  const meetingCode = getMeetingCode(programme, locationPath);
  const categories = buildCategories(meetingCode, programme, mergedDrivers);
  const categoryIdByName = new Map(categories.map((category) => [category.name, category.id]));
  const participants = buildParticipants(meetingCode, mergedDrivers, categoryIdByName);
  const sessions = inferSessionCategoryIds(buffers, buildSessions(meetingCode, programme, categoryIdByName), participants);
  const sessionRecordBuildResult = await buildSessionRecords(meetingCode, buffers, sessions, participants, loadPlan, progress, options);
  const eventDate = getEventDate(programme);
  const raceState: Partial<RaceState> = {
    categories,
    participants,
    records: sessionRecordBuildResult.records,
    teams: [],
    timeRecordSources: sessionRecordBuildResult.timeRecordSources,
  };

  return {
    eventDate,
    eventId: createEventId(`mr-scats:${meetingCode}:event`),
    eventName: getEventName(programme, meetingCode),
    raceState,
    sessions,
    validationMessages: validateMrScatsCompanionFiles(buffers, sessions, raceState),
  };
};

export const MR_SCATS_DEFAULT_TIME_ZONE = DEFAULT_TIME_ZONE;
export const MR_SCATS_DEFAULT_MINIMUM_LAP_TIME = MR_SCATS_DEFAULT_MINIMUM_LAP_TIME_MILLISECONDS;
