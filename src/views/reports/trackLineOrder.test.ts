import { describe, expect, it } from 'vitest';
import { createTimeRecordId, createTimeRecordSourceId } from '../../model/ids.js';
import { RECORD_TX_CROSSING } from '../../model/timerecord.js';
import { checkTrackTimingLineOrder } from './trackLineOrder.js';

const source = createTimeRecordSourceId('track-line-order-test');
const at = (seconds: number): Date => new Date(`2026-06-12T10:00:${String(seconds).padStart(2, '0')}.000Z`);

describe('checkTrackTimingLineOrder', () => {
  it('reports a line positioned after a line it chronologically precedes', () => {
    const raceState = {
      records: [
        { id: createTimeRecordId('crossing-1'), lineNumber: 1, participantId: 'driver-1', recordType: RECORD_TX_CROSSING, sequence: 1, source, time: at(1), txNumber: 10 },
        { id: createTimeRecordId('crossing-2'), lineNumber: 3, participantId: 'driver-1', recordType: RECORD_TX_CROSSING, sequence: 2, source, time: at(2), txNumber: 10 },
        { id: createTimeRecordId('crossing-3'), lineNumber: 2, participantId: 'driver-1', recordType: RECORD_TX_CROSSING, sequence: 3, source, time: at(3), txNumber: 10 },
      ],
    } as never;

    expect(checkTrackTimingLineOrder(raceState, [
      { lineNumber: 1, progress: 0 },
      { label: 'Pit lane entry', lineNumber: 2, progress: 0.33 },
      { label: 'Speed trap', lineNumber: 3, progress: 0.66 },
    ])).toEqual(['Line 2 (Pit lane entry) appears after Line 3 (Speed trap) on the map, but should be before Line 3 (Speed trap) (1 observed crossing).']);
  });

  it('accepts crossings that wrap from the final line to the first line', () => {
    const raceState = {
      records: [
        { id: createTimeRecordId('crossing-1'), lineNumber: 3, participantId: 'driver-1', recordType: RECORD_TX_CROSSING, sequence: 1, source, time: at(1), txNumber: 10 },
        { id: createTimeRecordId('crossing-2'), lineNumber: 1, participantId: 'driver-1', recordType: RECORD_TX_CROSSING, sequence: 2, source, time: at(2), txNumber: 10 },
      ],
    } as never;

    expect(checkTrackTimingLineOrder(raceState, [
      { lineNumber: 1, progress: 0 },
      { lineNumber: 2, progress: 0.33 },
      { lineNumber: 3, progress: 0.66 },
    ])).toEqual([]);
  });
});
