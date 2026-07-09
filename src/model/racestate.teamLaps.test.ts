import type { ChipCrossingData } from './chipcrossing.js';
import type { EventCategory } from './eventcategory.js';
import type { EventParticipant } from './eventparticipant.js';
import { Session } from './racestate.js';
import { CROSSING_UNRELATED_LAP_UNDER_MINIMUM, type ParticipantPassingRecord } from './timerecord.js';
import { createGreenFlagEvent } from '../controllers/flag.js';

const category: EventCategory = { id: '1', name: 'Team Category' };

const participant = (id: string, racePlate: string, txNo: number): EventParticipant => ({
  categoryId: category.id,
  currentResult: undefined,
  entrantId: '201',
  firstname: `Rider ${racePlate}`,
  id,
  identifiers: [
    { fromTime: undefined, racePlate, toTime: undefined },
    { fromTime: undefined, toTime: undefined, txNo },
  ] as unknown as EventParticipant['identifiers'],
  lastRecordTime: null,
  resultDuration: null,
  surname: 'Team',
});

const participantWithAssignedTransponder = (
  id: string,
  racePlate: string,
  txNo: number,
  fromTime?: Date
): EventParticipant => ({
  categoryId: category.id,
  currentResult: undefined,
  entrantId: '201',
  firstname: `Rider ${racePlate}`,
  id,
  identifiers: [
    { fromTime: undefined, racePlate, toTime: undefined },
    { fromTime, toTime: undefined, txNo },
  ] as unknown as EventParticipant['identifiers'],
  lastRecordTime: null,
  resultDuration: null,
  surname: 'Team',
});

const chipCrossing = (
  id: string,
  chipCode: number,
  sequence: number,
  time: string
): ChipCrossingData => ({
  chipCode,
  id,
  recordType: 16,
  sequence,
  source: 'test',
  time: new Date(time),
});

describe('Session team lap processing', () => {
  it('reprocesses incremental team crossings against the last crossing by any team member', async () => {
    const session = new Session({
      categories: [category],
      participants: [
        participant('101', '11', 1001),
        participant('102', '12', 1002),
      ],
      records: [],
      teams: [],
    });

    await session.addRecords([
      createGreenFlagEvent({
        categoryIds: [category.id],
        flagValue: 'course',
        id: '1',
        recordType: 4,
        sequence: 1,
        source: 'test',
        time: new Date('2026-05-30T10:00:00.000Z'),
      }),
    ]);
    await session.addRecords([chipCrossing('1001', 1001, 2, '2026-05-30T10:06:00.000Z')]);
    await session.addRecords([chipCrossing('1002', 1002, 3, '2026-05-30T10:12:00.000Z')]);
    await session.addRecords([chipCrossing('1003', 1001, 4, '2026-05-30T10:18:00.000Z')]);

    const riderOneLaps = session.getParticipantLaps('101') || [];
    const riderTwoLaps = session.getParticipantLaps('102') || [];

    expect(riderOneLaps.map((record) => record.lapNo)).toEqual([1, 3]);
    expect(riderTwoLaps[0].lapNo).toBe(2);
    expect(riderOneLaps[1].startingLapRecordId).toBe('1002');
    expect(riderOneLaps[1].lapTime).toBe(360000);
  });

  it('excludes team crossings before the green flag from lap counts and lap times', async () => {
    const session = new Session({
      categories: [category],
      participants: [
        participant('101', '11', 1001),
        participant('102', '12', 1002),
      ],
      records: [],
      teams: [],
    });

    await session.addRecords([
      createGreenFlagEvent({
        categoryIds: [category.id],
        flagValue: 'course',
        id: '1',
        recordType: 4,
        sequence: 2,
        source: 'test',
        time: new Date('2026-05-30T10:10:00.000Z'),
      }),
    ]);
    await session.addRecords([chipCrossing('1001', 1001, 1, '2026-05-30T10:06:00.000Z')]);
    await session.addRecords([chipCrossing('1002', 1002, 3, '2026-05-30T10:16:00.000Z')]);

    const riderOneLaps = session.getParticipantLaps('101') || [];
    const riderTwoLaps = session.getParticipantLaps('102') || [];

    expect(riderOneLaps[0].isValid).toBe(false);
    expect(riderOneLaps[0].isExcluded).toBe(true);
    expect(riderOneLaps[0].elapsedTime).toBeUndefined();
    expect(riderOneLaps[0].lapNo).toBeUndefined();
    expect(riderOneLaps[0].lapTime).toBeUndefined();
    expect(riderTwoLaps[0].isValid).toBe(true);
    expect(riderTwoLaps[0].lapNo).toBe(1);
    expect(riderTwoLaps[0].lapTime).toBe(360000);
  });

  it('toggles manually excluded crossings out of and back into lap calculations', async () => {
    const session = new Session({
      categories: [category],
      participants: [participant('101', '11', 1001)],
      records: [],
      teams: [],
    });

    await session.addRecords([
      createGreenFlagEvent({
        categoryIds: [category.id],
        flagValue: 'course',
        id: '1',
        recordType: 4,
        sequence: 1,
        source: 'test',
        time: new Date('2026-05-30T10:00:00.000Z'),
      }),
      chipCrossing('1001', 1001, 2, '2026-05-30T10:06:00.000Z'),
      chipCrossing('1002', 1001, 3, '2026-05-30T10:12:00.000Z'),
      chipCrossing('1003', 1001, 4, '2026-05-30T10:18:00.000Z'),
    ]);

    session.excludeCrossing('1002', true);

    let laps = session.getParticipantLaps('101') || [];
    expect(laps.map((record) => record.id)).toEqual(['1001', '1002', '1003']);
    expect(laps[1]).toMatchObject({ isExcluded: true, isManuallyExcluded: true, isValid: false, lapNo: undefined });
    expect(laps[2]).toMatchObject({ isExcluded: false, isValid: true, lapNo: 2, lapTime: 720000, startingLapRecordId: '1001' });

    session.excludeCrossing('1002', false);

    laps = session.getParticipantLaps('101') || [];
    expect(laps[1]).toMatchObject({ isExcluded: false, isManuallyExcluded: false, isValid: true, lapNo: 2, lapTime: 360000, startingLapRecordId: '1001' });
    expect(laps[2]).toMatchObject({ isExcluded: false, isValid: true, lapNo: 3, lapTime: 360000, startingLapRecordId: '1002' });
  });

  it('reassigns unmatched crossings and recalculates laps when participant identifiers change', async () => {
    const session = new Session({
      categories: [category],
      participants: [participant('101', '11', 1001)],
      records: [
        createGreenFlagEvent({
        categoryIds: [category.id],
        flagValue: 'course',
        id: '1',
        recordType: 4,
        sequence: 1,
        source: 'test',
        time: new Date('2026-05-30T10:00:00.000Z'),
      }),
        chipCrossing('1001', 2002, 2, '2026-05-30T10:06:00.000Z'),
      ],
      teams: [],
    });

    expect((session.records.find((record) => record.id === '1001') as ParticipantPassingRecord | undefined)?.participantId).toBeUndefined();

    session.updateParticipantIdentifiers('101', 'txNo', ['2002']);

    const updatedCrossing = session.records.find((record) => record.id === '1001') as ParticipantPassingRecord | undefined;
    expect(updatedCrossing?.participantId).toBe('101');
    expect(session.getParticipantLaps('101')?.[0].lapNo).toBe(1);
  });

  it('does not count transponder crossings before the assignment time', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const session = new Session({
      categories: [category],
      participants: [participantWithAssignedTransponder('101', '11', 1001, new Date('2026-05-30T10:10:00.000Z'))],
      records: [],
      teams: [],
    });

    await session.addRecords([
      createGreenFlagEvent({
        categoryIds: [category.id],
        flagValue: 'course',
        id: '1',
        recordType: 4,
        sequence: 1,
        source: 'test',
        time: new Date('2026-05-30T10:00:00.000Z'),
      }),
      chipCrossing('1001', 1001, 2, '2026-05-30T10:06:00.000Z'),
      chipCrossing('1002', 1001, 3, '2026-05-30T10:12:00.000Z'),
    ]);

    const earlyCrossing = session.records.find((record) => record.id === '1001') as ParticipantPassingRecord | undefined;
    const assignedCrossing = session.records.find((record) => record.id === '1002') as ParticipantPassingRecord | undefined;
    expect(earlyCrossing?.participantId).toBeUndefined();
    expect(assignedCrossing?.participantId).toBe('101');
    expect(session.getParticipantLaps('101')?.map((record) => record.id)).toEqual(['1002']);
    warnSpy.mockRestore();
  });

  it('counts transponder crossings when no assignment time is present', async () => {
    const session = new Session({
      categories: [category],
      participants: [participantWithAssignedTransponder('101', '11', 1001, undefined)],
      records: [],
      teams: [],
    });

    await session.addRecords([
      createGreenFlagEvent({
        categoryIds: [category.id],
        flagValue: 'course',
        id: '1',
        recordType: 4,
        sequence: 1,
        source: 'test',
        time: new Date('2026-05-30T10:00:00.000Z'),
      }),
      chipCrossing('1001', 1001, 2, '2026-05-30T10:06:00.000Z'),
    ]);

    const crossing = session.records.find((record) => record.id === '1001') as ParticipantPassingRecord | undefined;
    expect(crossing?.participantId).toBe('101');
    expect(session.getParticipantLaps('101')?.map((record) => record.id)).toEqual(['1001']);
  });

  it('uses non-lap timing lines as split references without incrementing the lap count', async () => {
    const session = new Session({
      categories: [category],
      participants: [participant('101', '11', 1001)],
      records: [],
      teams: [],
    });
    const sectorCrossing = {
      ...chipCrossing('1001', 1001, 2, '2026-05-30T10:01:00.000Z'),
      isLapCompletion: false,
      lineNumber: 3,
      loopNumber: 9,
    } as ParticipantPassingRecord;
    const finishCrossing = chipCrossing('1002', 1001, 3, '2026-05-30T10:02:00.000Z');

    await session.addRecords([
      createGreenFlagEvent({
        categoryIds: [category.id],
        flagValue: 'course',
        id: '1',
        recordType: 4,
        sequence: 1,
        source: 'test',
        time: new Date('2026-05-30T10:00:00.000Z'),
      }),
      sectorCrossing,
      finishCrossing,
    ]);

    const laps = session.getParticipantLaps('101') || [];

    expect(laps.map((record) => record.id)).toEqual(['1001', '1002']);
    expect(laps[0]).toMatchObject({
      isExcluded: false,
      isLapCompletion: false,
      isValid: true,
      lapNo: 0,
      lineNumber: 3,
      loopNumber: 9,
      lapTime: 60000,
      startingLapRecordId: '1',
    });
    expect(laps[1]).toMatchObject({
      isExcluded: false,
      isValid: true,
      lapNo: 1,
      lapTime: 120000,
      startingLapRecordId: '1',
    });
  });

  it('only warns for short sector crossings when the same line is repeated too quickly', async () => {
    const session = new Session({
      categories: [category],
      participants: [participant('101', '11', 1001)],
      records: [],
      teams: [],
    });
    session.setMinimumLapTimeMilliseconds(60000);

    await session.addRecords([
      createGreenFlagEvent({
        categoryIds: [category.id],
        flagValue: 'course',
        id: '1',
        recordType: 4,
        sequence: 1,
        source: 'test',
        time: new Date('2026-05-30T10:00:00.000Z'),
      }),
      { ...chipCrossing('1001', 1001, 2, '2026-05-30T10:01:00.000Z'), isLapCompletion: false, lineNumber: 3 } as ParticipantPassingRecord,
      { ...chipCrossing('1002', 1001, 3, '2026-05-30T10:01:20.000Z'), isLapCompletion: false, lineNumber: 3 } as ParticipantPassingRecord,
      chipCrossing('1003', 1001, 4, '2026-05-30T10:02:00.000Z'),
    ]);

    const laps = session.getParticipantLaps('101') || [];
    expect(laps[0]?.unrelatedReasonCode).toBeUndefined();
    expect(laps[1]).toMatchObject({
      isExcluded: false,
      isValid: true,
      unrelatedReasonCode: CROSSING_UNRELATED_LAP_UNDER_MINIMUM,
    });
    expect(laps[2]).toMatchObject({
      isExcluded: false,
      lapNo: 1,
      startingLapRecordId: '1',
    });
  });
});
