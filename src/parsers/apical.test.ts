import type { ApicalLapByCategory } from '../model/apical.js';
import { convertDataToRaceState, createChipCrossingRecord } from './apical.js';

const eventId = '7b83ad1e-54ba-5f00-9712-1c82d3178640';

describe('Apical parser', () => {
  it('creates chip crossing timestamps from cumulative event time', () => {
    const crossing = createChipCrossingRecord(
      {
        CumulativeLapTimeSpan: '00:03:30.5000000',
        FullName: 'Robert WOOD',
        Id: 1242,
        LapNumber: 2,
        LapTimeSpan: '00:02:00.0000000',
        RaceNumber: '306',
      },
      new Date('2026-06-07T00:00:00.000Z'),
      200306,
      eventId
    );

    expect(crossing.time!.toISOString()).toBe('2026-06-07T00:03:30.500Z');
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
                FullName: 'Robert WOOD',
                Id: 1241,
                LapNumber: 1,
                LapTimeSpan: '00:01:30.2500000',
                RaceNumber: '306',
              },
              {
                CumulativeLapTimeSpan: '00:03:30.5000000',
                FullName: 'Robert WOOD',
                Id: 1242,
                LapNumber: 2,
                LapTimeSpan: '00:02:00.2500000',
                RaceNumber: '306',
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

    const raceState = convertDataToRaceState(eventId, new Date('2026-06-07T00:00:00.000Z'), data, 200000);

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
      '2026-06-07T00:01:30.250Z',
      '2026-06-07T00:03:30.500Z',
    ]);
    expect(raceState.records?.map((record) => ('sequence' in record ? record.sequence : undefined))).toEqual([1, 2]);
  });
});
