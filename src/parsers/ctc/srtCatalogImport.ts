import path from 'node:path';
import { createEventId, createSessionId, createTimeRecordId, createTimeRecordSourceId } from '../../model/ids.js';
import type { EventId } from '../../model/raceevent.js';
import type { RaceState } from '../../model/racestate.js';
import { RECORD_TX_CROSSING, type EventTimeRecord, type ParticipantPassingRecord } from '../../model/timerecord.js';
import { MR_SCATS_DEFAULT_MINIMUM_LAP_TIME, type MrScatsCatalogImport } from '../mrScats/catalogImport.js';
import { parseCtcRawCrossingFile, type CtcRawCrossingRecord } from './rawCrossing.js';

const DEFAULT_EVENT_DATE = '1970-01-01';
const TICKS_PER_DAY = 24 * 60 * 60 * 10_000;

const createTimeOfDay = (eventDate: string, record: CtcRawCrossingRecord): Date => {
  const ticks = record.rawTimeTicks % TICKS_PER_DAY;
  const milliseconds = Math.floor(ticks / 10);
  const parsedDate = Date.parse(`${eventDate}T00:00:00.000Z`);
  const midnight = Number.isNaN(parsedDate) ? Date.parse(`${DEFAULT_EVENT_DATE}T00:00:00.000Z`) : parsedDate;
  return new Date(midnight + milliseconds);
};

const createCrossingRecord = (
  eventId: EventId,
  sessionId: ReturnType<typeof createSessionId>,
  sourceId: ReturnType<typeof createTimeRecordSourceId>,
  filePath: string,
  eventDate: string,
  record: CtcRawCrossingRecord,
  sequence: number
): EventTimeRecord | undefined => {
  if (record.transmitter === undefined || record.transmitter <= 0 || record.specialType) {
    return undefined;
  }

  const crossing: ParticipantPassingRecord & { chipCode: number; drtCode: string; rawStatus?: string } = {
    chipCode: record.transmitter,
    confidenceFactor: record.confidence === undefined ? undefined : Number.parseInt(record.confidence, 10),
    dataLine: record.raw,
    drtCode: record.drtCode,
    elapsedTime: null,
    eventId,
    hitCount: record.hitCount,
    id: createTimeRecordId(`dorian-ctc-srt:${filePath}:record:${record.recordNumber}:${record.raw}`),
    lineNumber: record.lineNumber,
    loopNumber: record.laneNumber,
    originRecordNumber: record.recordNumber,
    rawStatus: record.status,
    recordType: RECORD_TX_CROSSING,
    sequence,
    sessionId,
    source: sourceId,
    time: createTimeOfDay(eventDate, record),
    timeTenthOfMillisecond: record.rawTimeTicks % 10,
  };

  return crossing;
};

export const loadDorianCtcSrtCatalog = (filePath: string, buffer: Buffer, eventDate = DEFAULT_EVENT_DATE): MrScatsCatalogImport => {
  const normalizedFilePath = path.resolve(filePath);
  const baseName = path.basename(normalizedFilePath, path.extname(normalizedFilePath));
  const eventId = createEventId(`dorian-ctc-srt:${normalizedFilePath}:event`);
  const sessionId = createSessionId(`dorian-ctc-srt:${normalizedFilePath}:session`);
  const sourceId = createTimeRecordSourceId(`dorian-ctc-srt:${normalizedFilePath}:source`);
  const rawRecords = parseCtcRawCrossingFile(buffer);
  const records = rawRecords
    .map((record, index) => createCrossingRecord(eventId, sessionId, sourceId, normalizedFilePath, eventDate, record, index + 1))
    .filter((record): record is EventTimeRecord => record !== undefined);
  const firstTime = records[0]?.time || new Date(`${eventDate}T00:00:00.000Z`);
  const raceState: Partial<RaceState> = {
    categories: [],
    participants: [],
    records,
    teams: [],
    timeRecordSources: [{
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
