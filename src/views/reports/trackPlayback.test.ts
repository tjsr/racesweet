import { describe, expect, it } from 'vitest';
import { createCategoryId, createEventParticipantId, createTimeRecordSourceId } from '../../model/ids.js';
import type { EventParticipant } from '../../model/eventparticipant.js';
import type { RaceState, RaceStateLookup } from '../../model/racestate.js';
import type { ParticipantPassingRecord } from '../../model/timerecord.js';
import { createTrackPlaybackIndex } from './trackPlayback.js';

const participant: EventParticipant = {
  categoryId: createCategoryId('track-category'),
  currentResult: undefined,
  entrantId: 'entrant-7',
  firstname: 'Track',
  id: createEventParticipantId('participant-7'),
  identifiers: [],
  lastRecordTime: null,
  resultDuration: null,
  surname: 'Rider',
};

const continuingParticipant: EventParticipant = {
  ...participant,
  entrantId: 'entrant-8',
  id: createEventParticipantId('participant-8'),
};

const passing = (id: string, lineNumber: number, seconds: number, lapNo: number, lapTime: number, passingParticipant = participant): ParticipantPassingRecord & { txNumber: number } => ({
  elapsedTime: seconds * 1000,
  id,
  isValid: true,
  lapNo,
  lapTime,
  lineNumber,
  participantId: passingParticipant.id,
  recordType: 16,
  sequence: seconds,
  source: createTimeRecordSourceId('track-source'),
  time: new Date(new Date('2026-07-17T10:00:00.000Z').getTime() + seconds * 1000),
  txNumber: 7,
});

describe('track playback index', () => {
  it('incrementally applies reached records, retains the next passing, and rebuilds when seeking backwards', () => {
    const records = [
      passing('passing-1', 1, 0, 1, 60_000),
      passing('passing-2', 2, 20, 1, 20_000),
      passing('passing-3', 1, 40, 2, 40_000),
    ];
    records[1]!.isLapCompletion = false;
    const raceState = {
      categories: [],
      getEntrantIdForParticipant: () => participant.entrantId,
      getFinishLineNumbers: () => [1],
      getParticipantById: () => participant,
      participants: [participant],
      records,
      teams: [],
    } as unknown as RaceState & RaceStateLookup;
    const index = createTrackPlaybackIndex(raceState, [
      { lineNumber: 1, progress: 0 },
      { lineNumber: 2, progress: 0.5 },
    ]);

    const halfway = index.seek(new Date('2026-07-17T10:00:10.000Z').getTime()).entrants[0]!;
    expect(halfway.progress).toBeCloseTo(0.25, 4);
    expect(halfway.lapCount).toBe(1);

    const later = index.seek(new Date('2026-07-17T10:00:40.000Z').getTime()).entrants[0]!;
    expect(later.lapCount).toBe(2);
    expect(later.fastestLap).toBe(40_000);

    const rewound = index.seek(new Date('2026-07-17T10:00:10.000Z').getTime()).entrants[0]!;
    expect(rewound.lapCount).toBe(1);
    expect(rewound.fastestLap).toBe(60_000);
  });

  it('moves entrants with no future crossing to DNF after three minutes and restores them when rewound', () => {
    const participants = [participant, continuingParticipant];
    const raceState = {
      categories: [],
      getEntrantIdForParticipant: (participantId: string) => participants.find((candidate) => candidate.id === participantId)?.entrantId,
      getFinishLineNumbers: () => [1],
      getParticipantById: (participantId: string) => participants.find((candidate) => candidate.id === participantId),
      participants,
      records: [
        passing('stopped-entrant', 1, 0, 1, 60_000),
        passing('continuing-entrant', 1, 241, 1, 60_000, continuingParticipant),
      ],
      teams: [],
    } as unknown as RaceState & RaceStateLookup;
    const index = createTrackPlaybackIndex(raceState, [{ lineNumber: 1, progress: 0 }]);

    expect(index.seek(index.startTime + 180_000).entrants.find((entrant) => entrant.entrantId === participant.entrantId)?.didNotFinish).toBe(false);
    expect(index.seek(index.startTime + 180_001).entrants.find((entrant) => entrant.entrantId === participant.entrantId)?.didNotFinish).toBe(true);
    expect(index.seek(index.endTime).entrants.find((entrant) => entrant.entrantId === continuingParticipant.entrantId)?.didNotFinish).toBe(false);
    expect(index.seek(index.startTime + 60_000).entrants.find((entrant) => entrant.entrantId === participant.entrantId)?.didNotFinish).toBe(false);
  });
});
