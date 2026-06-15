import {
  buildHandicapSnapshot,
  getEventScalingAnchors,
  normalizeBetweenAnchors,
  outputProcessedHandicaps,
  processHandicaps,
  scaleEventScore,
  scaleHandicapData,
} from "./handicapData.js";

import { HandicapDataException } from "../errors/handicapDataException.js";
import { EventHandicapData } from "./apical/apicalData.js";

const createEntrant = (name: string, ratioScore: number) => ({
  category: 'cat',
  confidenceFactor: 100,
  medianLapTime: 45,
  name,
  ratioScore,
});

const createEventData = (...entrantData: EventHandicapData['entrantData']): EventHandicapData => ({
  entrantData,
});

const expectMapUnchanged = (actual: Map<string, number>, expected: Map<string, number>) => {
  expect([...actual.entries()].sort()).toEqual([...expected.entries()].sort());
};

const expectAllHandicapsInRange = (progressiveHandicapData: Map<string, number>) => {
  progressiveHandicapData.forEach((ratio, riderName) => {
    expect(ratio, `${riderName} should have a valid handicap ratio`).toBeGreaterThanOrEqual(0);
    expect(ratio, `${riderName} should have a valid handicap ratio`).toBeLessThanOrEqual(1);
  });
};

describe('normalizeBetweenAnchors', () => {
  test.each([
    [0.25, 0.25, 0.75, 0],
    [0.5, 0.25, 0.75, 0.5],
    [0.75, 0.25, 0.75, 1],
    [0.1, 0.1, 0.9, 0],
    [0.9, 0.1, 0.9, 1],
  ])('normalizes %s between %s and %s to %s', (value, minAnchor, maxAnchor, expected) => {
    expect(normalizeBetweenAnchors(value, minAnchor, maxAnchor)).toBeCloseTo(expected, 6);
  });

  test.each([
    [0.1, 0.25, 0.75, -0.3],
    [0.9, 0.25, 0.75, 1.3],
  ])('allows extrapolated normalized values for %s outside anchor range', (value, minAnchor, maxAnchor, expected) => {
    expect(normalizeBetweenAnchors(value, minAnchor, maxAnchor)).toBeCloseTo(expected, 6);
  });

  test.each([
    ['equal anchors', 0.5, 0.5, 0.5],
    ['reversed anchors', 0.5, 0.75, 0.25],
  ])('throws for %s', (_label, value, minAnchor, maxAnchor) => {
    expect(() => normalizeBetweenAnchors(value, minAnchor, maxAnchor))
      .toThrow(HandicapDataException);
    expect(() => normalizeBetweenAnchors(value, minAnchor, maxAnchor))
      .toThrow(`minAnchor ${minAnchor} must be less than maxAnchor ${maxAnchor}`);
  });
});

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

  test('should map the slowest normalized score to the lowest known event ratio', () => {
    expect(scaleEventScore(1, 0.15, 0.85)).toBeCloseTo(0.85, 6);
  });

  test('should interpolate the midpoint between event ratio anchors', () => {
    expect(scaleEventScore(0.5, 0.2, 0.6)).toBeCloseTo(0.4, 6);
  });

  test('should extrapolate below the highest event ratio when the score is below zero', () => {
    expect(scaleEventScore(-0.25, 0.2, 0.6)).toBeCloseTo(0.1, 6);
  });

  test('should extrapolate above the lowest event ratio when the score is above one', () => {
    expect(scaleEventScore(1.25, 0.2, 0.6)).toBeCloseTo(0.7, 6);
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

describe('getEventScalingAnchors', () => {
  test('returns undefined when fewer than two event entrants have progressive handicap data', () => {
    const progressiveHandicapData = new Map<string, number>([
      ['known-fast', 0.2],
    ]);
    const eventData = createEventData(
      createEntrant('known-fast', 0.25),
      createEntrant('unknown-slow', 0.75)
    );

    expect(getEventScalingAnchors(progressiveHandicapData, eventData)).toBeUndefined();
  });

  test('selects the fastest and slowest known riders by event raw ratio', () => {
    const progressiveHandicapData = new Map<string, number>([
      ['known-mid', 0.45],
      ['known-fast', 0.2],
      ['known-slow', 0.7],
    ]);
    const eventData = createEventData(
      createEntrant('unknown-fastest', 0.05),
      createEntrant('known-slow', 0.8),
      createEntrant('known-mid', 0.5),
      createEntrant('known-fast', 0.25),
      createEntrant('unknown-slowest', 0.95)
    );

    expect(getEventScalingAnchors(progressiveHandicapData, eventData)).toEqual({
      highestKnownProgressiveRatio: 0.2,
      highestKnownRawRatio: 0.25,
      lowestKnownProgressiveRatio: 0.7,
      lowestKnownRawRatio: 0.8,
    });
  });

  test('returns undefined when known rider progressive order is not usable for scaling', () => {
    const progressiveHandicapData = new Map<string, number>([
      ['known-fast', 0.6],
      ['known-slow', 0.4],
    ]);
    const eventData = createEventData(
      createEntrant('known-fast', 0.25),
      createEntrant('known-slow', 0.75)
    );

    expect(getEventScalingAnchors(progressiveHandicapData, eventData)).toBeUndefined();
  });

  test('returns undefined when the only known entries resolve to the same rider', () => {
    const progressiveHandicapData = new Map<string, number>([
      ['known-rider', 0.4],
    ]);
    const eventData = createEventData(
      createEntrant('known-rider', 0.25),
      createEntrant('known-rider', 0.75)
    );

    expect(getEventScalingAnchors(progressiveHandicapData, eventData)).toBeUndefined();
  });

  test.each([
    ['highest known raw below zero', new Map<string, number>([['known-fast', 0.2], ['known-slow', 0.7]]), createEventData(createEntrant('known-fast', -0.01), createEntrant('known-slow', 0.75)), /Highest known entrant known-fast has invalid raw ratio score -0.01/],
    ['lowest known raw above one', new Map<string, number>([['known-fast', 0.2], ['known-slow', 0.7]]), createEventData(createEntrant('known-fast', 0.25), createEntrant('known-slow', 1.01)), /Lowest known entrant known-slow has invalid raw ratio score 1.01/],
    ['highest known progressive below zero', new Map<string, number>([['known-fast', -0.01], ['known-slow', 0.7]]), createEventData(createEntrant('known-fast', 0.25), createEntrant('known-slow', 0.75)), /Progressive handicap ratio for highest known entrant known-fast must be greater than or equal to 0/],
    ['lowest known progressive above one', new Map<string, number>([['known-fast', 0.2], ['known-slow', 1.01]]), createEventData(createEntrant('known-fast', 0.25), createEntrant('known-slow', 0.75)), /Progressive handicap ratio for lowest known entrant known-slow must be less than or equal to 1.0/],
  ])('throws when %s', (_label, progressiveHandicapData, eventData, messagePattern) => {
    expect(() => getEventScalingAnchors(progressiveHandicapData, eventData))
      .toThrow(messagePattern);
  });
});

describe('scaleHandicapData', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('returns raw ratios unchanged when there are no scaling anchors', () => {
    const eventData = createEventData(
      createEntrant('new-fast', 0.1),
      createEntrant('new-mid', 0.5),
      createEntrant('new-slow', 0.9)
    );

    expect(scaleHandicapData(new Map<string, number>(), eventData).map((entrant) => entrant.ratioScore))
      .toEqual([0.1, 0.5, 0.9]);
  });

  test('scales a mixed roster around known anchors while keeping every entrant in range', () => {
    const progressiveHandicapData = new Map<string, number>([
      ['known-fast', 0.2],
      ['known-slow', 0.7],
    ]);
    const eventData = createEventData(
      createEntrant('new-fast', 0.15),
      createEntrant('known-fast', 0.25),
      createEntrant('improving-mid', 0.4),
      createEntrant('known-slow', 0.75),
      createEntrant('new-slow', 0.85)
    );

    const scaledEntrants = scaleHandicapData(progressiveHandicapData, eventData);
    const scaledByName = new Map(scaledEntrants.map((entrant) => [entrant.name, entrant.ratioScore]));

    expect(scaledByName.get('new-fast')).toBeCloseTo(0.1, 6);
    expect(scaledByName.get('known-fast')).toBeCloseTo(0.2, 6);
    expect(scaledByName.get('improving-mid')).toBeCloseTo(0.35, 6);
    expect(scaledByName.get('known-slow')).toBeCloseTo(0.7, 6);
    expect(scaledByName.get('new-slow')).toBeCloseTo(0.8, 6);
    scaledEntrants.forEach((entrant) => {
      expect(entrant.ratioScore, `${entrant.name} should remain in range`).toBeGreaterThanOrEqual(0);
      expect(entrant.ratioScore, `${entrant.name} should remain in range`).toBeLessThanOrEqual(1);
    });
  });

  test('rescales all anchor-based values when a fast entrant would otherwise be below zero', () => {
    const progressiveHandicapData = new Map<string, number>([
      ['known-fast', 0.2],
      ['known-slow', 0.7],
    ]);
    const eventData = createEventData(
      createEntrant('new-too-fast', 0.0),
      createEntrant('known-fast', 0.25),
      createEntrant('known-slow', 0.75)
    );

    const scaledByName = new Map(scaleHandicapData(progressiveHandicapData, eventData).map((entrant) => [entrant.name, entrant.ratioScore]));

    expect(scaledByName.get('new-too-fast')).toBeCloseTo(0, 6);
    expect(scaledByName.get('known-fast')).toBeCloseTo(1 / 3, 6);
    expect(scaledByName.get('known-slow')).toBeCloseTo(1, 6);
  });

  test('rescales all anchor-based values when a slow entrant would otherwise be above one', () => {
    const progressiveHandicapData = new Map<string, number>([
      ['known-fast', 0.4],
      ['known-slow', 0.9],
    ]);
    const eventData = createEventData(
      createEntrant('known-fast', 0.25),
      createEntrant('known-slow', 0.75),
      createEntrant('new-too-slow', 1.0)
    );

    const scaledByName = new Map(scaleHandicapData(progressiveHandicapData, eventData).map((entrant) => [entrant.name, entrant.ratioScore]));

    expect(scaledByName.get('known-fast')).toBeCloseTo(0, 6);
    expect(scaledByName.get('known-slow')).toBeCloseTo(2 / 3, 6);
    expect(scaledByName.get('new-too-slow')).toBeCloseTo(1, 6);
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  test('keeps the whole roster in range as riders perform either side of previous handicaps across events', () => {
    const progressiveHandicapData: Map<string, number> = new Map<string, number>([
      ['anchor-fast', 0.2],
      ['improving-rider', 0.5],
      ['fading-rider', 0.45],
      ['anchor-slow', 0.75],
    ]);
    const firstImprovingHandicap = progressiveHandicapData.get('improving-rider')!;
    const firstFadingHandicap = progressiveHandicapData.get('fading-rider')!;
    const firstEventData = createEventData(
      createEntrant('new-fast', 0.15),
      createEntrant('anchor-fast', 0.2),
      createEntrant('improving-rider', 0.35),
      createEntrant('fading-rider', 0.65),
      createEntrant('anchor-slow', 0.8),
      createEntrant('new-slow', 0.9)
    );

    processHandicaps(progressiveHandicapData, firstEventData);

    expectAllHandicapsInRange(progressiveHandicapData);
    expect(progressiveHandicapData.get('improving-rider')).toBeLessThan(firstImprovingHandicap);
    expect(progressiveHandicapData.get('fading-rider')).toBeGreaterThan(firstFadingHandicap);
    expect(progressiveHandicapData.get('new-fast')).toBeGreaterThanOrEqual(0);
    expect(progressiveHandicapData.get('new-slow')).toBeLessThanOrEqual(1);

    const secondImprovingHandicap = progressiveHandicapData.get('improving-rider')!;
    const secondFadingHandicap = progressiveHandicapData.get('fading-rider')!;
    const secondEventData = createEventData(
      createEntrant('anchor-fast', 0.25),
      createEntrant('improving-rider', 0.28),
      createEntrant('fading-rider', 0.7),
      createEntrant('anchor-slow', 0.75)
    );

    processHandicaps(progressiveHandicapData, secondEventData);

    expectAllHandicapsInRange(progressiveHandicapData);
    expect(progressiveHandicapData.get('improving-rider')).toBeLessThan(secondImprovingHandicap);
    expect(progressiveHandicapData.get('fading-rider')).toBeGreaterThan(secondFadingHandicap);
    expect(progressiveHandicapData.get('anchor-fast')).toBeGreaterThanOrEqual(0);
    expect(progressiveHandicapData.get('anchor-slow')).toBeLessThanOrEqual(1);
  });

  test('rescales and updates data when unanchored raw ratios include a value below zero', () => {
    const progressiveHandicapData: Map<string, number> = new Map<string, number>([
      ['existing-rider', 0.4],
    ]);
    const eventData = createEventData(
      createEntrant('new-fast', -0.25),
      createEntrant('new-mid', 0.25),
      createEntrant('new-slow', 0.75)
    );

    processHandicaps(progressiveHandicapData, eventData);

    expect(progressiveHandicapData.get('existing-rider')).toBeCloseTo(0.4, 6);
    expect(progressiveHandicapData.get('new-fast')).toBeCloseTo(0, 6);
    expect(progressiveHandicapData.get('new-mid')).toBeCloseTo(0.5, 6);
    expect(progressiveHandicapData.get('new-slow')).toBeCloseTo(1, 6);
    expectAllHandicapsInRange(progressiveHandicapData);
  });

  test('rescales and updates data when unanchored raw ratios include a value above one', () => {
    const progressiveHandicapData: Map<string, number> = new Map<string, number>([
      ['existing-rider', 0.4],
    ]);
    const eventData = createEventData(
      createEntrant('new-fast', 0.25),
      createEntrant('new-mid', 0.75),
      createEntrant('new-slow', 1.25)
    );

    processHandicaps(progressiveHandicapData, eventData);

    expect(progressiveHandicapData.get('existing-rider')).toBeCloseTo(0.4, 6);
    expect(progressiveHandicapData.get('new-fast')).toBeCloseTo(0, 6);
    expect(progressiveHandicapData.get('new-mid')).toBeCloseTo(0.5, 6);
    expect(progressiveHandicapData.get('new-slow')).toBeCloseTo(1, 6);
    expectAllHandicapsInRange(progressiveHandicapData);
  });

  test('rescales and updates data when anchored extrapolation would scale below zero', () => {
    const progressiveHandicapData: Map<string, number> = new Map<string, number>([
      ['known-fast', 0.2],
      ['known-slow', 0.6],
    ]);
    const eventData = createEventData(
      createEntrant('new-too-fast', -0.1),
      createEntrant('known-fast', 0.25),
      createEntrant('known-slow', 0.75)
    );

    processHandicaps(progressiveHandicapData, eventData);

    expect(progressiveHandicapData.get('new-too-fast')).toBeCloseTo(0, 6);
    expect(progressiveHandicapData.get('known-fast')).toBeCloseTo(0.3058823529411765, 6);
    expect(progressiveHandicapData.get('known-slow')).toBeCloseTo(0.8, 6);
    expectAllHandicapsInRange(progressiveHandicapData);
  });

  test('rescales and updates data when anchored extrapolation would scale above one', () => {
    const progressiveHandicapData: Map<string, number> = new Map<string, number>([
      ['known-fast', 0.4],
      ['known-slow', 0.9],
    ]);
    const eventData = createEventData(
      createEntrant('known-fast', 0.25),
      createEntrant('known-slow', 0.75),
      createEntrant('new-too-slow', 1.3)
    );

    processHandicaps(progressiveHandicapData, eventData);

    expect(progressiveHandicapData.get('known-fast')).toBeCloseTo(0.2, 6);
    expect(progressiveHandicapData.get('known-slow')).toBeCloseTo(0.6880952380952381, 6);
    expect(progressiveHandicapData.get('new-too-slow')).toBeCloseTo(1, 6);
    expectAllHandicapsInRange(progressiveHandicapData);
  });

  test('throws before updating data when a known event anchor has a negative raw ratio', () => {
    const progressiveHandicapData: Map<string, number> = new Map<string, number>([
      ['known-fast', 0.2],
      ['known-slow', 0.6],
    ]);
    const originalProgressiveHandicapData = new Map(progressiveHandicapData);
    const eventData = createEventData(
      createEntrant('known-fast', -0.01),
      createEntrant('known-slow', 0.75)
    );

    expect(() => processHandicaps(progressiveHandicapData, eventData))
      .toThrow(/Highest known entrant known-fast has invalid raw ratio score -0.01/);
    expectMapUnchanged(progressiveHandicapData, originalProgressiveHandicapData);
  });

  test('throws before updating data when a known event anchor has a raw ratio above one', () => {
    const progressiveHandicapData: Map<string, number> = new Map<string, number>([
      ['known-fast', 0.2],
      ['known-slow', 0.6],
    ]);
    const originalProgressiveHandicapData = new Map(progressiveHandicapData);
    const eventData = createEventData(
      createEntrant('known-fast', 0.25),
      createEntrant('known-slow', 1.01)
    );

    expect(() => processHandicaps(progressiveHandicapData, eventData))
      .toThrow(/Lowest known entrant known-slow has invalid raw ratio score 1.01/);
    expectMapUnchanged(progressiveHandicapData, originalProgressiveHandicapData);
  });

  test('throws before updating data when a progressive fast anchor is below zero', () => {
    const progressiveHandicapData: Map<string, number> = new Map<string, number>([
      ['known-fast', -0.01],
      ['known-slow', 0.6],
    ]);
    const originalProgressiveHandicapData = new Map(progressiveHandicapData);
    const eventData = createEventData(
      createEntrant('known-fast', 0.25),
      createEntrant('known-slow', 0.75)
    );

    expect(() => processHandicaps(progressiveHandicapData, eventData))
      .toThrow(/Progressive handicap ratio for highest known entrant known-fast must be greater than or equal to 0, got -0.01/);
    expectMapUnchanged(progressiveHandicapData, originalProgressiveHandicapData);
  });

  test('throws before updating data when a progressive slow anchor is above one', () => {
    const progressiveHandicapData: Map<string, number> = new Map<string, number>([
      ['known-fast', 0.2],
      ['known-slow', 1.01],
    ]);
    const originalProgressiveHandicapData = new Map(progressiveHandicapData);
    const eventData = createEventData(
      createEntrant('known-fast', 0.25),
      createEntrant('known-slow', 0.75)
    );

    expect(() => processHandicaps(progressiveHandicapData, eventData))
      .toThrow(/Progressive handicap ratio for lowest known entrant known-slow must be less than or equal to 1.0, got 1.01/);
    expectMapUnchanged(progressiveHandicapData, originalProgressiveHandicapData);
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
