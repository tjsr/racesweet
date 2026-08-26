import { describe, expect, it, vi } from "vitest";
import { createSeedEventCatalogLedger } from "../ledger/createSeedEventCatalogLedger.js";
import type { EventCatalogLedger } from "../ledger/eventCatalogLedger.js";
import { createEventId } from "../model/ids.js";
import type { RaceState } from "../model/racestate.js";
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
  type ApicalRecentLapsTarget,
} from "./apicalRecentLapsDataSource.js";
import {
  createDefaultSystemConfiguration,
  type DataSourceConfig,
  type SystemConfiguration,
} from "./systemConfig.js";

const eventId = createEventId("apical-recent-laps-test-event");

const laps: ApicalRecentLap[] = [
  {
    CategoryName: "A",
    FullName: "Alex RIDER",
    Id: 101,
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
    Id: 102,
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
    baseUrl: "https://apical.example.com/",
    companyId: 2,
    httpTimeoutSeconds: 30,
    live: true,
    pollIntervalSeconds: 30,
    selectedEventIds: [79],
  },
  enabled: true,
  id: "source-recent-laps",
  name: "Recent laps",
  type: "api-apical-recent-laps",
};

const createCatalogPersistence = (): EventCatalogPersistence => {
  let ledger: EventCatalogLedger = createSeedEventCatalogLedger();
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

describe("Apical Recent Laps data source", (): void => {
  it("creates and reuses a cycling race session for an event-assigned source", async (): Promise<void> => {
    const catalogService: EventCatalogService =
      await EventCatalogService.create(createCatalogPersistence());
    const configService: SystemConfigService = await SystemConfigService.create(
      createSystemConfigPersistence(),
    );
    const event = catalogService.catalog.events[0]!;
    await configService.createSource("api-apical-recent-laps");
    const configuredSource: DataSourceConfig = {
      ...source,
      id: configService.state.dataSources[0]!.id,
    };
    await configService.updateSource(configuredSource.id, configuredSource);
    const assignedConfig: SystemConfiguration =
      await configService.assignSourcesToEvent(event.id, [configuredSource.id]);

    const createdTarget: ApicalRecentLapsTarget =
      await ensureApicalRecentLapsTarget(
        catalogService,
        configService,
        assignedConfig,
        configuredSource,
      );
    const reusedTarget: ApicalRecentLapsTarget =
      await ensureApicalRecentLapsTarget(
        catalogService,
        configService,
        createdTarget.config,
        configuredSource,
      );

    expect(createdTarget.sessionCreated).toBe(true);
    expect(createdTarget.session).toMatchObject({
      kind: "race",
      name: "Recent laps",
      status: "live",
    });
    expect(
      catalogService.catalog.events.find(
        (candidate): boolean => candidate.id === event.id,
      )?.discipline,
    ).toBe("cycling");
    expect(reusedTarget).toMatchObject({
      eventId: event.id,
      session: { id: createdTarget.session.id },
      sessionCreated: false,
    });
  });

  it("builds a cache-busted endpoint URL", (): void => {
    expect(getApicalRecentLapsUrl(source.apiConfig!.baseUrl, 79, 12345)).toBe(
      "https://apical.example.com/raceresult/recentlap/getall?eventId=79&_=12345",
    );
  });

  it("validates and groups recent laps with cumulative timing", (): void => {
    const parsed: ApicalRecentLap[] = parseApicalRecentLapsPayload(laps);
    const categories = convertApicalRecentLapsToCategoryData(parsed);

    expect(categories).toHaveLength(1);
    expect(categories[0]?.ParticipantViewModels).toHaveLength(1);
    expect(
      categories[0]?.ParticipantViewModels[0]?.LapByCategoryViewModels[1],
    ).toMatchObject({
      CumulativeSeconds: 1200,
      Id: 102,
      TimeOfDay: "10:20:00.000",
    });
    expect(() => parseApicalRecentLapsPayload([{ Id: "bad" }])).toThrow(
      "invalid JSON payload",
    );
  });

  it("fetches JSON and converts it into competitors, categories, and crossings", async (): Promise<void> => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(laps), { status: 200 }));

    const raceState: Partial<RaceState> = await fetchApicalRecentLapsRaceState(
      source,
      eventId,
      "2026-08-25",
      "Australia/Sydney",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/recentlap\/getall\?eventId=79&_=[0-9]+$/u),
      expect.objectContaining({ method: "GET" }),
    );
    expect(raceState.categories).toHaveLength(1);
    expect(raceState.participants).toHaveLength(1);
    expect(
      raceState.records?.filter((record) => "participantId" in record),
    ).toHaveLength(2);
    fetchMock.mockRestore();
  });

  it("adds new rows, replaces rare row updates, and ignores unchanged rows", async (): Promise<void> => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(laps), { status: 200 }));
    const initial: Partial<RaceState> = await fetchApicalRecentLapsRaceState(
      source,
      eventId,
      "2026-08-25",
      "Australia/Sydney",
    );
    const unchanged = mergeApicalRecentLapsRaceState(initial, initial);
    expect(unchanged.summary).toMatchObject({
      addedRecords: 0,
      changed: false,
      updatedRecords: 0,
    });

    const changedIncoming: Partial<RaceState> = {
      ...initial,
      records: initial.records?.map((record, index) =>
        index === 1
          ? { ...record, time: new Date(record.time!.getTime() + 1000) }
          : record,
      ),
    };
    const changed = mergeApicalRecentLapsRaceState(initial, changedIncoming);
    expect(changed.summary.updatedRecords).toBe(1);
    expect(changed.raceState.records).toHaveLength(initial.records!.length);
    fetchMock.mockRestore();
  });

  it("stops for completed sessions or after 175% of the prior competitor average", async (): Promise<void> => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(laps), { status: 200 }));
    const raceState: Partial<RaceState> = await fetchApicalRecentLapsRaceState(
      source,
      eventId,
      "2026-08-25",
      "Australia/Sydney",
    );

    expect(
      getApicalRecentLapsPollingDecision(
        raceState,
        "live",
        new Date("2026-08-25T10:37:31+10:00"),
      ).shouldStop,
    ).toBe(true);
    expect(
      getApicalRecentLapsPollingDecision(
        raceState,
        "live",
        new Date("2026-08-25T10:37:31+10:00"),
        "2026-08-25T00:35:00.000Z",
      ).shouldStop,
    ).toBe(false);
    expect(
      getApicalRecentLapsPollingDecision(raceState, "completed").shouldStop,
    ).toBe(true);
    fetchMock.mockRestore();
  });
});
