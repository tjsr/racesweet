import {
  estimateMissingCrossingTime,
  getPotentialMissingCrossingIndicators,
  isPotentialMissingCrossing,
} from './missingCrossing.js';
import type { EventParticipantId } from '../model/eventparticipant.js';
import type { RaceStateLookup } from '../model/racestate.js';
import { RECORD_TX_CROSSING, type EventTimeRecord, type ParticipantPassingRecord } from '../model/timerecord.js';

const participantId = (value: string): EventParticipantId => value as EventParticipantId;

const passing = (
  id: string,
  participant: EventParticipantId,
  seconds: number,
  lapTime = 100_000,
  lineNumber = 1
): ParticipantPassingRecord => ({
  chipCode: Number(participant.length + seconds),
  id,
  isLapCompletion: true,
  isValid: true,
  lapNo: seconds / 100,
  lapTime,
  lineNumber,
  participantId: participant,
  recordType: RECORD_TX_CROSSING,
  sequence: seconds,
  source: 'source',
  time: new Date(seconds * 1_000),
} as ParticipantPassingRecord);

const createLookup = (): RaceStateLookup => ({
  countTransponderCrossings: () => 0,
  excludeCrossing: () => undefined,
  getCategoryById: () => undefined,
  getEntrantIdForParticipant: (id: EventParticipantId) => id,
  getFinishLineNumbers: () => [1],
  getParticipantById: (id: EventParticipantId) => ({
    categoryId: 'category',
    currentResult: undefined,
    entrantId: id,
    firstname: 'Test',
    id,
    identifiers: [],
    lastRecordTime: null,
    resultDuration: null,
    surname: 'Entrant',
  }),
  getParticipantLaps: () => [],
  getTransponderCrossings: () => [],
  updateCategoryDetails: () => undefined,
  updateEntrantCategory: () => undefined,
  updateParticipantCategory: () => undefined,
});

describe('missing crossing detection', () => {
  it('classifies laps between 190% and 198% as possible and laps at 198% or more as likely', () => {
    const entrant = participantId('entrant-a');
    const lookup = createLookup();
    const fastest = passing('fastest', entrant, 100);
    const atThreshold = passing('threshold', entrant, 290, 190_000);
    const possible = passing('possible', entrant, 481, 191_000);
    const belowLikelyThreshold = passing('below-likely', entrant, 679, 197_999);
    const atLikelyThreshold = passing('likely-threshold', entrant, 877, 198_000);
    const likely = passing('likely', entrant, 1_077, 200_000);
    const records: EventTimeRecord[] = [
      fastest,
      atThreshold,
      possible,
      belowLikelyThreshold,
      atLikelyThreshold,
      likely,
    ];
    const indicators = getPotentialMissingCrossingIndicators(records, lookup);

    expect(isPotentialMissingCrossing(atThreshold, records, lookup)).toBe(false);
    expect(indicators.get(possible.id)).toBe('possible');
    expect(indicators.get(belowLikelyThreshold.id)).toBe('possible');
    expect(indicators.get(atLikelyThreshold.id)).toBe('likely');
    expect(indicators.get(likely.id)).toBe('likely');
  });

  it('combines the last-three-lap average with historical spacing to adjacent entrants', () => {
    const entrant = participantId('entrant-a');
    const ahead = participantId('entrant-b');
    const behind = participantId('entrant-c');
    const lookup = createLookup();
    const records: EventTimeRecord[] = [
      passing('a-1', entrant, 100),
      passing('a-2', entrant, 200),
      passing('a-3', entrant, 300),
      passing('a-long', entrant, 500, 200_000),
      ...[95, 195, 295, 395].map((seconds: number) => passing(`b-${seconds}`, ahead, seconds)),
      ...[105, 205, 305, 405].map((seconds: number) => passing(`c-${seconds}`, behind, seconds)),
    ];

    expect(estimateMissingCrossingTime(records[3] as ParticipantPassingRecord, records, lookup)?.toISOString())
      .toBe('1970-01-01T00:06:40.000Z');
  });

  it('uses the selected timing line for the spacing estimate', () => {
    const entrant = participantId('entrant-a');
    const lookup = { ...createLookup(), getFinishLineNumbers: () => [2] };
    const records: EventTimeRecord[] = [
      passing('a-1', entrant, 100, 100_000, 2),
      passing('a-2', entrant, 200, 100_000, 2),
      passing('a-long', entrant, 400, 200_000, 2),
    ];

    expect(estimateMissingCrossingTime(records[2] as ParticipantPassingRecord, records, lookup)?.toISOString())
      .toBe('1970-01-01T00:05:00.000Z');
  });

  it('marks the next finish as likely when two sector lines prove a skipped finish crossing', () => {
    const entrant = participantId('entrant-a');
    const lookup = createLookup();
    const finishBefore = passing('finish-before', entrant, 60, 60_000, 1);
    const sectorTwoFirst = { ...passing('sector-two-first', entrant, 100, 40_000, 2), isLapCompletion: false };
    const sectorThreeFirst = { ...passing('sector-three-first', entrant, 110, 50_000, 3), isLapCompletion: false };
    const sectorTwoSecond = { ...passing('sector-two-second', entrant, 160, 100_000, 2), isLapCompletion: false };
    const sectorThreeSecond = { ...passing('sector-three-second', entrant, 170, 110_000, 3), isLapCompletion: false };
    const finishAfter = passing('finish-after', entrant, 220, 160_000, 1);
    const records = [finishBefore, sectorTwoFirst, sectorThreeFirst, sectorTwoSecond, sectorThreeSecond, finishAfter];

    expect(getPotentialMissingCrossingIndicators(records, lookup).get(finishAfter.id)).toBe('likely');
  });
});
