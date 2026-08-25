import { describe, expect, it, vi } from "vitest";
import {
  getCategoriesForEvent,
  getEntrantsForEvent,
} from "../catalog/eventCatalog.js";
import { createSeedEventCatalogLedger } from "../ledger/createSeedEventCatalogLedger.js";
import type { EventCatalogLedger } from "../ledger/eventCatalogLedger.js";
import type { EventCatalogPersistence } from "../persistence/eventCatalogPersistence.js";
import type { SystemConfigPersistence } from "../persistence/systemConfigPersistence.js";
import { EventCatalogService } from "../service/eventCatalogService.js";
import { SystemConfigService } from "../service/systemConfigService.js";
import {
  convertApicalRecentLapsToCategoryData,
  ensureApicalRecentLapsTarget,
  fetchApicalRecentLapsRaceState,
  getApicalRecentLapsPollingDecision,
  getApicalRecentLapsUrl,
  mergeApicalRecentLapsRaceState,
  parseApicalRecentLapsPayload,
  type ApicalRecentLap,
  type ApicalRecentLapsMergeResult,
  type ApicalRecentLapsTarget,
} from "./apicalRecentLapsDataSource.js";
import {
  createDefaultSystemConfiguration,
  type DataSourceConfig,
  type SystemConfiguration,
} from "./systemConfig.js";

const recentLaps: ApicalRecentLap[] = [
  {
    CategoryName: "A",
    FullName: "Alex RIDER",
    Id: 7001,
    IsTeam: false,
    LapNumber: 1,
    LapTime: "2026-08-25T10:10:00.000",
    LapTimeSpan: "00:10:00.0000000",
    RaceNumber: "12",
    TeamNameDisplay: "Alex RIDER",
  },
  {
    CategoryName: "A",
    FullName: "Alex RIDER",
    Id: 7002,
    IsTeam: false,
    LapNumber: 2,
    LapTime: "2026-08-25T10:20:00.000",
    LapTimeSpan: "00:10:00.0000000",
    RaceNumber: "12",
    TeamNameDisplay: "Alex RIDER",
  },
];

const source: DataSourceConfig = {
  apiConfig: {
    apicalEventId: 79,
    authHeaderName: "Authorization",
    authHeaderValue: "",
    baseUrl: "https://apical.example.com",
    companyId: 2,
    httpTimeoutSeconds: 30,
    live: true,
    pollIntervalSeconds: 30,
    selectedEventIds: [79],
  },
  enabled: true,
  id: "source-apical-recent",
  name: "Apical Recent Laps",
  type: "api-apical-recent-laps",
};

const createPersistence = (
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

describe("Apical Recent Laps import orchestration", (): void => {
  it("scaffolds only the assigned event and broadcasts changed ledger records", async (): Promise<void> => {
    const onPersistedLedger = vi.fn(
      async (_ledger: EventCatalogLedger): Promise<void> => undefined,
    );
    const service: EventCatalogService = await EventCatalogService.create(
      createPersistence(createSeedEventCatalogLedger()),
      { onPersistedLedger },
    );
    await service.createEvent();
    const importedEvent = service.catalog.events.find((event): boolean =>
      event.name.includes("RaceSweet Round 1"),
    )!;
    const unrelatedEvent = service.catalog.events.find(
      (event): boolean => event.id !== importedEvent.id,
    )!;
    const originalSessionIds: Set<string> = new Set<string>(
      service.catalog.sessions.map((session): string => session.id),
    );
    const configService: SystemConfigService = await SystemConfigService.create(
      createSystemConfigPersistence(),
    );
    await configService.createSource("api-apical-recent-laps");
    const configuredSource: DataSourceConfig = {
      ...source,
      id: configService.state.dataSources[0]!.id,
    };
    await configService.updateSource(configuredSource.id, configuredSource);
    const assignedConfig: SystemConfiguration =
      await configService.assignSourcesToEvent(importedEvent.id, [
        configuredSource.id,
      ]);
    const target: ApicalRecentLapsTarget = await ensureApicalRecentLapsTarget(
      service,
      configService,
      assignedConfig,
      configuredSource,
    );
    expect(target.sessionCreated).toBe(true);
    expect(originalSessionIds.has(target.session.id)).toBe(false);
    expect(target.session).toMatchObject({
      kind: "race",
      name: "Apical Recent Laps",
      status: "live",
    });
    expect(
      service.catalog.events.find((event) => event.id === importedEvent.id)
        ?.discipline,
    ).toBe("cycling");
    expect(
      configService.state.sessionSourceAssignments[target.session.id],
    ).toEqual({ mode: "specific", sourceIds: [configuredSource.id] });
    onPersistedLedger.mockClear();

    expect(getApicalRecentLapsUrl(source.apiConfig!.baseUrl, 79, 1)).toContain(
      "eventId=79&_=1",
    );
    expect(
      convertApicalRecentLapsToCategoryData(
        parseApicalRecentLapsPayload(recentLaps),
      ),
    ).toHaveLength(1);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(recentLaps), { status: 200 }),
      );
    const incomingRaceState = await fetchApicalRecentLapsRaceState(
      configuredSource,
      importedEvent.id,
      importedEvent.date,
      importedEvent.timeZone || "Australia/Sydney",
    );
    const mergeResult: ApicalRecentLapsMergeResult =
      mergeApicalRecentLapsRaceState(undefined, incomingRaceState);

    expect(mergeResult.summary.addedRecords).toBeGreaterThan(0);
    await service.updateImportedRaceState(
      importedEvent.id,
      target.session.id,
      mergeResult.raceState,
    );

    expect(getCategoriesForEvent(service.catalog, importedEvent.id)).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "A" })]),
    );
    expect(getEntrantsForEvent(service.catalog, importedEvent.id)).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Alex RIDER" })]),
    );
    expect(getCategoriesForEvent(service.catalog, unrelatedEvent.id)).toEqual(
      [],
    );
    expect(getEntrantsForEvent(service.catalog, unrelatedEvent.id)).toEqual([]);
    expect(
      service.catalog.sessions.find(
        (session) => session.id === target.session.id,
      )?.categoryIds,
    ).toHaveLength(1);
    expect(onPersistedLedger).toHaveBeenCalledTimes(1);
    expect(onPersistedLedger.mock.calls[0]?.[0].mutations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventId: importedEvent.id,
          sessionId: target.session.id,
          type: "race-state-imported",
        }),
      ]),
    );

    const targetUnchanged: ApicalRecentLapsMergeResult =
      mergeApicalRecentLapsRaceState(
        service.getImportedRaceState(importedEvent.id, target.session.id),
        incomingRaceState,
      );
    expect(targetUnchanged.summary.changed).toBe(false);
    expect(
      getApicalRecentLapsPollingDecision(
        targetUnchanged.raceState,
        "live",
        new Date("2026-08-25T10:37:31+10:00"),
      ).shouldStop,
    ).toBe(true);
    expect(onPersistedLedger).toHaveBeenCalledTimes(1);
    fetchMock.mockRestore();
  });
});
