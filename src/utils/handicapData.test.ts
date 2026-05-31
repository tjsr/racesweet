import { buildHandicapSnapshot, outputProcessedHandicaps, processHandicaps, scaleEventScore } from "./handicapData.js";

import { EventHandicapData } from "./apical/apicalData.js";

describe('scaleEventScore', () => {
  test('should scale score when leader is slower than top ranked all-time', () => {
    const highestRatio = 0.1000;
    const lowestRatio = 0.9000;
    const currentScore = 0.2000;

    const scaledScore = scaleEventScore(currentScore, highestRatio, lowestRatio);
    expect(scaledScore).toBeCloseTo(0.26, 2);
  });

  test('Should expand score when leader is fastest overall', () => {
    const highestRatio = 0.0000;
    const lowestRatio = 0.6666;
    const currentScore = 0.3333;
    
    const scaledScore = scaleEventScore(currentScore, highestRatio, lowestRatio);
    expect(scaledScore).toBeCloseTo(0.2222, 4);
  });

  test('Should remain fastest within range', () => {
    const highestRatio = 0.100;
    const lowestRatio = 0.750;
    const currentScore = 0.000;

    const scaledScore = scaleEventScore(currentScore, highestRatio, lowestRatio);
    expect(scaledScore).toBeCloseTo(0.1, 2);
  });

  test('should throw when lowest ratio is not greater than highest ratio', () => {
    expect(() => scaleEventScore(0.2, 0.4, 0.4)).toThrow('must be greater than highest event ratio');
  });

  test('should throw when highest ratio is below zero', () => {
    expect(() => scaleEventScore(0.2, -0.1, 0.8)).toThrow('must be greater than 0');
  });

  test('should throw when lowest ratio exceeds one', () => {
    expect(() => scaleEventScore(0.2, 0.1, 1.1)).toThrow('must be less than 1.0');
  });
});

describe('outputProcessedHandicaps', () => {
  test('should output riders sorted by handicap and preserve CSV format', () => {
    const progressiveHandicapData: Map<string, number> = new Map<string, number>([
      ['rider-c', 0.8],
      ['rider-a', 0.1],
      ['rider-b', 0.35],
    ]);
    const roundHandicapData: Map<string, string> = new Map<string, string>([
      ['rider-a', ',1,0.1000,44'],
      ['rider-b', ',1,0.3500,47'],
      ['rider-c', ',1,0.8000,51'],
    ]);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    outputProcessedHandicaps(progressiveHandicapData, roundHandicapData);

    expect(logSpy).toHaveBeenCalledTimes(3);
    expect(logSpy).toHaveBeenNthCalledWith(1, 'rider-a,0.1000,,1,0.1000,44');
    expect(logSpy).toHaveBeenNthCalledWith(2, 'rider-b,0.3500,,1,0.3500,47');
    expect(logSpy).toHaveBeenNthCalledWith(3, 'rider-c,0.8000,,1,0.8000,51');

    logSpy.mockRestore();
  });

  test('should output default round data text when rider has no rounds', () => {
    const progressiveHandicapData: Map<string, number> = new Map<string, number>([
      ['rider-a', 0.1],
    ]);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    outputProcessedHandicaps(progressiveHandicapData, new Map<string, string>());

    expect(logSpy).toHaveBeenCalledWith('rider-a,0.1000,No round data');
    logSpy.mockRestore();
  });
});

describe('processHandicaps', () => {
  test('should update existing riders and add new riders', () => {
    const progressiveHandicapData: Map<string, number> = new Map<string, number>([
      ['rider-a', 0.2],
      ['rider-b', 0.7],
    ]);
    const eventData: EventHandicapData = {
      entrantData: [
        { category: 'cat', confidenceFactor: 100, medianLapTime: 45, name: 'rider-a', ratioScore: 0.0 },
        { category: 'cat', confidenceFactor: 100, medianLapTime: 48, name: 'rider-b', ratioScore: 1.0 },
        { category: 'cat', confidenceFactor: 100, medianLapTime: 46, name: 'rider-c', ratioScore: 0.5 },
      ],
    };

    processHandicaps(progressiveHandicapData, eventData);

    expect(progressiveHandicapData.get('rider-a')).toBeCloseTo(0.2, 4);
    expect(progressiveHandicapData.get('rider-b')).toBeCloseTo(0.7, 4);
    expect(progressiveHandicapData.get('rider-c')).toBeCloseTo(0.45, 4);
  });

  test('should anchor scaling to known event riders and extrapolate unknown event extremes', () => {
    const progressiveHandicapData: Map<string, number> = new Map<string, number>([
      ['known-fast', 0.2],
      ['known-slow', 0.6],
    ]);

    const eventData: EventHandicapData = {
      entrantData: [
        { category: 'cat', confidenceFactor: 100, medianLapTime: 44, name: 'new-fast', ratioScore: 0.0 },
        { category: 'cat', confidenceFactor: 100, medianLapTime: 45, name: 'known-fast', ratioScore: 0.25 },
        { category: 'cat', confidenceFactor: 100, medianLapTime: 47, name: 'known-slow', ratioScore: 0.75 },
        { category: 'cat', confidenceFactor: 100, medianLapTime: 49, name: 'new-slow', ratioScore: 1.0 },
      ],
    };

    processHandicaps(progressiveHandicapData, eventData);

    expect(progressiveHandicapData.get('known-fast')).toBeCloseTo(0.2, 4);
    expect(progressiveHandicapData.get('known-slow')).toBeCloseTo(0.6, 4);
    expect(progressiveHandicapData.get('new-fast')).toBeCloseTo(0.0, 4);
    expect(progressiveHandicapData.get('new-slow')).toBeCloseTo(0.8, 4);
  });
});

describe('buildHandicapSnapshot', () => {
  test('should build event keyed round objects for each rider', () => {
    const progressiveHandicapData: Map<string, number> = new Map<string, number>([
      ['rider-a', 0.1],
      ['rider-b', 0.35],
    ]);
    const roundHandicapData: Map<string, string> = new Map<string, string>([
      ['rider-a', ',1,0.1000,44,2,0.1200,45'],
      ['rider-b', ',1,0.3500,47,2,,'],
    ]);

    const snapshot = buildHandicapSnapshot(progressiveHandicapData, roundHandicapData, [101, 102]);

    expect(snapshot.schemaVersion).toBe('1.0');
    expect(snapshot.riders).toHaveLength(2);
    expect(snapshot.riders[0].name).toBe('rider-a');
    expect(snapshot.riders[0].roundsByEventId['101']).toEqual({
      confidenceFactor: null,
      eventId: 101,
      eventNumber: 1,
      medianLapTime: 44,
      ratioScore: 0.1,
    });
    expect(snapshot.riders[0].roundsByEventId['102']).toEqual({
      confidenceFactor: null,
      eventId: 102,
      eventNumber: 2,
      medianLapTime: 45,
      ratioScore: 0.12,
    });
    expect(snapshot.riders[1].roundsByEventId['102']).toBeUndefined();
  });
});
