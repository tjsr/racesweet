import path from 'node:path';
import { TZDate } from '@date-fns/tz';
import { normalizeTimeZone } from '../../app/utils/timeutils.js';
import type { EventCategory } from '../../model/eventcategory.js';
import type { EventParticipant, ParticipantTransponder } from '../../model/eventparticipant.js';
import type { FlagRecord } from '../../model/flag.js';
import { createCategoryId, createEventEntrantId, createEventId, createEventParticipantId, createSessionId, createTimeRecordId, createTimeRecordSourceId } from '../../model/ids.js';
import type { EventId, SessionId } from '../../model/raceevent.js';
import type { RaceState } from '../../model/racestate.js';
import { EVENT_FLAG_DISPLAYED, EVENT_SESSION_START, RECORD_TX_CROSSING, type EventTimeRecord, type ParticipantPassingRecord } from '../../model/timerecord.js';
import { findCtcTrackLoopBySiteAddress, type CtcTrackConfig } from '../../model/ctcTrackConfig.js';
import { MR_SCATS_DEFAULT_MINIMUM_LAP_TIME, type MrScatsCatalogImport } from '../mrScats/catalogImport.js';
import { parseCtcRawCrossingFile, splitCtcRawCrossingLines, type CtcRawCrossingFormat, type CtcRawCrossingRecord } from './rawCrossing.js';

const DEFAULT_EVENT_DATE = '1970-01-01';
const TICKS_PER_DAY = 24 * 60 * 60 * 10_000;

const getRawCrossingFormat = (filePath: string): CtcRawCrossingFormat => {
  return path.extname(filePath).toLowerCase() === '.erf' ? 'erf' : 'srt';
};

export interface DorianCtcSrtLoadProgress {
  completed: number;
  currentFile: string;
  currentTask: string;
  total: number;
}

export interface DorianCtcSrtSessionLoadOptions {
  eventDate: string;
  eventId: EventId;
  importPlaceholderEntrantsForUnknownTransmitters?: boolean;
  knownTransmitterNumbers?: Iterable<number | string>;
  onProgress?: (progress: DorianCtcSrtLoadProgress) => void | Promise<void>;
  sessionId: SessionId;
  trackConfig?: CtcTrackConfig;
  timeZone?: string;
}

const UNKNOWN_PARTICIPANTS_CATEGORY_NAME = 'Unknown participants';

const createTimeOfDay = (eventDate: string, record: CtcRawCrossingRecord, timeZone = 'UTC'): Date => {
  const ticks = record.rawTimeTicks % TICKS_PER_DAY;
  const milliseconds = Math.floor(ticks / 10);
  const [yearText, monthText, dayText] = (eventDate || DEFAULT_EVENT_DATE).split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const fallbackDate = DEFAULT_EVENT_DATE.split('-').map(Number);
  const dateYear = Number.isInteger(year) ? year : fallbackDate[0];
  const dateMonth = Number.isInteger(month) ? month : fallbackDate[1];
  const dateDay = Number.isInteger(day) ? day : fallbackDate[2];
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1_000);
  const millisecond = milliseconds % 1_000;
  const zonedDate = new TZDate(
    dateYear,
    dateMonth - 1,
    dateDay,
    hours,
    minutes,
    seconds,
    millisecond,
    normalizeTimeZone(timeZone)
  );
  return new Date(zonedDate.getTime());
};

const createCrossingRecord = (
  eventId: EventId,
  sessionId: ReturnType<typeof createSessionId>,
  sourceId: ReturnType<typeof createTimeRecordSourceId>,
  filePath: string,
  eventDate: string,
  timeZone: string | undefined,
  record: CtcRawCrossingRecord,
  sequence: number,
  participantId?: ReturnType<typeof createEventParticipantId>,
  trackConfig?: CtcTrackConfig
): EventTimeRecord | undefined => {
  if (record.transmitter === undefined || record.transmitter <= 0 || record.specialType) {
    return undefined;
  }

  const trackLoop = findCtcTrackLoopBySiteAddress(trackConfig, record.lineNumber, record.laneNumber);
  const crossing: ParticipantPassingRecord & { chipCode: number; drtCode: string; rawStatus?: string } = {
    chipCode: record.transmitter,
    confidenceFactor: record.confidence === undefined ? undefined : Number.parseInt(record.confidence, 10),
    dataLine: record.raw,
    drtCode: record.drtCode,
    elapsedTime: null,
    eventId,
    hitCount: record.hitCount,
    id: createTimeRecordId(`dorian-ctc-srt:${filePath}:record:${record.recordNumber}:${record.raw}`),
    lineNumber: trackLoop?.line.line ?? record.lineNumber,
    loopNumber: trackLoop?.loop.loopNumber ?? record.laneNumber,
    originRecordNumber: record.recordNumber,
    participantId,
    rawStatus: record.status,
    recordType: RECORD_TX_CROSSING,
    sequence,
    sessionId,
    source: sourceId,
    sourceLineNumber: record.lineNumber,
    time: createTimeOfDay(eventDate, record, timeZone),
    timeTenthOfMillisecond: record.rawTimeTicks % 10,
  };

  return crossing;
};

const getTrackConfigEventDescription = (
  trackConfig: CtcTrackConfig | undefined,
  record: CtcRawCrossingRecord
): { code: string; description: string } | undefined => {
  if (!trackConfig) {
    return undefined;
  }

  const eventCode = (record.transmitter === undefined || record.transmitter <= 0
    ? record.status ?? record.drtCode
    : undefined)?.toUpperCase();
  if (!eventCode) {
    return undefined;
  }

  const normalizedEventCode = eventCode.length === 3 && eventCode.startsWith('0')
    ? eventCode.slice(1)
    : eventCode;
  const description = trackConfig.eventDescriptions[eventCode] ?? trackConfig.eventDescriptions[normalizedEventCode];
  return description ? { code: eventCode, description } : undefined;
};

interface CtcFlagSemantics {
  flagType: string;
  flagValue: string;
  indicatesRaceStart?: boolean;
  recordType: number;
}

const getCtcFlagSemantics = (
  eventDescription: { code: string; description: string }
): CtcFlagSemantics => {
  const normalizedDescription = eventDescription.description.toLowerCase();

  if (normalizedDescription.includes('green flag')) {
    return {
      flagType: 'green',
      flagValue: 'course',
      indicatesRaceStart: true,
      recordType: EVENT_FLAG_DISPLAYED | EVENT_SESSION_START,
    };
  }

  if (normalizedDescription.includes('yellow flag') || normalizedDescription.includes('caution')) {
    return {
      flagType: 'yellow',
      flagValue: 'caution',
      recordType: EVENT_FLAG_DISPLAYED,
    };
  }

  return {
    flagType: 'unknown',
    flagValue: eventDescription.code,
    recordType: EVENT_FLAG_DISPLAYED,
  };
};

const createFlagRecord = (
  eventId: EventId,
  sessionId: ReturnType<typeof createSessionId>,
  sourceId: ReturnType<typeof createTimeRecordSourceId>,
  filePath: string,
  eventDate: string,
  timeZone: string | undefined,
  record: CtcRawCrossingRecord,
  sequence: number,
  trackConfig?: CtcTrackConfig
): FlagRecord | undefined => {
  const eventDescription = getTrackConfigEventDescription(trackConfig, record);
  if (!eventDescription) {
    return undefined;
  }

  const ctcFlagSemantics = getCtcFlagSemantics(eventDescription);
  const flagRecord: FlagRecord = {
    dataLine: record.raw,
    description: eventDescription.description,
    eventId,
    flagType: ctcFlagSemantics.flagType,
    flagValue: ctcFlagSemantics.flagValue,
    ...(ctcFlagSemantics.indicatesRaceStart === undefined ? {} : { indicatesRaceStart: ctcFlagSemantics.indicatesRaceStart }),
    id: createTimeRecordId(`dorian-ctc-srt:${filePath}:flag:${record.recordNumber}:${record.raw}`),
    originRecordNumber: record.recordNumber,
    recordType: ctcFlagSemantics.recordType,
    sequence,
    sessionId,
    source: sourceId,
    time: createTimeOfDay(eventDate, record, timeZone),
    timeTenthOfMillisecond: record.rawTimeTicks % 10,
  };

  return flagRecord;
};

export const loadDorianCtcSrtCatalog = (filePath: string, buffer: Buffer, eventDate = DEFAULT_EVENT_DATE, timeZone = 'UTC'): MrScatsCatalogImport => {
  const normalizedFilePath = path.resolve(filePath);
  const baseName = path.basename(normalizedFilePath, path.extname(normalizedFilePath));
  const eventId = createEventId(`dorian-ctc-srt:${normalizedFilePath}:event`);
  const sessionId = createSessionId(`dorian-ctc-srt:${normalizedFilePath}:session`);
  const sourceId = createTimeRecordSourceId(`dorian-ctc-srt:${normalizedFilePath}:source`);
  const rawRecords = parseCtcRawCrossingFile(buffer, getRawCrossingFormat(normalizedFilePath));
  const records = rawRecords
    .map((record, index) => createCrossingRecord(eventId, sessionId, sourceId, normalizedFilePath, eventDate, timeZone, record, index + 1))
    .filter((record): record is EventTimeRecord => record !== undefined);
  const firstTime = records[0]?.time || new Date(`${eventDate}T00:00:00.000Z`);
  const raceState: Partial<RaceState> = {
    categories: [],
    participants: [],
    records,
    teams: [],
    timeRecordSources: [{
      ctcTrackConfig: undefined,
      description: 'Imported Dorian CTC SRT raw crossing records.',
      filePath: normalizedFilePath,
      id: sourceId,
      name: path.basename(normalizedFilePath),
    }],
  };

  return {
    eventDate,
    eventId,
    eventName: baseName || 'Dorian CTC SRT Import',
    raceState,
    sessions: [{
      categoryIds: [],
      eventCode: baseName || 'SRT',
      eventType: 'R',
      id: sessionId,
      minimumLapTimeMilliseconds: MR_SCATS_DEFAULT_MINIMUM_LAP_TIME,
      name: baseName || 'Dorian CTC SRT Import',
      scheduledStart: firstTime.toISOString(),
    }],
  };
};

export const loadDorianCtcSrtCatalogForSession = async (
  filePath: string,
  buffer: Buffer,
  options: DorianCtcSrtSessionLoadOptions
): Promise<Partial<RaceState>> => {
  const normalizedFilePath = path.resolve(filePath);
  const sourceId = createTimeRecordSourceId(`dorian-ctc-srt:${normalizedFilePath}:source`);
  const rawRecords = parseCtcRawCrossingFile(buffer, getRawCrossingFormat(normalizedFilePath));
  const total = splitCtcRawCrossingLines(buffer).length;
  const progressBase = {
    currentFile: path.basename(normalizedFilePath),
    total,
  };
  await options.onProgress?.({
    ...progressBase,
    completed: 0,
    currentTask: 'Reading CTC crossing lines',
  });

  const records: EventTimeRecord[] = [];
  let lastProgressAt = Date.now();
  for (const [index, record] of rawRecords.entries()) {
    const crossing = createCrossingRecord(
      options.eventId,
      options.sessionId,
      sourceId,
      normalizedFilePath,
      options.eventDate,
      options.timeZone,
      record,
      index + 1,
      undefined,
      options.trackConfig
    );
    if (crossing) {
      records.push(crossing);
    }
    const flag = createFlagRecord(
      options.eventId,
      options.sessionId,
      sourceId,
      normalizedFilePath,
      options.eventDate,
      options.timeZone,
      record,
      index + 1,
      options.trackConfig
    );
    if (flag) {
      records.push(flag);
    }

    if (Date.now() - lastProgressAt >= 50 || record.recordNumber === total) {
      lastProgressAt = Date.now();
      await options.onProgress?.({
        ...progressBase,
        completed: record.recordNumber,
        currentTask: 'Importing CTC crossing lines',
      });
    }
  }

  await options.onProgress?.({
    ...progressBase,
    completed: total,
    currentTask: 'CTC file import complete',
  });

  const knownTransmitters = new Set(Array.from(options.knownTransmitterNumbers || []).map((value) => value.toString()));
  const unknownTransmitters = options.importPlaceholderEntrantsForUnknownTransmitters
    ? Array.from(new Set(records
      .filter((record): record is ParticipantPassingRecord & { chipCode: number } => 'chipCode' in record && typeof record.chipCode === 'number')
      .map((record) => record.chipCode)
      .filter((transmitter) => !knownTransmitters.has(transmitter.toString()))))
    : [];
  const placeholderCategoryId = createCategoryId(`dorian-ctc:${normalizedFilePath}:unknown-participants`);
  const placeholderParticipantIds = new Map(unknownTransmitters.map((transmitter) => [
    transmitter,
    createEventParticipantId(`dorian-ctc:${normalizedFilePath}:unknown-transmitter:${transmitter}`),
  ]));
  const participants: EventParticipant[] = unknownTransmitters.map((transmitter) => {
    const participantId = placeholderParticipantIds.get(transmitter)!;
    const entrantId = createEventEntrantId(`dorian-ctc:${normalizedFilePath}:unknown-transmitter:${transmitter}`);
    const transponder: ParticipantTransponder = { fromTime: undefined, toTime: undefined, txNo: transmitter };
    return {
      categoryId: placeholderCategoryId,
      currentResult: undefined,
      entrantId,
      firstname: '',
      id: participantId,
      identifiers: [transponder],
      isPlaceholder: true,
      lastRecordTime: null,
      resultDuration: null,
      surname: '',
    };
  });
  const categories: EventCategory[] = participants.length > 0
    ? [{ code: 'UNKNOWN', description: 'Placeholder entrants created for CTC transmitters not assigned to a known participant.', id: placeholderCategoryId, isPlaceholder: true, name: UNKNOWN_PARTICIPANTS_CATEGORY_NAME }]
    : [];
  const recordsWithPlaceholders = records.map((record) => {
    if (!('chipCode' in record) || typeof record.chipCode !== 'number') {
      return record;
    }

    const participantId = placeholderParticipantIds.get(record.chipCode);
    return participantId ? { ...record, participantId } : record;
  });

  return {
    categories,
    participants,
    records: recordsWithPlaceholders,
    teams: [],
    timeRecordSources: [{
      ctcTrackConfig: options.trackConfig,
      description: 'Imported Dorian CTC SRT/ERF raw crossing records.',
      filePath: normalizedFilePath,
      id: sourceId,
      name: path.basename(normalizedFilePath),
    }],
  };
};
