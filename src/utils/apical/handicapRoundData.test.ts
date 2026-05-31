import { countOccurrences, generateEventHandicapList } from './handicapRoundData.js';

import { ExtendedApicalEventListData } from './apicalEventList.js';

const makeEvent = (
  id: number,
  name: string,
  date: string,
  entrants: Array<{ name: string; category: string; confidenceFactor?: number; medianLapTime: number; ratioScore: number }>
): ExtendedApicalEventListData => ({
  CompanyName: 'Test Company',
  EventDate: date,
  EventHandicapData: {
    entrantData: entrants.map((e) => ({
      category: e.category,
      confidenceFactor: e.confidenceFactor ?? 100,
      medianLapTime: e.medianLapTime,
      name: e.name,
      ratioScore: e.ratioScore,
    })),
  },
  ExcelDataPath: `tmp/event_${id}.xlsx`,
  Id: id,
  Name: name,
  ThumbPathAndFileName: `thumb_${id}.png`,
});

describe('countOccurrences', () => {
  test('should count occurrences of a plain character', () => {
    expect(countOccurrences('hello,world,foo', ',')).toBe(2);
  });

  test('should return 0 when character is not present', () => {
    expect(countOccurrences('hello', ',')).toBe(0);
  });

  test('should escape regex special characters', () => {
    expect(countOccurrences('a.b.c', '.')).toBe(2);
  });

  test('should return 0 for empty string', () => {
    expect(countOccurrences('', ',')).toBe(0);
  });
});

describe('generateEventHandicapList', () => {
  test('should return empty map for empty event list', () => {
    const result = generateEventHandicapList([]);
    expect(result.size).toBe(0);
  });

  test('should return empty map when no events have handicap data', () => {
    const event: ExtendedApicalEventListData = {
      CompanyName: 'Co',
      EventDate: '2025-06-01',
      ExcelDataPath: '',
      Id: 1,
      Name: 'Race 1',
      ThumbPathAndFileName: '',
    };
    const result = generateEventHandicapList([event]);
    expect(result.size).toBe(0);
  });

  test('should produce comma-separated round tokens for a single event', () => {
    const events = [
      makeEvent(101, 'Race 1', '2025-06-01', [
        { category: 'Open', medianLapTime: 44, name: 'rider-a', ratioScore: 0.1 },
        { category: 'Open', medianLapTime: 51, name: 'rider-b', ratioScore: 0.8 },
      ]),
    ];

    const result = generateEventHandicapList(events);

    expect(result.get('rider-a')).toBe(',1,0.1000,44,100.000');
    expect(result.get('rider-b')).toBe(',1,0.8000,51,100.000');
  });

  test('should produce aligned rounds when rider participates in all events', () => {
    const events = [
      makeEvent(101, 'Race 1', '2025-06-01', [
        { category: 'Open', medianLapTime: 44, name: 'rider-a', ratioScore: 0.1 },
      ]),
      makeEvent(102, 'Race 2', '2025-06-08', [
        { category: 'Open', medianLapTime: 45, name: 'rider-a', ratioScore: 0.2 },
      ]),
    ];

    const result = generateEventHandicapList(events);

    expect(result.get('rider-a')).toBe(',1,0.1000,44,100.000,2,0.2000,45,100.000');
  });

  test('should pad with empty slots for rounds a rider missed', () => {
    const events = [
      makeEvent(101, 'Race 1', '2025-06-01', [
        { category: 'Open', medianLapTime: 44, name: 'rider-a', ratioScore: 0.1 },
        { category: 'Open', medianLapTime: 46, name: 'rider-b', ratioScore: 0.3 },
      ]),
      makeEvent(102, 'Race 2', '2025-06-08', [
        { category: 'Open', medianLapTime: 45, name: 'rider-a', ratioScore: 0.2 },
        // rider-b is absent
      ]),
    ];

    const result = generateEventHandicapList(events);

    expect(result.get('rider-a')).toBe(',1,0.1000,44,100.000,2,0.2000,45,100.000');
    expect(result.get('rider-b')).toBe(',1,0.3000,46,100.000,2,,,');
  });

  test('should pad first-round slot for a rider who only appears in later events', () => {
    const events = [
      makeEvent(101, 'Race 1', '2025-06-01', [
        { category: 'Open', medianLapTime: 44, name: 'rider-a', ratioScore: 0.1 },
        // rider-b absent in event 1
      ]),
      makeEvent(102, 'Race 2', '2025-06-08', [
        { category: 'Open', medianLapTime: 45, name: 'rider-a', ratioScore: 0.2 },
        { category: 'Open', medianLapTime: 47, name: 'rider-b', ratioScore: 0.35 },
      ]),
    ];

    const result = generateEventHandicapList(events);

    expect(result.get('rider-a')).toBe(',1,0.1000,44,100.000,2,0.2000,45,100.000');
    expect(result.get('rider-b')).toBe(',1,,,,2,0.3500,47,100.000');
  });

  test('should handle three events with mixed participation', () => {
    const events = [
      makeEvent(101, 'Race 1', '2025-06-01', [
        { category: 'Open', medianLapTime: 44, name: 'rider-a', ratioScore: 0.1 },
      ]),
      makeEvent(102, 'Race 2', '2025-06-08', [
        // rider-a absent
        { category: 'Open', medianLapTime: 47, name: 'rider-b', ratioScore: 0.35 },
      ]),
      makeEvent(103, 'Race 3', '2025-06-15', [
        { category: 'Open', medianLapTime: 46, name: 'rider-a', ratioScore: 0.3 },
        { category: 'Open', medianLapTime: 48, name: 'rider-b', ratioScore: 0.4 },
      ]),
    ];

    const result = generateEventHandicapList(events);

    expect(result.get('rider-a')).toBe(',1,0.1000,44,100.000,2,,,,3,0.3000,46,100.000');
    expect(result.get('rider-b')).toBe(',1,,,,2,0.3500,47,100.000,3,0.4000,48,100.000');
  });
});
