import type { ApicalLapByCategory } from '../model/apical.js';
import { createTimeRecordId } from '../model/ids.js';
import { processAllParticipantLaps } from '../processing/laps.js';
import { apicalTimeOfDayToDate, apicalTimeToMilliseconds, convertDataToRaceState, createChipCrossingRecord } from './apical.js';
import { excelTimeToMilliseconds } from './genericTimeParser.js';

const eventId = '7b83ad1e-54ba-5f00-9712-1c82d3178640';

describe('Apical parser', () => {
  it('creates chip crossing timestamps from TimeOfDay on the session date', () => {
    const crossing = createChipCrossingRecord(
      {
        CumulativeLapTimeSpan: '12:03:30.5000000',
        FullName: 'Robert WOOD',
        Id: 1242,
        LapNumber: 2,
        LapTimeSpan: '11:02:00.0000000',
        RaceNumber: '306',
        TimeOfDay: '10:15:30.2500000',
      },
      new Date('2026-06-07T00:00:00.000Z'),
      200306,
      eventId,
      'UTC'
    );

    expect(crossing.time!.toISOString()).toBe('2026-06-07T10:15:30.250Z');
    expect(crossing.id).toBe(createTimeRecordId([
      'apical-crossing',
      eventId,
      1242,
      '306',
      2,
      200306,
      '2026-06-07T10:15:30.250Z',
    ].join(':')));
  });

  it('converts Excel time fractions to milliseconds', () => {
    expect(excelTimeToMilliseconds(0.0202351041666667)).toBe(1748313);
  });

  it('chooses Excel time parsing for numeric Apical lap values', () => {
    expect(apicalTimeToMilliseconds(0.0202351041666667)).toBe(1748313);
    expect(apicalTimeToMilliseconds('00:29:08.3130000')).toBe(1748313);
  });

  it('combines numeric Excel TimeOfDay values with the session date', () => {
    expect(apicalTimeOfDayToDate(new Date('2026-06-07T13:45:00.000Z'), 0.5, 'UTC').toISOString()).toBe('2026-06-07T12:00:00.000Z');
  });

  it('combines TimeOfDay values with the session date in the event time zone', () => {
    expect(apicalTimeOfDayToDate(new Date('2026-06-07T00:00:00.000Z'), '10:15:30.2500000', 'Australia/Sydney').toISOString()).toBe('2026-06-07T00:15:30.250Z');
  });

  it('creates chip crossing timestamps from numeric Excel TimeOfDay values', () => {
    const crossing = createChipCrossingRecord(
      {
        CumulativeLapTimeSpan: 0.0202351041666667,
        FullName: 'Robert WOOD',
        Id: 1243,
        LapNumber: 1,
        LapTimeSpan: 0.0202351041666667,
        RaceNumber: '306',
        TimeOfDay: 0.5,
      },
      new Date('2026-06-07T00:00:00.000Z'),
      200306,
      eventId,
      'UTC'
    );

    expect(crossing.time!.toISOString()).toBe('2026-06-07T12:00:00.000Z');
    expect(crossing.id).toBe(createTimeRecordId([
      'apical-crossing',
      eventId,
      1243,
      '306',
      1,
      200306,
      '2026-06-07T12:00:00.000Z',
    ].join(':')));
  });

  it('converts Apical results into entrants, categories, and ordered crossing times', () => {
    const data: ApicalLapByCategory = [
      {
        CategoryName: 'A',
        ParticipantViewModels: [
          {
            CategoryName: 'A',
            LapByCategoryViewModels: [
              {
                CumulativeLapTimeSpan: '00:01:30.2500000',
                CumulativeSeconds: 90.25,
                FullName: 'Robert WOOD',
                Id: 1241,
                LapNumber: 1,
                LapTimeSpan: '00:01:30.2500000',
                RaceNumber: '306',
                TimeOfDay: '10:01:30.2500000',
              },
              {
                CumulativeLapTimeSpan: '23:03:30.5000000',
                CumulativeSeconds: 210.5,
                FullName: 'Robert WOOD',
                Id: 1242,
                LapNumber: 2,
                LapTimeSpan: '22:02:00.2500000',
                RaceNumber: '306',
                TimeOfDay: '10:03:30.5000000',
              },
            ],
            NumberOfLaps: 2,
            Position: 1,
            RaceNumbers: '306',
            TeamNameDisplay: 'Robert WOOD',
            TotalTimeSpan: '00:03:30.5000000',
          },
        ],
      },
    ];

    const raceState = convertDataToRaceState(eventId, new Date('2026-06-07T00:00:00.000Z'), data, 200000, 'UTC');

    expect(raceState.categories).toEqual([
      expect.objectContaining({
        code: 'A',
        name: 'A',
      }),
    ]);
    expect(raceState.participants).toEqual([
      expect.objectContaining({
        firstname: 'Robert',
        surname: 'WOOD',
      }),
    ]);
    expect(raceState.records?.map((record) => record.time!.toISOString())).toEqual([
      '2026-06-07T10:00:00.000Z',
      '2026-06-07T10:01:30.250Z',
      '2026-06-07T10:03:30.500Z',
    ]);
    expect(raceState.records?.[0]).toEqual(expect.objectContaining({
      categoryIds: [raceState.categories![0]!.id],
      flagType: 'green',
      flagValue: 'course',
      indicatesRaceStart: true,
    }));
    expect(raceState.records?.map((record) => ('sequence' in record ? record.sequence : undefined))).toEqual([1, 2, 3]);
  });

  it('creates averaged category green flags and groups category starts within one second', () => {
    const data: ApicalLapByCategory = [
      {
        CategoryName: 'A',
        ParticipantViewModels: [
          {
            CategoryName: 'A',
            LapByCategoryViewModels: [
              {
                CumulativeLapTimeSpan: '00:01:30.0000000',
                CumulativeSeconds: 90,
                FullName: 'Alice RIDER',
                Id: 2101,
                LapNumber: 1,
                LapTimeSpan: '00:01:30.0000000',
                RaceNumber: '21',
                TimeOfDay: '10:01:30.0000000',
              },
              {
                CumulativeLapTimeSpan: '00:03:00.0000000',
                CumulativeSeconds: 179.5,
                FullName: 'Alice RIDER',
                Id: 2102,
                LapNumber: 2,
                LapTimeSpan: '00:01:29.5000000',
                RaceNumber: '21',
                TimeOfDay: '10:03:00.0000000',
              },
            ],
            NumberOfLaps: 2,
            Position: 1,
            RaceNumbers: '21',
            TeamNameDisplay: 'Alice RIDER',
            TotalTimeSpan: '00:03:00.0000000',
          },
        ],
      },
      {
        CategoryName: 'B',
        ParticipantViewModels: [
          {
            CategoryName: 'B',
            LapByCategoryViewModels: [
              {
                CumulativeLapTimeSpan: '00:01:30.0000000',
                CumulativeSeconds: 90,
                FullName: 'Bob RIDER',
                Id: 2201,
                LapNumber: 1,
                LapTimeSpan: '00:01:30.0000000',
                RaceNumber: '22',
                TimeOfDay: '10:01:31.0000000',
              },
            ],
            NumberOfLaps: 1,
            Position: 1,
            RaceNumbers: '22',
            TeamNameDisplay: 'Bob RIDER',
            TotalTimeSpan: '00:01:30.0000000',
          },
        ],
      },
      {
        CategoryName: 'C',
        ParticipantViewModels: [
          {
            CategoryName: 'C',
            LapByCategoryViewModels: [
              {
                CumulativeLapTimeSpan: '00:01:30.0000000',
                CumulativeSeconds: 90,
                FullName: 'Cam RIDER',
                Id: 2301,
                LapNumber: 1,
                LapTimeSpan: '00:01:30.0000000',
                RaceNumber: '23',
                TimeOfDay: '10:01:32.0000000',
              },
            ],
            NumberOfLaps: 1,
            Position: 1,
            RaceNumbers: '23',
            TeamNameDisplay: 'Cam RIDER',
            TotalTimeSpan: '00:01:30.0000000',
          },
        ],
      },
    ];

    const raceState = convertDataToRaceState(eventId, new Date('2026-06-07T00:00:00.000Z'), data, 200000, 'UTC');
    const categoryA = raceState.categories!.find((category) => category.name === 'A')!;
    const categoryB = raceState.categories!.find((category) => category.name === 'B')!;
    const categoryC = raceState.categories!.find((category) => category.name === 'C')!;
    const greenFlags = raceState.records!.filter((record) => 'flagType' in record && record.flagType === 'green');

    expect(greenFlags).toHaveLength(2);
    expect(greenFlags[0]).toEqual(expect.objectContaining({
      categoryIds: [categoryA.id, categoryB.id].sort(),
      time: new Date('2026-06-07T10:00:00.250Z'),
    }));
    expect(greenFlags[1]).toEqual(expect.objectContaining({
      categoryIds: [categoryC.id],
      time: new Date('2026-06-07T10:00:02.000Z'),
    }));
  });

  it('marks the Apical Timing Error List category as excluded from results', () => {
    const data: ApicalLapByCategory = [
      {
        CategoryName: 'Timing Error List',
        ParticipantViewModels: [
          {
            CategoryName: 'Timing Error List',
            LapByCategoryViewModels: [
              {
                CumulativeLapTimeSpan: '00:01:00.0000000',
                FullName: 'Timing ERROR',
                Id: 2241,
                LapNumber: 1,
                LapTimeSpan: '00:01:00.0000000',
                RaceNumber: '999',
                TimeOfDay: '10:01:00.0000000',
              },
            ],
            NumberOfLaps: 1,
            Position: 1,
            RaceNumbers: '999',
            TeamNameDisplay: 'Timing ERROR',
            TotalTimeSpan: '00:01:00.0000000',
          },
        ],
      },
    ];

    const raceState = convertDataToRaceState(eventId, new Date('2026-06-07T00:00:00.000Z'), data, 200000, 'UTC');

    expect(raceState.categories).toEqual([
      expect.objectContaining({
        excludeFromResults: true,
        name: 'Timing Error List',
      }),
    ]);
  });

  it('imports Results sheet team entrants and calculates cumulative team laps from state records', () => {
    const expectedTeamLapCount = 3;
    const data: ApicalLapByCategory = [
      {
        CategoryName: 'Teams A',
        ParticipantViewModels: [
          {
            CategoryName: 'Teams A',
            IsTeamEntrant: true,
            LapByCategoryViewModels: [
              {
                CumulativeLapTimeSpan: '00:06:00.0000000',
                CumulativeSeconds: 360,
                FullName: 'Alice RIDER',
                Id: 101001,
                LapNumber: 1,
                LapTimeSpan: '00:06:00.0000000',
                RaceNumber: '101',
                TimeOfDay: '10:06:00.0000000',
              },
              {
                CumulativeLapTimeSpan: '00:12:00.0000000',
                CumulativeSeconds: 720,
                FullName: 'Bob RIDER',
                Id: 102001,
                LapNumber: 1,
                LapTimeSpan: '00:06:00.0000000',
                RaceNumber: '102',
                TimeOfDay: '10:12:00.0000000',
              },
              {
                CumulativeLapTimeSpan: '00:18:00.0000000',
                CumulativeSeconds: 1080,
                FullName: 'Alice RIDER',
                Id: 101002,
                LapNumber: 2,
                LapTimeSpan: '00:06:00.0000000',
                RaceNumber: '101',
                TimeOfDay: '10:18:00.0000000',
              },
            ],
            NumberOfLaps: expectedTeamLapCount,
            Position: 1,
            RaceNumbers: '101, 102',
            TeamDisplayName: 'Fast Friends',
            TeamNameDisplay: 'Fast Friends',
            TotalTimeSpan: '00:18:00.0000000',
          },
        ],
      },
    ];

    const raceState = convertDataToRaceState(eventId, new Date('2026-06-07T00:00:00.000Z'), data, 200000, 'UTC');
    const team = raceState.teams?.find((candidate) => candidate.name === 'Fast Friends');
    const category = raceState.categories?.find((candidate) => candidate.name === 'Teams A');

    expect(team).toEqual(expect.objectContaining({
      categoryId: category?.id,
      members: expect.arrayContaining(raceState.participants!.map((participant) => participant.id)),
      name: 'Fast Friends',
    }));
    expect(raceState.participants).toHaveLength(2);
    expect(raceState.participants?.map((participant) => participant.entrantId)).toEqual([
      team?.id,
      team?.id,
    ]);

    const participantsById = new Map(raceState.participants!.map((participant) => [participant.id, participant]));
    const calculatedLaps = processAllParticipantLaps(raceState.records || [], participantsById, 60000, true);
    const totalTeamLaps = raceState.participants!
      .flatMap((participant) => calculatedLaps.get(participant.id) || [])
      .filter((lap) => !lap.isExcluded && lap.lapNo !== undefined).length;

    expect(totalTeamLaps).toBe(expectedTeamLapCount);
  });
});
