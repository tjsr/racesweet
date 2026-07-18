import type { ChipCrossingData } from './chipcrossing.js';
import type { CtcTrackConfig } from './ctcTrackConfig.js';
import type { EventCategory } from './eventcategory.js';
import type { EventParticipant } from './eventparticipant.js';
import { Session } from './racestate.js';
import { CROSSING_UNRELATED_LAP_UNDER_MINIMUM, isPassingExcluded, isPassingValid, type ParticipantPassingRecord, type TimeRecordSource } from './timerecord.js';
import { createGreenFlagEvent } from '../controllers/flag.js';
import { createTimeRecordId } from './ids.js';

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

    expect(riderOneLaps[0]).not.toHaveProperty('isValid');
    expect(riderOneLaps[0]).not.toHaveProperty('isExcluded');
    expect(isPassingValid(riderOneLaps[0]!)).toBe(false);
    expect(isPassingExcluded(riderOneLaps[0]!)).toBe(true);
    expect(riderOneLaps[0].elapsedTime).toBeUndefined();
    expect(riderOneLaps[0].lapNo).toBeUndefined();
    expect(riderOneLaps[0].lapTime).toBeUndefined();
    expect(isPassingValid(riderTwoLaps[0]!)).toBe(true);
    expect(riderTwoLaps[0].lapNo).toBe(1);
    expect(riderTwoLaps[0].lapTime).toBe(360000);
  });

  it('recalculates all lap results when a crossing time is edited', async () => {
    const session = new Session({
      categories: [category],
      participants: [participant('101', '11', 1001)],
      records: [
        createGreenFlagEvent({
          categoryIds: [category.id],
          flagValue: 'course',
          id: 'flag-100',
          recordType: 4,
          sequence: 100,
          source: 'test',
          time: new Date('2026-05-30T10:00:00.000Z'),
        }),
        chipCrossing('1001', 1001, 1, '2026-05-30T10:06:00.000Z'),
        chipCrossing('1002', 1001, 2, '2026-05-30T10:12:00.000Z'),
      ],
      teams: [],
    });

    expect(session.getParticipantLaps('101')).toMatchObject([
      { id: '1001', lapNo: 1, lapTime: 360000 },
      { id: '1002', lapNo: 2, lapTime: 360000 },
    ]);

    session.updateRecord(chipCrossing('1002', 1001, 2, '2026-05-30T10:04:00.000Z'));

    expect(session.getParticipantLaps('101')).toMatchObject([
      { id: '1002', elapsedTime: 240000, lapNo: 1, lapTime: 240000 },
      { id: '1001', elapsedTime: 360000, lapNo: 2, lapTime: 120000 },
    ]);
  });

  it('includes generated crossings in lap results and recalculates them after editing', async () => {
    const session = new Session({
      categories: [category],
      participants: [participant('101', '11', 1001)],
      records: [
        createGreenFlagEvent({
          categoryIds: [category.id],
          flagValue: 'course',
          id: 'flag-generated',
          recordType: 4,
          sequence: 1,
          source: 'test',
          time: new Date('2026-05-30T10:00:00.000Z'),
        }),
        chipCrossing('generated-before', 1001, 2, '2026-05-30T10:06:00.000Z'),
        chipCrossing('generated-after', 1001, 4, '2026-05-30T10:12:00.000Z'),
      ],
      teams: [],
    });
    const generatedCrossing: ParticipantPassingRecord = {
      generatedReason: 'missing-crossing',
      id: createTimeRecordId(),
      isGenerated: true,
      participantId: '101',
      recordType: 16,
      sequence: 3,
      source: 'generated-missing-crossing',
      time: new Date('2026-05-30T10:09:00.000Z'),
    };

    await session.addRecords([generatedCrossing]);

    expect(session.getParticipantLaps('101')).toMatchObject([
      { id: 'generated-before', lapNo: 1, lapTime: 360000 },
      { id: generatedCrossing.id, lapNo: 2, lapTime: 180000 },
      { id: 'generated-after', lapNo: 3, lapTime: 180000 },
    ]);

    session.updateRecord({ ...generatedCrossing, time: new Date('2026-05-30T10:10:00.000Z') });

    const updatedGeneratedCrossing = session.records.find((record) => record.id === generatedCrossing.id);
    expect(updatedGeneratedCrossing).toMatchObject({ participantId: '101' });
    expect(updatedGeneratedCrossing).not.toHaveProperty('isExcluded');
    expect(session.getParticipantLaps('101')).toMatchObject([
      { id: 'generated-before', lapTime: 360000 },
      { id: generatedCrossing.id, lapTime: 240000 },
      { id: 'generated-after', lapTime: 120000 },
    ]);
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
    expect(laps[1]).toMatchObject({ isExcluded: true, isManuallyExcluded: true, lapNo: undefined });
    expect(laps[1]).not.toHaveProperty('isValid');
    expect(isPassingExcluded(laps[1]!)).toBe(true);
    expect(isPassingValid(laps[1]!)).toBe(false);
    expect(laps[2]).toMatchObject({ lapNo: 2, lapTime: 720000, startingLapRecordId: '1001' });
    expect(isPassingExcluded(laps[2]!)).toBe(false);
    expect(isPassingValid(laps[2]!)).toBe(true);

    session.excludeCrossing('1002', false);

    laps = session.getParticipantLaps('101') || [];
    expect(laps[1]).toMatchObject({ isManuallyExcluded: false, lapNo: 2, lapTime: 360000, startingLapRecordId: '1001' });
    expect(laps[1]).not.toHaveProperty('isExcluded');
    expect(laps[1]).not.toHaveProperty('isValid');
    expect(isPassingExcluded(laps[1]!)).toBe(false);
    expect(isPassingValid(laps[1]!)).toBe(true);
    expect(laps[2]).toMatchObject({ lapNo: 3, lapTime: 360000, startingLapRecordId: '1002' });
    expect(isPassingExcluded(laps[2]!)).toBe(false);
    expect(isPassingValid(laps[2]!)).toBe(true);
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
      isLapCompletion: false,
      lapNo: 0,
      lineNumber: 3,
      loopNumber: 9,
      lapTime: 60000,
      startingLapRecordId: '1',
    });
    expect(isPassingExcluded(laps[0]!)).toBe(false);
    expect(isPassingValid(laps[0]!)).toBe(true);
    expect(laps[1]).toMatchObject({
      lapNo: 1,
      lapTime: 120000,
      startingLapRecordId: '1',
    });
    expect(isPassingExcluded(laps[1]!)).toBe(false);
    expect(isPassingValid(laps[1]!)).toBe(true);
  });

  it('derives lap completion from the current source configuration and recalculates when it changes', async () => {
    const createTrackConfig = (isLapCompletion: boolean): CtcTrackConfig => ({
      eventDescriptions: {},
      networks: [{
        lines: [{
          line: 1,
          loops: [{ card: 1, comPort: 1, isLapCompletion, loopNumber: 9, siteAddress: 31 }],
          name: 'Start/Finish',
        }],
        name: 'Track',
      }],
    });
    const createSource = (isLapCompletion: boolean): TimeRecordSource => ({
      ctcTrackConfig: createTrackConfig(isLapCompletion),
      id: 'test',
      name: 'CTC',
    });
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
        {
          ...chipCrossing('1001', 1001, 2, '2026-05-30T10:06:00.000Z'),
          lineNumber: 1,
          loopNumber: 9,
          sourceLineNumber: 31,
        } as ParticipantPassingRecord,
      ],
      teams: [],
      timeRecordSources: [createSource(false)],
    });

    expect(session.getParticipantLaps('101')?.[0]).toMatchObject({ lapNo: 0, lapTime: 360000 });

    session.addTimeRecordSources([createSource(true)]);

    expect(session.getParticipantLaps('101')?.[0]).toMatchObject({ lapNo: 1, lapTime: 360000 });
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
    expect(laps[1]?.unrelatedReasonCode).toBeUndefined();
    expect(isPassingExcluded(laps[1]!)).toBe(false);
    expect(isPassingValid(laps[1]!)).toBe(true);
    expect(laps[2]).toMatchObject({
      lapNo: 1,
      startingLapRecordId: '1',
    });
    expect(isPassingExcluded(laps[2]!)).toBe(false);
    expect(isPassingValid(laps[2]!)).toBe(true);
  });
});
