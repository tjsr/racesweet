// @vitest-environment jsdom
import { act } from "react";

import { type Root, createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import type { EventParticipant } from "../../model/eventparticipant.js";
import {
  createCategoryId,
  createEventEntrantId,
  createEventParticipantId,
  createTimeRecordSourceId,
} from "../../model/ids.js";
import type { RaceState, RaceStateLookup } from "../../model/racestate.js";
import type { ParticipantPassingRecord } from "../../model/timerecord.js";
import { useUiConsoleGuards } from "../../testing/uiConsoleGuards.js";
import { TrackMapReport } from "./TrackMapReport.js";

const participant: EventParticipant = {
  categoryId: createCategoryId("track-map-category"),
  currentResult: undefined,
  entrantId: createEventEntrantId("track-map-entrant"),
  firstname: "Track",
  id: createEventParticipantId("track-map-participant"),
  identifiers: [],
  lastRecordTime: null,
  resultDuration: null,
  surname: "Rider",
};

const passing = (
  id: string,
  seconds: number,
  lapTime: number = 60_000,
): ParticipantPassingRecord & { txNumber: number } => ({
  elapsedTime: seconds * 1000,
  id,
  isValid: true,
  lapNo: seconds / 60 + 1,
  lapTime,
  lineNumber: 1,
  participantId: participant.id,
  recordType: 16,
  sequence: seconds,
  source: createTimeRecordSourceId("track-map-source"),
  time: new Date(
    new Date("2026-07-17T10:00:00.000Z").getTime() + seconds * 1000,
  ),
  txNumber: 7,
});

const createRaceState = (
  secondLapTime: number = 60_000,
): RaceState & RaceStateLookup =>
  ({
    categories: [],
    getEntrantIdForParticipant: () => participant.entrantId,
    getFinishLineNumbers: () => [1],
    getParticipantById: () => participant,
    participants: [participant],
    records: [
      passing("track-map-passing-1", 0),
      passing("track-map-passing-2", 60, secondLapTime),
    ],
    teams: [],
  }) as unknown as RaceState & RaceStateLookup;

describe("TrackMapReport", () => {
  useUiConsoleGuards();

  it("continues playing when its race state is rerendered or refreshed", async () => {
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const container = document.createElement("div");
    const root: Root = createRoot(container);
    window.cancelAnimationFrame = (): void => undefined;
    window.requestAnimationFrame = (): number => 1;

    try {
      await act(async () => {
        root.render(
          <TrackMapReport catalogEntrants={[]} raceState={createRaceState()} />,
        );
      });
      const playButton = container.querySelector(
        'button[aria-label="Play Track Map Playback"]',
      ) as HTMLButtonElement;
      await act(async () => {
        playButton.click();
      });
      expect(
        container.querySelector(
          'button[aria-label="Pause Track Map Playback"]',
        ),
      ).toBeTruthy();

      await act(async () => {
        root.render(
          <TrackMapReport catalogEntrants={[]} raceState={createRaceState()} />,
        );
      });
      expect(
        container.querySelector(
          'button[aria-label="Pause Track Map Playback"]',
        ),
      ).toBeTruthy();

      await act(async () => {
        root.render(
          <TrackMapReport
            catalogEntrants={[]}
            raceState={createRaceState(59_999)}
          />,
        );
      });
      expect(
        container.querySelector(
          'button[aria-label="Pause Track Map Playback"]',
        ),
      ).toBeTruthy();
    } finally {
      await act(async () => {
        root.unmount();
      });
      window.cancelAnimationFrame = originalCancelAnimationFrame;
      window.requestAnimationFrame = originalRequestAnimationFrame;
    }
  });
});
