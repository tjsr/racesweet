// @vitest-environment jsdom
import { act } from "react";

import { type Root, createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import type {
  EventCatalogEntrant,
  EventCatalogEntry,
} from "../../catalog/eventCatalog.js";
import type { EventParticipant } from "../../model/eventparticipant.js";
import {
  createCategoryId,
  createEventEntrantId,
  createEventId,
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

  it("does not stop live playback when it reaches the latest record", async (): Promise<void> => {
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const container: HTMLDivElement = document.createElement("div");
    const root: Root = createRoot(container);
    let scheduledFrame: FrameRequestCallback | undefined;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T10:01:00.000Z"));
    window.cancelAnimationFrame = (): void => undefined;
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      scheduledFrame = callback;
      return 1;
    };

    try {
      await act(async (): Promise<void> => {
        root.render(
          <TrackMapReport catalogEntrants={[]} raceState={createRaceState()} />,
        );
      });
      const playButton: HTMLButtonElement = container.querySelector(
        'button[aria-label="Play Track Map Playback"]',
      )!;
      await act(async (): Promise<void> => {
        playButton.click();
        scheduledFrame?.(0);
        scheduledFrame?.(60_000);
      });

      expect(
        container.querySelector(
          'button[aria-label="Pause Track Map Playback"]',
        ),
      ).toBeTruthy();
      expect(scheduledFrame).toBeDefined();
    } finally {
      await act(async (): Promise<void> => {
        root.unmount();
      });
      window.cancelAnimationFrame = originalCancelAnimationFrame;
      window.requestAnimationFrame = originalRequestAnimationFrame;
      vi.useRealTimers();
    }
  });

  it("jumps to the live time and starts playback", async (): Promise<void> => {
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const container: HTMLDivElement = document.createElement("div");
    const root: Root = createRoot(container);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T10:01:30.000Z"));
    window.cancelAnimationFrame = (): void => undefined;
    window.requestAnimationFrame = (): number => 1;

    try {
      await act(async (): Promise<void> => {
        root.render(
          <TrackMapReport catalogEntrants={[]} raceState={createRaceState()} />,
        );
      });
      const liveButton: HTMLButtonElement = container.querySelector(
        'button[aria-label="Jump to Live Track Map Playback"]',
      )!;
      await act(async (): Promise<void> => {
        liveButton.click();
      });

      const progress: HTMLInputElement = container.querySelector(
        'input[aria-label="Track Map Session Progress"]',
      )!;
      expect(progress.value).toBe("90000");
      expect(
        container.querySelector(
          'button[aria-label="Pause Track Map Playback"]',
        ),
      ).toBeTruthy();
    } finally {
      await act(async (): Promise<void> => {
        root.unmount();
      });
      window.cancelAnimationFrame = originalCancelAnimationFrame;
      window.requestAnimationFrame = originalRequestAnimationFrame;
      vi.useRealTimers();
    }
  });

  it("caps a stale live timeline at the last anticipated rider finish", async (): Promise<void> => {
    const container: HTMLDivElement = document.createElement("div");
    const root: Root = createRoot(container);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T18:00:00.000Z"));

    try {
      await act(async (): Promise<void> => {
        root.render(
          <TrackMapReport catalogEntrants={[]} raceState={createRaceState()} />,
        );
      });
      const progress: HTMLInputElement = container.querySelector(
        'input[aria-label="Track Map Session Progress"]',
      )!;
      expect(progress.max).toBe("120000");
    } finally {
      await act(async (): Promise<void> => {
        root.unmount();
      });
      vi.useRealTimers();
    }
  });

  it("displays leader lap markers on the timeline", async (): Promise<void> => {
    const container: HTMLDivElement = document.createElement("div");
    const root: Root = createRoot(container);

    try {
      await act(async (): Promise<void> => {
        root.render(
          <TrackMapReport catalogEntrants={[]} raceState={createRaceState()} />,
        );
      });

      expect(
        container.querySelector('[aria-label="Track Map Leader Lap Markers"]'),
      ).toBeTruthy();
      expect(
        container.querySelectorAll('[aria-label^="Leader lap "]'),
      ).toHaveLength(2);
    } finally {
      await act(async (): Promise<void> => {
        root.unmount();
      });
    }
  });

  it("shows the selected rider's number and team details outside the map marker", async (): Promise<void> => {
    const container: HTMLDivElement = document.createElement("div");
    const root: Root = createRoot(container);
    const eventId = createEventId("track-map-event");
    const teamId = createEventEntrantId("track-map-team");
    const catalogEntrants: EventCatalogEntrant[] = [
      {
        categoryIds: [participant.categoryId!],
        entrantType: "rider",
        eventId,
        id: participant.entrantId,
        memberParticipantIds: [participant.id],
        name: "Track Rider",
        teamEntrantId: teamId,
      },
      {
        categoryIds: [participant.categoryId!],
        entrantType: "team",
        eventId,
        id: teamId,
        memberParticipantIds: [participant.id],
        name: "Track Racing Team",
      },
    ];
    const catalogEntries: EventCatalogEntry[] = [
      {
        entrantId: participant.entrantId,
        eventId,
        id: participant.entrantId,
        identifiers: [],
        participantIds: [participant.id],
        raceNumber: "42",
      },
    ];

    try {
      await act(async (): Promise<void> => {
        root.render(
          <TrackMapReport
            catalogEntries={catalogEntries}
            catalogEntrants={catalogEntrants}
            raceState={createRaceState()}
          />,
        );
      });
      const marker: SVGGElement = container.querySelector(
        'g[aria-label="Track entrant 42"]',
      )!;
      await act(async (): Promise<void> => {
        marker.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      const details: HTMLElement = container.querySelector(
        '[aria-label="Selected Track Entrant"]',
      )!;
      expect(details.textContent).toContain("Track Rider");
      expect(details.textContent).toContain("Rider number: 42");
      expect(details.textContent).toContain("Team: Track Racing Team");
    } finally {
      await act(async (): Promise<void> => {
        root.unmount();
      });
    }
  });
});
