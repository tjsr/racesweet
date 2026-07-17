import type { EventParticipant } from '../model/eventparticipant.js';
import type { GreenFlagRecord } from '../model/flag.js';
import { createCategoryId, createEventEntrantId, createEventParticipantId, createTimeRecordId, createTimeRecordSourceId } from '../model/ids.js';
import { calculateParticipantLapTimes, isCountedLapPassing, processAllParticipantLaps } from './laps.js';
import {
  CROSSING_FLAG_LAP_UNDER_MINIMUM,
  CROSSING_UNRELATED_LAP_UNDER_MINIMUM,
  CROSSING_UNRELATED_SESSION_CATEGORY,
  EVENT_FLAG_DISPLAYED,
  RECORD_TX_CROSSING,
  isPassingExcluded,
  isPassingValid,
  type ParticipantPassingRecord,
} from '../model/timerecord.js';

describe('lap calculation exclusion reasons', () => {
  const createLapCalculationFixture = (): {
    categoryId: ReturnType<typeof createCategoryId>;
    participant: EventParticipant;
    source: ReturnType<typeof createTimeRecordSourceId>;
    startFlag: GreenFlagRecord;
  } => {
    const categoryId = createCategoryId('test-category');
    const source = createTimeRecordSourceId('test-source');
    const startFlag: GreenFlagRecord = {
      categoryIds: [categoryId],
      flagType: 'green',
      flagValue: 'course',
      id: createTimeRecordId('start'),
      recordType: EVENT_FLAG_DISPLAYED,
      sequence: 1,
      source,
      time: new Date('2026-05-29T10:00:00.000Z'),
    };
    const participant: EventParticipant = {
      categoryId,
      currentResult: undefined,
      entrantId: createEventEntrantId('entrant-42'),
      firstname: 'Fast',
      id: createEventParticipantId('participant-42'),
      identifiers: [{ fromTime: undefined, racePlate: '42', toTime: undefined }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Driver',
    };

    return {
      categoryId,
      participant,
      source,
      startFlag,
    };
  };

  it('marks crossings excluded below the configured minimum lap time with a reason', () => {
    const { participant, source, startFlag } = createLapCalculationFixture();
    const passings: ParticipantPassingRecord[] = [
      {
        elapsedTime: 59999,
        id: createTimeRecordId('passing-under-minimum'),
        participantId: participant.id,
        recordType: RECORD_TX_CROSSING,
        sequence: 2,
        source,
        time: new Date('2026-05-29T10:00:59.999Z'),
      },
    ];

    calculateParticipantLapTimes(startFlag, passings, participant, 60000);

    expect(passings[0]).toEqual(expect.objectContaining({
      infoFlags: CROSSING_FLAG_LAP_UNDER_MINIMUM,
      lapTime: 59999,
      unrelatedReason: 'Lap time is below minimum of 1:00.0000.',
      unrelatedReasonCode: CROSSING_UNRELATED_LAP_UNDER_MINIMUM,
    }));
    expect(passings[0]).not.toHaveProperty('isExcluded');
    expect(passings[0]).not.toHaveProperty('isValid');
    expect(isPassingExcluded(passings[0]!)).toBe(true);
    expect(isPassingValid(passings[0]!)).toBe(false);
  });

  it('ignores race crossings under the minimum lap time when calculating the next lap', () => {
    const { participant, source, startFlag } = createLapCalculationFixture();
    const passings: ParticipantPassingRecord[] = [
      {
        elapsedTime: 30000,
        id: createTimeRecordId('race-passing-under-minimum'),
        participantId: participant.id,
        recordType: RECORD_TX_CROSSING,
        sequence: 2,
        source,
        time: new Date('2026-05-29T10:00:30.000Z'),
      },
      {
        elapsedTime: 90000,
        id: createTimeRecordId('race-passing-valid'),
        participantId: participant.id,
        recordType: RECORD_TX_CROSSING,
        sequence: 3,
        source,
        time: new Date('2026-05-29T10:01:30.000Z'),
      },
    ];

    calculateParticipantLapTimes(startFlag, passings, participant, 60000, 'race');

    expect(passings[0]).toEqual(expect.objectContaining({
      lapTime: 30000,
      startingLapRecordId: startFlag.id,
      unrelatedReasonCode: CROSSING_UNRELATED_LAP_UNDER_MINIMUM,
    }));
    expect(passings[1]).toEqual(expect.objectContaining({
      lapNo: 1,
      lapTime: 90000,
      startingLapRecordId: startFlag.id,
    }));
    expect(passings[0]).not.toHaveProperty('isExcluded');
    expect(passings[0]).not.toHaveProperty('isValid');
    expect(isPassingExcluded(passings[0]!)).toBe(true);
    expect(isPassingValid(passings[0]!)).toBe(false);
    expect(passings[1]).not.toHaveProperty('isExcluded');
    expect(passings[1]).not.toHaveProperty('isValid');
    expect(isPassingExcluded(passings[1]!)).toBe(false);
    expect(isPassingValid(passings[1]!)).toBe(true);
  });

  it('uses the green flag instead of a pre-start crossing when validating the first lap', () => {
    const { participant, source, startFlag } = createLapCalculationFixture();
    const preStartPassing: ParticipantPassingRecord = {
      id: createTimeRecordId('pre-start-passing'),
      lineNumber: 1,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 1,
      source,
      time: new Date('2026-05-29T09:59:30.000Z'),
    };
    const firstPassingAfterGreen: ParticipantPassingRecord = {
      id: createTimeRecordId('first-passing-after-green'),
      lineNumber: 1,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 3,
      source,
      time: new Date('2026-05-29T10:00:30.000Z'),
    };

    calculateParticipantLapTimes(startFlag, [preStartPassing, firstPassingAfterGreen], participant, 60000, 'race', [1]);

    expect(firstPassingAfterGreen).toEqual(expect.objectContaining({
      lapTime: 60000,
      startingLapRecordId: preStartPassing.id,
      unrelatedReasonCode: CROSSING_UNRELATED_LAP_UNDER_MINIMUM,
    }));
  });

  it('uses non-race crossings under the minimum lap time as the next lap start reference', () => {
    const { participant, source, startFlag } = createLapCalculationFixture();
    const passings: ParticipantPassingRecord[] = [
      {
        elapsedTime: 30000,
        id: createTimeRecordId('qualifying-passing-under-minimum'),
        participantId: participant.id,
        recordType: RECORD_TX_CROSSING,
        sequence: 2,
        source,
        time: new Date('2026-05-29T10:00:30.000Z'),
      },
      {
        elapsedTime: 90000,
        id: createTimeRecordId('qualifying-passing-valid'),
        participantId: participant.id,
        recordType: RECORD_TX_CROSSING,
        sequence: 3,
        source,
        time: new Date('2026-05-29T10:01:30.000Z'),
      },
    ];

    calculateParticipantLapTimes(startFlag, passings, participant, 60000, 'qualifying');

    expect(passings[0]).toEqual(expect.objectContaining({
      lapTime: 30000,
      startingLapRecordId: startFlag.id,
      unrelatedReasonCode: CROSSING_UNRELATED_LAP_UNDER_MINIMUM,
    }));
    expect(passings[1]).toEqual(expect.objectContaining({
      lapNo: 1,
      lapTime: 60000,
      startingLapRecordId: passings[0]?.id,
    }));
    expect(passings[0]).not.toHaveProperty('isExcluded');
    expect(passings[0]).not.toHaveProperty('isValid');
    expect(isPassingExcluded(passings[0]!)).toBe(true);
    expect(isPassingValid(passings[0]!)).toBe(false);
    expect(passings[1]).not.toHaveProperty('isExcluded');
    expect(passings[1]).not.toHaveProperty('isValid');
    expect(isPassingExcluded(passings[1]!)).toBe(false);
    expect(isPassingValid(passings[1]!)).toBe(true);
  });

  it('keeps sector crossings below the minimum lap time visible without a warning', () => {
    const { participant, source, startFlag } = createLapCalculationFixture();
    const passings: ParticipantPassingRecord[] = [
      {
        elapsedTime: 30000,
        id: createTimeRecordId('sector-passing-under-minimum'),
        isLapCompletion: false,
        lineNumber: 5,
        participantId: participant.id,
        recordType: RECORD_TX_CROSSING,
        sequence: 2,
        source,
        time: new Date('2026-05-29T10:00:30.000Z'),
      },
    ];

    calculateParticipantLapTimes(startFlag, passings, participant, 60000, 'race', [1]);

    expect(passings[0]).toEqual(expect.objectContaining({
      elapsedTime: 30000,
      lapNo: 0,
      lapTime: 30000,
      startingLapRecordId: startFlag.id,
    }));
    expect(((passings[0]?.infoFlags ?? 0) & CROSSING_FLAG_LAP_UNDER_MINIMUM)).toBe(0);
    expect(passings[0]).not.toHaveProperty('unrelatedReason');
    expect(passings[0]).not.toHaveProperty('unrelatedReasonCode');
    expect(passings[0]).not.toHaveProperty('isExcluded');
    expect(passings[0]).not.toHaveProperty('isValid');
    expect(isPassingExcluded(passings[0]!)).toBe(false);
    expect(isPassingValid(passings[0]!)).toBe(true);
  });

  it('treats an unset non-finish loop crossing as sector time so far', () => {
    const { participant, source, startFlag } = createLapCalculationFixture();
    const passings: ParticipantPassingRecord[] = [
      {
        elapsedTime: 30000,
        id: createTimeRecordId('sector-passing-without-lap-flag'),
        lineNumber: 5,
        loopNumber: 1,
        participantId: participant.id,
        recordType: RECORD_TX_CROSSING,
        sequence: 2,
        source,
        time: new Date('2026-05-29T10:00:30.000Z'),
      },
    ];

    calculateParticipantLapTimes(startFlag, passings, participant, 60000, 'race', [1]);

    expect(passings[0]).toEqual(expect.objectContaining({
      elapsedTime: 30000,
      lapNo: 0,
      lapTime: 30000,
      loopNumber: 1,
      startingLapRecordId: startFlag.id,
    }));
    expect(((passings[0]?.infoFlags ?? 0) & CROSSING_FLAG_LAP_UNDER_MINIMUM)).toBe(0);
    expect(passings[0]).not.toHaveProperty('unrelatedReason');
    expect(passings[0]).not.toHaveProperty('unrelatedReasonCode');
    expect(passings[0]).not.toHaveProperty('isExcluded');
    expect(passings[0]).not.toHaveProperty('isValid');
    expect(isPassingExcluded(passings[0]!)).toBe(false);
    expect(isPassingValid(passings[0]!)).toBe(true);
  });

  it('counts only valid included crossings on configured finish lines as laps', () => {
    const { participant, source } = createLapCalculationFixture();
    const finishCrossing: ParticipantPassingRecord = {
      elapsedTime: 60000,
      id: createTimeRecordId('pit-finish-crossing'),
      isValid: true,
      lapNo: 1,
      lapTime: 60000,
      lineNumber: 9,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 2,
      source,
      time: new Date('2026-05-29T10:01:00.000Z'),
    };
    const sectorCrossing: ParticipantPassingRecord = {
      ...finishCrossing,
      id: createTimeRecordId('sector-crossing'),
      lineNumber: 2,
    };
    const excludedFinishCrossing: ParticipantPassingRecord = {
      ...finishCrossing,
      id: createTimeRecordId('excluded-finish-crossing'),
      isExcluded: true,
    };

    expect(isCountedLapPassing(finishCrossing, [1, 9])).toBe(true);
    expect(isCountedLapPassing(sectorCrossing, [1, 9])).toBe(false);
    expect(isCountedLapPassing(excludedFinishCrossing, [1, 9])).toBe(false);
  });

  it('excludes participant laps when the participant category is not assigned to the session', () => {
    const { categoryId, participant, source, startFlag } = createLapCalculationFixture();
    const otherCategoryId = createCategoryId('other-session-category');
    const crossing: ParticipantPassingRecord = {
      id: createTimeRecordId('session-category-crossing'),
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 2,
      source,
      time: new Date('2026-05-29T10:01:30.000Z'),
    };

    const laps = processAllParticipantLaps(
      [startFlag, crossing],
      new Map([[participant.id, participant]]),
      60000,
      true,
      'race',
      [1],
      new Set([otherCategoryId])
    );

    expect(laps.get(participant.id)).toEqual([expect.objectContaining({
      id: crossing.id,
      lapNo: undefined,
      unrelatedReason: 'Participant category is not assigned to this session.',
      unrelatedReasonCode: CROSSING_UNRELATED_SESSION_CATEGORY,
    })]);
    expect(isPassingExcluded(laps.get(participant.id)?.[0]!)).toBe(true);
    expect(isPassingValid(laps.get(participant.id)?.[0]!)).toBe(false);
    expect(categoryId).not.toBe(otherCategoryId);
  });
});
