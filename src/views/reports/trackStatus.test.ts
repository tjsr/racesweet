import { describe, expect, it } from 'vitest';
import { createTimeRecordId, createTimeRecordSourceId } from '../../model/ids.js';
import { EVENT_FLAG_DISPLAYED, RECORD_TX_CROSSING } from '../../model/timerecord.js';
import { createTrackStatusSegments } from './trackStatus.js';

const source = createTimeRecordSourceId('track-status-test');
const time = (seconds: number): Date => new Date(`2026-06-12T10:00:${String(seconds).padStart(2, '0')}.000Z`);

describe('createTrackStatusSegments', () => {
  it('shows green, yellow, white, then black status intervals', () => {
    const entrantId = 'entry-1';
    const participantId = 'participant-1';
    const records = [
      { flagType: 'yellow', flagValue: 'caution', id: createTimeRecordId('yellow'), recordType: EVENT_FLAG_DISPLAYED, sequence: 1, source, time: time(10) },
      { flagType: 'green', flagValue: 'course', id: createTimeRecordId('green'), indicatesRaceStart: false, recordType: EVENT_FLAG_DISPLAYED, sequence: 2, source, time: time(20) },
      { flagType: 'chequered', flagValue: 'course', id: createTimeRecordId('chequered'), recordType: EVENT_FLAG_DISPLAYED, sequence: 3, source, time: time(30) },
      { entrantId, id: createTimeRecordId('finish-one'), isLapCompletion: true, lineNumber: 1, participantId, recordType: RECORD_TX_CROSSING, sequence: 4, source, time: time(32), txNumber: 1 },
      { entrantId, id: createTimeRecordId('finish-two'), isLapCompletion: true, lineNumber: 1, participantId, recordType: RECORD_TX_CROSSING, sequence: 5, source, time: time(34), txNumber: 1 },
    ];
    const raceState = {
      getFinishLineNumbers: () => [1],
      getEntryIdForParticipant: () => entrantId,
      participants: [],
      records,
    } as never;
    const playbackIndex = {
      endTime: time(40).getTime(),
      seek: () => ({ entrants: [{ didNotFinish: false, entrantId, lapCount: 10, position: 1, progress: 0 }], time: time(30).getTime() }),
      startTime: time(0).getTime(),
    } as never;

    expect(createTrackStatusSegments(raceState, playbackIndex)).toEqual([
      { endTime: time(10).getTime(), startTime: time(0).getTime(), status: 'green' },
      { endTime: time(20).getTime(), startTime: time(10).getTime(), status: 'yellow' },
      { endTime: time(30).getTime(), startTime: time(20).getTime(), status: 'green' },
      { endTime: time(34).getTime(), startTime: time(30).getTime(), status: 'white' },
      { endTime: time(40).getTime(), startTime: time(34).getTime(), status: 'black' },
    ]);
  });
});
