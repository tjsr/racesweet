import { describe, expect, it } from "vitest";

import type { EventParticipant } from "../../model/eventparticipant.js";
import {
  createCategoryId,
  createEventParticipantId,
  createTimeRecordId,
  createTimeRecordSourceId,
} from "../../model/ids.js";
import type { RaceState, RaceStateLookup } from "../../model/racestate.js";
import type { ParticipantPassingRecord } from "../../model/timerecord.js";
import {
  EVENT_FLAG_DISPLAYED,
  EVENT_SESSION_END,
} from "../../model/timerecord.js";
import { createGreenFlagEvent } from "../../processing/flag.js";
import { createTrackPlaybackIndex } from "./trackPlayback.js";

const participant: EventParticipant = {
  categoryId: createCategoryId("track-category"),
  currentResult: undefined,
  entrantId: "entrant-7",
  firstname: "Track",
  id: createEventParticipantId("participant-7"),
  identifiers: [],
  lastRecordTime: null,
  resultDuration: null,
  surname: "Rider",
};

const continuingParticipant: EventParticipant = {
  ...participant,
  entrantId: "entrant-8",
  id: createEventParticipantId("participant-8"),
};

const passing = (
  id: string,
  lineNumber: number,
  seconds: number,
  lapNo: number,
  lapTime: number,
  passingParticipant = participant,
): ParticipantPassingRecord & { txNumber: number } => ({
  elapsedTime: seconds * 1000,
  id,
  isValid: true,
  lapNo,
  lapTime,
  lineNumber,
  participantId: passingParticipant.id,
  recordType: 16,
  sequence: seconds,
  source: createTimeRecordSourceId("track-source"),
  time: new Date(
    new Date("2026-07-17T10:00:00.000Z").getTime() + seconds * 1000,
  ),
  txNumber: 7,
});

describe("track playback index", () => {
  it("interpolates an entrant from their category green flag through their first lap", () => {
    const raceStart = new Date("2026-07-17T10:00:00.000Z");
    const raceState = {
      categories: [],
      getEntrantIdForParticipant: () => participant.entrantId,
      getFinishLineNumbers: () => [1],
      getParticipantById: () => participant,
      participants: [participant],
      records: [
        createGreenFlagEvent({
          categoryIds: [participant.categoryId!],
          id: createTimeRecordId("track-start"),
          indicatesRaceStart: true,
          recordType: 2,
          time: raceStart,
        }),
        passing("first-lap-finish", 1, 60, 1, 60_000),
        passing("second-lap-finish", 1, 120, 2, 60_000),
      ],
      teams: [],
    } as unknown as RaceState & RaceStateLookup;
    const index = createTrackPlaybackIndex(raceState, [
      { lineNumber: 1, progress: 0 },
    ]);

    const firstLap = index.seek(raceStart.getTime() + 30_000).entrants[0]!;
    expect(firstLap.entrantId).toBe(participant.entrantId);
    expect(firstLap.lapCount).toBe(0);
    expect(firstLap.progress).toBeCloseTo(0.5, 4);
  });

  it("incrementally applies reached records, retains the next passing, and rebuilds when seeking backwards", () => {
    const records = [
      passing("passing-1", 1, 0, 1, 60_000),
      passing("passing-2", 2, 20, 1, 20_000),
      passing("passing-3", 1, 40, 2, 40_000),
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

    const halfway = index.seek(new Date("2026-07-17T10:00:10.000Z").getTime())
      .entrants[0]!;
    expect(halfway.progress).toBeCloseTo(0.25, 4);
    expect(halfway.lapCount).toBe(1);

    const later = index.seek(new Date("2026-07-17T10:00:40.000Z").getTime())
      .entrants[0]!;
    expect(later.lapCount).toBe(2);
    expect(later.fastestLap).toBe(40_000);

    const rewound = index.seek(new Date("2026-07-17T10:00:10.000Z").getTime())
      .entrants[0]!;
    expect(rewound.lapCount).toBe(1);
    expect(rewound.fastestLap).toBe(60_000);
  });

  it("moves entrants with no future crossing to DNF after three minutes and restores them when rewound", () => {
    const participants = [participant, continuingParticipant];
    const raceState = {
      categories: [],
      getEntrantIdForParticipant: (participantId: string) =>
        participants.find((candidate) => candidate.id === participantId)
          ?.entrantId,
      getFinishLineNumbers: () => [1],
      getParticipantById: (participantId: string) =>
        participants.find((candidate) => candidate.id === participantId),
      participants,
      records: [
        passing("stopped-entrant", 1, 0, 1, 60_000),
        passing("continuing-entrant", 1, 241, 1, 60_000, continuingParticipant),
      ],
      teams: [],
    } as unknown as RaceState & RaceStateLookup;
    const index = createTrackPlaybackIndex(raceState, [
      { lineNumber: 1, progress: 0 },
    ]);

    expect(
      index
        .seek(index.startTime + 180_000)
        .entrants.find((entrant) => entrant.entrantId === participant.entrantId)
        ?.didNotFinish,
    ).toBe(false);
    expect(
      index
        .seek(index.startTime + 180_001)
        .entrants.find((entrant) => entrant.entrantId === participant.entrantId)
        ?.didNotFinish,
    ).toBe(true);
    expect(
      index
        .seek(index.endTime)
        .entrants.find(
          (entrant) => entrant.entrantId === continuingParticipant.entrantId,
        )?.didNotFinish,
    ).toBe(false);
    expect(
      index
        .seek(index.startTime + 60_000)
        .entrants.find((entrant) => entrant.entrantId === participant.entrantId)
        ?.didNotFinish,
    ).toBe(false);
  });

  it("does not classify an entrant as DNF after they cross the finish line following the chequered flag", () => {
    const raceState = {
      categories: [],
      getEntrantIdForParticipant: (participantId: string) =>
        participantId === participant.id
          ? participant.entrantId
          : continuingParticipant.entrantId,
      getFinishLineNumbers: () => [1],
      getParticipantById: (participantId: string) =>
        participantId === participant.id ? participant : continuingParticipant,
      participants: [participant, continuingParticipant],
      records: [
        {
          flagType: "chequered",
          id: createTimeRecordId("track-chequered"),
          recordType: EVENT_FLAG_DISPLAYED | EVENT_SESSION_END,
          source: createTimeRecordSourceId("track-source"),
          time: new Date("2026-07-17T10:00:30.000Z"),
        },
        passing("post-chequered-finish", 1, 40, 1, 40_000),
        passing("continuing-finish", 1, 221, 1, 221_000, continuingParticipant),
      ],
      teams: [],
    } as unknown as RaceState & RaceStateLookup;
    const index = createTrackPlaybackIndex(raceState, [
      { lineNumber: 1, progress: 0 },
    ]);

    expect(
      index
        .seek(index.endTime)
        .entrants.find((entrant) => entrant.entrantId === participant.entrantId)
        ?.didNotFinish,
    ).toBe(false);
  });
});
