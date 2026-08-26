// @vitest-environment jsdom

import React, { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import {
  getCategoriesForEvent,
  getEntrantsForEvent,
} from "../catalog/eventCatalog.js";
import { createSeedEventCatalogLedger } from "../ledger/createSeedEventCatalogLedger.js";
import type { EventCatalogLedger } from "../ledger/eventCatalogLedger.js";
import { type RaceState, Session } from "../model/racestate.js";
import type { EventCatalogPersistence } from "../persistence/eventCatalogPersistence.js";
import type { SystemConfigPersistence } from "../persistence/systemConfigPersistence.js";
import { EventCatalogService } from "../service/eventCatalogService.js";
import { SystemConfigService } from "../service/systemConfigService.js";
import { useUiConsoleGuards } from "../testing/uiConsoleGuards.js";
import { TimingContext } from "../views/context/Timing.js";
import { DataSourcesPanel } from "../views/panels/dataSources.js";
import {
  type ApicalRecentLap,
  type ApicalRecentLapsMergeResult,
  type ApicalRecentLapsTarget,
  ensureApicalRecentLapsTarget,
  fetchApicalRecentLapsRaceState,
  mergeApicalRecentLapsRaceState,
} from "./apicalRecentLapsDataSource.js";
import {
  type DataSourceConfig,
  type SystemConfiguration,
  createDefaultSystemConfiguration,
} from "./systemConfig.js";

const recentLaps: ApicalRecentLap[] = [
  {
    CategoryName: "Solo",
    FullName: "Casey RIDER",
    Id: 79001,
    IsTeam: false,
    LapNumber: 1,
    LapTime: "2026-08-25T10:10:00.000",
    LapTimeSpan: "00:10:00.0000000",
    RaceNumber: "79",
    TeamNameDisplay: "Casey RIDER",
  },
  {
    CategoryName: "Solo",
    FullName: "Casey RIDER",
    Id: 79002,
    IsTeam: false,
    LapNumber: 2,
    LapTime: "2026-08-25T10:20:00.000",
    LapTimeSpan: "00:10:00.0000000",
    RaceNumber: "79",
    TeamNameDisplay: "Casey RIDER",
  },
];

const createCatalogPersistence = (
  initialLedger: EventCatalogLedger,
): EventCatalogPersistence => {
  let ledger: EventCatalogLedger = initialLedger;
  return {
    load: vi.fn(async (): Promise<EventCatalogLedger> => ledger),
    save: vi.fn(async (nextLedger: EventCatalogLedger): Promise<void> => {
      ledger = nextLedger;
    }),
  };
};

const createSystemConfigPersistence = (): SystemConfigPersistence => {
  let config: SystemConfiguration = createDefaultSystemConfiguration();
  return {
    load: vi.fn(async (): Promise<SystemConfiguration> => config),
    save: vi.fn(async (nextConfig: SystemConfiguration): Promise<void> => {
      config = nextConfig;
    }),
  };
};

const findButton = (
  container: HTMLElement,
  label: string,
): HTMLButtonElement => {
  const button: HTMLButtonElement | undefined = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button"),
  ).find(
    (candidate: HTMLButtonElement): boolean =>
      candidate.textContent?.includes(label) === true,
  );
  if (!button) {
    throw new Error(`Could not find button ${label}.`);
  }
  return button;
};

describe("Apical Recent Laps functional workflow", (): void => {
  useUiConsoleGuards();

  it("resumes from the MUI control, imports and broadcasts new laps, then displays them without duplicating unchanged rows", async (): Promise<void> => {
    const catalogPersistence: EventCatalogPersistence =
      createCatalogPersistence(createSeedEventCatalogLedger());
    const onPersistedLedger = vi.fn(
      async (_ledger: EventCatalogLedger): Promise<void> => undefined,
    );
    const catalogService: EventCatalogService =
      await EventCatalogService.create(catalogPersistence, {
        onPersistedLedger,
      });
    const event = catalogService.catalog.events.find((candidate): boolean =>
      candidate.name.includes("RaceSweet Round 1"),
    )!;
    const originalSessionIds: Set<string> = new Set<string>(
      catalogService.catalog.sessions.map((candidate): string => candidate.id),
    );
    const systemConfigPersistence: SystemConfigPersistence =
      createSystemConfigPersistence();
    const systemConfigService: SystemConfigService =
      await SystemConfigService.create(systemConfigPersistence);
    let config: SystemConfiguration = await systemConfigService.createSource(
      "api-apical-recent-laps",
    );
    const createdSource: DataSourceConfig = config.dataSources[0]!;
    config = await systemConfigService.updateSource(createdSource.id, {
      apiConfig: {
        ...createdSource.apiConfig!,
        apicalEventId: 79,
        baseUrl: "https://apical.example.com",
        live: false,
        pollingStopReason: "The active session appears complete.",
        pollingStoppedAt: "2026-08-25T10:37:31.000Z",
        selectedEventIds: [79],
      },
      name: "Apical Recent Laps",
    });
    await systemConfigService.assignSourcesToEvent(event.id, [
      createdSource.id,
    ]);
    config = systemConfigService.state;
    const source: DataSourceConfig = config.dataSources[0]!;
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async (): Promise<Response> =>
          new Response(JSON.stringify(recentLaps), { status: 200 }),
      );
    const container: HTMLDivElement = document.createElement("div");
    document.body.append(container);
    const root: Root = createRoot(container);
    let completeReload: (() => void) | undefined;
    let importedRecordCount: number = 0;
    let targetSession: ApicalRecentLapsTarget["session"] | undefined;
    const reloadCompleted: Promise<void> = new Promise<void>(
      (resolve: () => void): void => {
        completeReload = resolve;
      },
    );

    const reloadSource = async (): Promise<void> => {
      const requestedAt: string = new Date().toISOString();
      config = await systemConfigService.updateSource(source.id, {
        apiConfig: {
          ...source.apiConfig!,
          live: true,
          pollingResumedAt: requestedAt,
          pollingStopReason: undefined,
          pollingStoppedAt: undefined,
        },
      });
      const resumedSource: DataSourceConfig = config.dataSources[0]!;
      const target: ApicalRecentLapsTarget = await ensureApicalRecentLapsTarget(
        catalogService,
        systemConfigService,
        config,
        resumedSource,
      );
      config = target.config;
      targetSession = target.session;
      const incomingRaceState: Partial<RaceState> =
        await fetchApicalRecentLapsRaceState(
          resumedSource,
          target.eventId,
          event.date,
          event.timeZone || "Australia/Sydney",
        );
      const mergeResult: ApicalRecentLapsMergeResult =
        mergeApicalRecentLapsRaceState(
          catalogService.getImportedRaceState(
            target.eventId,
            target.session.id,
          ),
          incomingRaceState,
        );
      importedRecordCount = mergeResult.raceState.records?.length || 0;
      if (mergeResult.summary.changed) {
        await catalogService.updateImportedRaceState(
          target.eventId,
          target.session.id,
          mergeResult.raceState,
        );
      }
      completeReload?.();
    };

    onPersistedLedger.mockClear();
    try {
      await act(async (): Promise<void> => {
        root.render(
          <DataSourcesPanel
            dataSources={[source]}
            onCreateSource={(): void => undefined}
            onDeleteSource={(): void => undefined}
            onFetchApicalDataNow={reloadSource}
            onLoadApicalEvents={(): void => undefined}
            onReprocessApicalData={(): void => undefined}
            onSaveSource={(): void => undefined}
          />,
        );
      });
      expect(container.textContent).toContain("Polling stopped");

      await act(async (): Promise<void> => {
        findButton(container, "Reload now and resume polling").click();
        await reloadCompleted;
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(
        /recentlap\/getall\?eventId=79&_=\d+/,
      );
      expect(systemConfigService.state.dataSources[0]?.apiConfig?.live).toBe(
        true,
      );
      expect(
        systemConfigService.state.sessionSourceAssignments[targetSession!.id]
          ?.sourceIds,
      ).toEqual([source.id]);
      expect(originalSessionIds.has(targetSession!.id)).toBe(false);
      expect(targetSession).toMatchObject({
        kind: "race",
        name: "Apical Recent Laps",
        status: "live",
      });
      expect(
        catalogService.catalog.events.find(
          (candidate): boolean => candidate.id === event.id,
        )?.discipline,
      ).toBe("cycling");
      expect(getCategoriesForEvent(catalogService.catalog, event.id)).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "Solo" })]),
      );
      expect(getEntrantsForEvent(catalogService.catalog, event.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "Casey RIDER" }),
        ]),
      );
      const catalogSaveCountAfterImport: number = vi.mocked(
        catalogPersistence.save,
      ).mock.calls.length;
      const broadcastCountAfterImport: number =
        onPersistedLedger.mock.calls.length;
      expect(catalogSaveCountAfterImport).toBeGreaterThanOrEqual(5);
      expect(broadcastCountAfterImport).toBe(catalogSaveCountAfterImport);

      const importedRaceState: Partial<RaceState> =
        catalogService.getImportedRaceState(event.id, targetSession!.id)!;
      expect(importedRecordCount).toBeGreaterThanOrEqual(2);
      expect(importedRaceState.records).toHaveLength(importedRecordCount);
      await reloadSource();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(catalogPersistence.save).toHaveBeenCalledTimes(
        catalogSaveCountAfterImport,
      );
      expect(onPersistedLedger).toHaveBeenCalledTimes(
        broadcastCountAfterImport,
      );
      const unchangedResult: ApicalRecentLapsMergeResult =
        mergeApicalRecentLapsRaceState(importedRaceState, importedRaceState);
      expect(unchangedResult.summary.changed).toBe(false);
      expect(unchangedResult.raceState.records).toHaveLength(
        importedRecordCount,
      );

      await act(async (): Promise<void> => {
        root.render(
          <TimingContext
            activeSession={targetSession}
            categoryListSelected={(): void => undefined}
            eventTimeZone={event.timeZone || "Australia/Sydney"}
            events={[event]}
            onAddRecord={(): void => undefined}
            onAssignFlagCategory={(): void => undefined}
            onChangeCategory={(): void => undefined}
            onEditRecord={(): void => undefined}
            onExclude={(): void => undefined}
            onMarkFlagDeleted={(): void => undefined}
            onRemoveFlagCategory={(): void => undefined}
            onSelectEvent={(): void => undefined}
            onSelectSession={(): void => undefined}
            onTimeDisplayZoneModeChange={(): void => undefined}
            participantSelected={(): void => undefined}
            raceState={
              new Session({
                categories: importedRaceState.categories || [],
                entries: importedRaceState.entries || [],
                participants: importedRaceState.participants || [],
                records: importedRaceState.records || [],
                teams: importedRaceState.teams || [],
                timeRecordSources: importedRaceState.timeRecordSources || [],
              })
            }
            selectedCategories={new Set<string>()}
            selectedParticipants={new Set<string>()}
            sessions={[targetSession!]}
            timeDisplayZoneMode="event"
            timingEvent={event}
            timingSessionValue={targetSession!.id}
          />,
        );
      });
      expect(container.querySelectorAll("tr[data-record-id]")).toHaveLength(
        importedRecordCount,
      );
    } finally {
      fetchMock.mockRestore();
      await act(async (): Promise<void> => {
        root.unmount();
      });
      container.remove();
    }
  });
});
