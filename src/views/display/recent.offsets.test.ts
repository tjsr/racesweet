import { describe, expect, it } from 'vitest';
import { type EventTimeRecord, type TimeRecordSource } from '../../model/timerecord.js';
import type { RaceStateLookup } from '../../model/racestate.js';
import { createTimeRecordId, createTimeRecordSourceId } from '../../model/ids.js';
import { RECORD_TX_CROSSING } from '../../model/timerecord.js';
import { getEditableSourceOffsets } from './recent.js';

const createLookup = (source: TimeRecordSource | undefined): RaceStateLookup => ({
  countTransponderCrossings: (): number => 0,
  excludeCrossing: (): void => undefined,
  getCategoryById: () => undefined,
  getEntrantIdForParticipant: () => undefined,
  getFinishLineNumbers: () => undefined,
  getParticipantById: () => undefined,
  getParticipantLaps: () => undefined,
  getTimeRecordSourceById: () => source,
  getTransponderCrossings: () => [],
  updateCategoryDetails: (): void => undefined,
  updateEntrantCategory: (): void => undefined,
  updateParticipantCategory: (): void => undefined,
});

describe('editable timing-source offsets', (): void => {
  it('uses a meaningful timing-source label and description rather than an opaque source ID', (): void => {
    const sourceId = createTimeRecordSourceId('offset-source');
    const records: Array<EventTimeRecord & { lineNumber: number; txNumber: number }> = [{
      id: createTimeRecordId('offset-record'),
      lineNumber: 2,
      recordType: RECORD_TX_CROSSING,
      sequence: 1,
      source: sourceId,
      time: new Date('2026-11-06T00:00:00.000Z'),
      txNumber: 1024,
    }];

    const offsets = getEditableSourceOffsets(records, createLookup(undefined), 'Australia/Sydney');

    expect(offsets).toHaveLength(1);
    expect(offsets[0]).toMatchObject({
      sourceDescription: 'First crossing at timing line 2.',
      sourceName: 'Timing source 1',
    });
    expect(offsets[0]?.sourceName).not.toContain(sourceId);
  });

  it('prefers the configured source name and description', (): void => {
    const sourceId = createTimeRecordSourceId('finish-decoder');
    const source: TimeRecordSource = {
      description: 'Finish-line RFID decoder.',
      id: sourceId,
      name: 'Finish decoder',
      timezone: 'Australia/Perth',
    };
    const records: EventTimeRecord[] = [{
      id: createTimeRecordId('finish-record'),
      recordType: RECORD_TX_CROSSING,
      sequence: 1,
      source: sourceId,
      time: new Date('2026-11-06T00:00:00.000Z'),
    }];

    expect(getEditableSourceOffsets(records, createLookup(source), 'Australia/Sydney')[0]).toMatchObject({
      sourceDescription: 'Finish-line RFID decoder.',
      sourceName: 'Finish decoder',
      timeZone: 'Australia/Perth',
    });
  });
});
