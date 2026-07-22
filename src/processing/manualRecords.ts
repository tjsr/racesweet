import { createGreenFlagEvent, createRedFlagEvent } from './flag.js';
import { isCrossingRecord } from './timerecord.js';
import { type EventCategoryId } from '../model/eventcategory.js';
import { createTimeRecordId, createTimeRecordSourceId } from '../model/ids.js';
import { type EventId, type SessionId } from '../model/raceevent.js';
import {
  EVENT_FLAG_DISPLAYED,
  type EventTimeRecord,
  type ParticipantPassingRecord,
  RECORD_TX_CROSSING,
} from '../model/timerecord.js';
import { type FlagRecord } from '../model/flag.js';

export type ManualFlagType = 'green' | 'yellow' | 'white' | 'red' | 'chequered';

const MANUAL_RECORD_SOURCE_ID = createTimeRecordSourceId('manual-entry');

export const buildManualFlagRecord = (
  anchorRecord: EventTimeRecord,
  currentEventId: EventId | undefined,
  currentSessionId: SessionId | undefined,
  records: EventTimeRecord[],
  time: Date,
  flagType: ManualFlagType,
  categoryIds: EventCategoryId[],
  existingRecord?: EventTimeRecord,
): FlagRecord => {
  const baseRecord = {
    eventId: currentEventId || existingRecord?.eventId || anchorRecord.eventId,
    id: existingRecord?.id || createTimeRecordId(),
    recordType: EVENT_FLAG_DISPLAYED,
    sequence: existingRecord?.sequence || Math.max(...records.map((record) => record.sequence), 0) + 1,
    sessionId: currentSessionId || existingRecord?.sessionId || anchorRecord.sessionId,
    source: existingRecord?.source || MANUAL_RECORD_SOURCE_ID,
    time,
  };

  if (flagType === 'green') {
    return createGreenFlagEvent({
      ...baseRecord,
      categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
      indicatesRaceStart: true,
    });
  }
  if (flagType === 'red') {
    return createRedFlagEvent({
      ...baseRecord,
      categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
    });
  }
  return {
    ...baseRecord,
    categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
    flagType,
    flagValue: flagType === 'yellow' ? 'caution' : 'course',
  } as FlagRecord;
};

export const buildManualPassingRecord = (
  anchorRecord: EventTimeRecord,
  currentEventId: EventId | undefined,
  currentSessionId: SessionId | undefined,
  records: EventTimeRecord[],
  time: Date,
  txNo: string,
  plate: string,
  lineNumberText: string,
  loopNumberText: string,
  existingRecord?: EventTimeRecord,
): ParticipantPassingRecord => {
  const trimmedTxNo = txNo.trim();
  const trimmedPlate = plate.trim();
  const trimmedLineNumber = lineNumberText.trim();
  const trimmedLoopNumber = loopNumberText.trim();
  const record: ParticipantPassingRecord & { chipCode?: number; plateNumber?: string } = {
    eventId: currentEventId || existingRecord?.eventId || anchorRecord.eventId,
    id: existingRecord?.id || createTimeRecordId(),
    recordType: RECORD_TX_CROSSING,
    sequence: existingRecord?.sequence || Math.max(...records.map((entry) => entry.sequence), 0) + 1,
    sessionId: currentSessionId || existingRecord?.sessionId || anchorRecord.sessionId,
    source: existingRecord?.source || MANUAL_RECORD_SOURCE_ID,
    time,
  };

  if (existingRecord && isCrossingRecord(existingRecord) && existingRecord.isGenerated) {
    record.entrantId = existingRecord.entrantId;
    record.generatedReason = existingRecord.generatedReason;
    record.isGenerated = true;
    record.participantId = existingRecord.participantId;
  }
  if (trimmedTxNo.length > 0 && !Number.isNaN(Number(trimmedTxNo))) {
    record.chipCode = Number(trimmedTxNo);
  }
  if (trimmedPlate.length > 0) {
    record.plateNumber = trimmedPlate;
  }
  if (/^\d+$/.test(trimmedLineNumber)) {
    record.lineNumber = Number(trimmedLineNumber);
  }
  if (/^\d+$/.test(trimmedLoopNumber)) {
    record.loopNumber = Number(trimmedLoopNumber);
  }

  return record;
};
