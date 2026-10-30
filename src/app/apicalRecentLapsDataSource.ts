import type {
  EventCatalogSession,
  EventCatalogState,
} from "../catalog/eventCatalog.js";
import type {
  ApicalCategoryResult,
  ApicalLapByCategory,
  ApicalLapByCategoryViewModel,
  ApicalParticipantViewModel,
} from "../model/apical.js";
import type { EventCategory } from "../model/eventcategory.js";
import type { EventParticipant } from "../model/eventparticipant.js";
import { createTimeRecordId } from "../model/ids.js";
import type { EventId } from "../model/raceevent.js";
import type { RaceState } from "../model/racestate.js";
import type { TimeRecord } from "../model/timerecord.js";
import {
  apicalTimeOfDayToDate,
  apicalTimeToMilliseconds,
  convertDataToRaceState,
} from "../parsers/apical.js";
import { inferTransponderFromRaceNumber } from "../processing/transponder.js";
import type { EventCatalogService } from "../service/eventCatalogService.js";
import type { SystemConfigService } from "../service/systemConfigService.js";
import { getErrorMessage } from "../utils.js";
import {
  createAuthenticatedHeaders,
  fetchApicalResponse,
  getConfiguredApicalEventId,
} from "./apicalDataSource.js";
import type { DataSourceConfig, SystemConfiguration } from "./systemConfig.js";

export interface ApicalRecentLap {
  CategoryName: string;
  FullName: string;
  Id: number;
  IsTeam: boolean;
  LapNumber: number;
  LapTime: string;
  LapTimeSpan: string | number;
  RaceNumber: string;
  TeamNameDisplay: string;
}

export interface ApicalRecentLapsMergeSummary {
  addedRecords: number;
  changed: boolean;
  unchangedRecords: number;
  updatedRecords: number;
}

export interface ApicalRecentLapsMergeResult {
  raceState: Partial<RaceState>;
  summary: ApicalRecentLapsMergeSummary;
}

export interface ApicalRecentLapsPollingDecision {
  averageLapTimeMilliseconds?: number;
  inactivityMilliseconds?: number;
  reason?: string;
  shouldStop: boolean;
}

export interface ApicalRecentLapsTarget {
  catalog: EventCatalogState;
  config: SystemConfiguration;
  eventId: EventId;
  session: EventCatalogSession;
  sessionCreated: boolean;
}

export const ensureApicalRecentLapsTarget = async (
  eventCatalogService: Pick<
    EventCatalogService,
    | "activateSession"
    | "catalog"
    | "createSession"
    | "updateEvent"
    | "updateSession"
  >,
  systemConfigService: Pick<SystemConfigService, "assignSourcesToSession">,
  config: SystemConfiguration,
  source: DataSourceConfig,
): Promise<ApicalRecentLapsTarget> => {
  const explicitlyAssignedSessions: EventCatalogSession[] =
    eventCatalogService.catalog.sessions.filter(
      (session: EventCatalogSession): boolean =>
        config.sessionSourceAssignments[session.id]?.sourceIds.includes(
          source.id,
        ) === true,
    );
  const existingSession: EventCatalogSession | undefined =
    explicitlyAssignedSessions.find(
      (session: EventCatalogSession): boolean =>
        session.eventId === eventCatalogService.catalog.activeEventId &&
        session.id === eventCatalogService.catalog.activeSessionId,
    ) || explicitlyAssignedSessions[0];
  if (existingSession) {
    return {
      catalog: eventCatalogService.catalog,
      config,
      eventId: existingSession.eventId,
      session: existingSession,
      sessionCreated: false,
    };
  }

  const assignedEventIds: EventId[] = Object.entries(
    config.eventSourceAssignments,
  )
    .filter(([_eventId, sourceIds]: [string, string[]]): boolean =>
      sourceIds.includes(source.id),
    )
    .map(([eventId]: [string, string[]]): EventId => eventId as EventId)
    .filter((eventId: EventId): boolean =>
      eventCatalogService.catalog.events.some(
        (event): boolean => event.id === eventId,
      ),
    );
  const eventId: EventId | undefined = assignedEventIds.includes(
    eventCatalogService.catalog.activeEventId!,
  )
    ? eventCatalogService.catalog.activeEventId
    : assignedEventIds[0];
  if (!eventId) {
    throw new Error(
      "Assign this Apical Recent Laps source to an event before loading it.",
    );
  }

  const previousSessionIds: Set<string> = new Set<string>(
    eventCatalogService.catalog.sessions.map(
      (session: EventCatalogSession): string => session.id,
    ),
  );
  await eventCatalogService.createSession(eventId);
  const createdSession: EventCatalogSession | undefined =
    eventCatalogService.catalog.sessions.find(
      (session: EventCatalogSession): boolean =>
        session.eventId === eventId && !previousSessionIds.has(session.id),
    );
  if (!createdSession) {
    throw new Error("Could not create an Apical Recent Laps session.");
  }

  await eventCatalogService.updateEvent(eventId, { discipline: "cycling" });
  await eventCatalogService.updateSession(createdSession.id, {
    kind: "race",
    name: source.name,
  });
  const catalog: EventCatalogState = await eventCatalogService.activateSession(
    eventId,
    createdSession.id,
  );
  const nextConfig: SystemConfiguration =
    await systemConfigService.assignSourcesToSession(createdSession.id, {
      mode: "specific",
      sourceIds: [source.id],
    });
  const session: EventCatalogSession = catalog.sessions.find(
    (candidate: EventCatalogSession): boolean =>
      candidate.id === createdSession.id,
  )!;
  return {
    catalog,
    config: nextConfig,
    eventId,
    session,
    sessionCreated: true,
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isRecentLap = (value: unknown): value is ApicalRecentLap => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.CategoryName === "string" &&
    typeof value.FullName === "string" &&
    typeof value.Id === "number" &&
    typeof value.IsTeam === "boolean" &&
    typeof value.LapNumber === "number" &&
    typeof value.LapTime === "string" &&
    (typeof value.LapTimeSpan === "string" ||
      typeof value.LapTimeSpan === "number") &&
    typeof value.RaceNumber === "string" &&
    typeof value.TeamNameDisplay === "string"
  );
};

export const parseApicalRecentLapsPayload = (
  payload: unknown,
): ApicalRecentLap[] => {
  if (!Array.isArray(payload) || !payload.every(isRecentLap)) {
    throw new Error("Apical Recent Laps returned an invalid JSON payload.");
  }

  return payload;
};

const getTimeOfDay = (lapTime: string): string => {
  const timeSeparatorIndex: number = lapTime.indexOf("T");
  if (timeSeparatorIndex < 0 || timeSeparatorIndex === lapTime.length - 1) {
    throw new Error(
      `Apical Recent Laps returned an invalid LapTime: ${lapTime}`,
    );
  }

  return lapTime.slice(timeSeparatorIndex + 1);
};

const getParticipantKey = (lap: ApicalRecentLap): string =>
  lap.IsTeam
    ? `team:${lap.CategoryName}:${lap.TeamNameDisplay}`
    : `competitor:${lap.CategoryName}:${lap.RaceNumber}`;

export const convertApicalRecentLapsToCategoryData = (
  laps: ApicalRecentLap[],
): ApicalLapByCategory => {
  const lapsByParticipant: Map<string, ApicalRecentLap[]> = new Map<
    string,
    ApicalRecentLap[]
  >();
  laps.forEach((lap: ApicalRecentLap): void => {
    const key: string = getParticipantKey(lap);
    lapsByParticipant.set(key, [...(lapsByParticipant.get(key) || []), lap]);
  });

  const participantsByCategory: Map<string, ApicalParticipantViewModel[]> =
    new Map<string, ApicalParticipantViewModel[]>();
  lapsByParticipant.forEach((participantLaps: ApicalRecentLap[]): void => {
    const orderedLaps: ApicalRecentLap[] = [...participantLaps].sort(
      (left: ApicalRecentLap, right: ApicalRecentLap): number =>
        left.LapNumber - right.LapNumber || left.Id - right.Id,
    );
    let cumulativeMilliseconds: number = 0;
    const lapViewModels: ApicalLapByCategoryViewModel[] = orderedLaps.map(
      (lap: ApicalRecentLap): ApicalLapByCategoryViewModel => {
        cumulativeMilliseconds += apicalTimeToMilliseconds(lap.LapTimeSpan);
        return {
          CumulativeSeconds: cumulativeMilliseconds / 1000,
          CumulativeLapTimeSpan: cumulativeMilliseconds,
          FullName: lap.FullName,
          Id: lap.Id,
          LapNumber: lap.LapNumber,
          LapTimeSpan: lap.LapTimeSpan,
          RaceNumber: lap.RaceNumber,
          TimeOfDay: getTimeOfDay(lap.LapTime),
        };
      },
    );
    const firstLap: ApicalRecentLap = orderedLaps[0]!;
    const participant: ApicalParticipantViewModel = {
      CategoryName: firstLap.CategoryName,
      IsTeamEntrant: firstLap.IsTeam,
      LapByCategoryViewModels: lapViewModels,
      NumberOfLaps: Math.max(
        ...orderedLaps.map((lap: ApicalRecentLap): number => lap.LapNumber),
      ),
      Position: 0,
      RaceNumbers: orderedLaps
        .map((lap: ApicalRecentLap): string => lap.RaceNumber)
        .filter(
          (raceNumber: string, index: number, values: string[]): boolean =>
            values.indexOf(raceNumber) === index,
        )
        .join(","),
      TeamDisplayName: firstLap.TeamNameDisplay,
      TeamNameDisplay: firstLap.TeamNameDisplay,
      TotalTimeSpan: cumulativeMilliseconds,
    };
    participantsByCategory.set(firstLap.CategoryName, [
      ...(participantsByCategory.get(firstLap.CategoryName) || []),
      participant,
    ]);
  });

  return Array.from(participantsByCategory.entries()).map(
    ([categoryName, participants]: [
      string,
      ApicalParticipantViewModel[],
    ]): ApicalCategoryResult => ({
      CategoryName: categoryName,
      ParticipantViewModels: participants,
    }),
  );
};

export const getApicalRecentLapsUrl = (
  baseUrl: string,
  apicalEventId: number,
  timestamp: number = Date.now(),
): string =>
  `${baseUrl.replace(/\/$/u, "")}/raceresult/recentlap/getall?eventId=${apicalEventId}&_=${timestamp}`;

const stabilizeRecentLapRecordIds = (
  raceState: Partial<RaceState>,
  categoryData: ApicalLapByCategory,
  eventId: EventId,
  eventDate: Date,
  timeZone: string,
): Partial<RaceState> => {
  const stableIdsByGeneratedId: Map<string, TimeRecord["id"]> = new Map<
    string,
    TimeRecord["id"]
  >();
  categoryData.forEach((category: ApicalCategoryResult): void => {
    category.ParticipantViewModels.forEach(
      (participant: ApicalParticipantViewModel): void => {
        participant.LapByCategoryViewModels.forEach(
          (lap: ApicalLapByCategoryViewModel): void => {
            const transponderNumber: number = inferTransponderFromRaceNumber(
              lap.RaceNumber,
              200000,
            );
            const crossingTime: Date = apicalTimeOfDayToDate(
              eventDate,
              lap.TimeOfDay!,
              timeZone,
            );
            const generatedSeed: string = [
              "apical-crossing",
              eventId,
              lap.Id,
              lap.RaceNumber,
              lap.LapNumber,
              transponderNumber,
              crossingTime.toISOString(),
            ].join(":");
            const stableSeed: string = [
              "apical-recent-lap",
              eventId,
              lap.Id,
            ].join(":");
            stableIdsByGeneratedId.set(
              createTimeRecordId(generatedSeed).toString(),
              createTimeRecordId(stableSeed),
            );
          },
        );
      },
    );
  });

  return {
    ...raceState,
    records: (raceState.records || []).map(
      (record: TimeRecord): TimeRecord => ({
        ...record,
        id: stableIdsByGeneratedId.get(record.id.toString()) || record.id,
      }),
    ),
  };
};

export const fetchApicalRecentLapsRaceState = async (
  source: DataSourceConfig,
  eventId: EventId,
  eventDate: string,
  timeZone: string,
): Promise<Partial<RaceState>> => {
  if (source.type !== "api-apical-recent-laps" || !source.apiConfig) {
    throw new Error(`Unsupported Apical Recent Laps source: ${source.type}`);
  }
  const apicalEventId: number | undefined = getConfiguredApicalEventId(source);
  if (!apicalEventId) {
    throw new Error("No Apical event id is configured for this source.");
  }

  const url: string = getApicalRecentLapsUrl(
    source.apiConfig.baseUrl,
    apicalEventId,
  );
  try {
    const response: Response = await fetchApicalResponse(
      "recent laps",
      url,
      {
        credentials: "include",
        headers: createAuthenticatedHeaders(source),
        method: "GET",
      },
      source.apiConfig.httpTimeoutSeconds * 1000,
    );
    const payload: unknown = await response.json();
    const categoryData: ApicalLapByCategory =
      convertApicalRecentLapsToCategoryData(
        parseApicalRecentLapsPayload(payload),
      );
    const eventStartDate: Date = new Date(eventDate);
    return stabilizeRecentLapRecordIds(
      convertDataToRaceState(
        eventId,
        eventStartDate,
        categoryData,
        200000,
        timeZone,
      ),
      categoryData,
      eventId,
      eventStartDate,
      timeZone,
    );
  } catch (error: unknown) {
    throw new Error(
      `Failed to fetch Apical Recent Laps for event id ${apicalEventId}: ${getErrorMessage(error)}`,
      { cause: error },
    );
  }
};

const serializeEntity = (value: object): string =>
  JSON.stringify(value, (_key: string, item: unknown): unknown =>
    item instanceof Date ? item.toISOString() : item,
  );

const mergeById = <T extends { id: { toString(): string } }>(
  existing: T[],
  incoming: T[],
  replaceExisting: boolean,
): T[] => {
  const merged: Map<string, T> = new Map<string, T>(
    existing.map((item: T): [string, T] => [item.id.toString(), item]),
  );
  incoming.forEach((item: T): void => {
    const id: string = item.id.toString();
    if (replaceExisting || !merged.has(id)) {
      merged.set(id, item);
    }
  });
  return Array.from(merged.values());
};

export const mergeApicalRecentLapsRaceState = (
  existing: Partial<RaceState> | undefined,
  incoming: Partial<RaceState>,
): ApicalRecentLapsMergeResult => {
  const existingRecordsById: Map<string, TimeRecord> = new Map<
    string,
    TimeRecord
  >(
    (existing?.records || []).map(
      (record: TimeRecord): [string, TimeRecord] => [
        record.id.toString(),
        record,
      ],
    ),
  );
  let addedRecords: number = 0;
  let unchangedRecords: number = 0;
  let updatedRecords: number = 0;
  (incoming.records || []).forEach((record: TimeRecord): void => {
    const existingRecord: TimeRecord | undefined = existingRecordsById.get(
      record.id.toString(),
    );
    if (!existingRecord) {
      addedRecords += 1;
    } else if (serializeEntity(existingRecord) === serializeEntity(record)) {
      unchangedRecords += 1;
    } else {
      updatedRecords += 1;
    }
  });

  const raceState: Partial<RaceState> = {
    ...existing,
    categories: mergeById<EventCategory>(
      existing?.categories || [],
      incoming.categories || [],
      false,
    ),
    eventStartTime: existing?.eventStartTime || incoming.eventStartTime,
    participants: mergeById<EventParticipant>(
      existing?.participants || [],
      incoming.participants || [],
      false,
    ),
    records: mergeById<TimeRecord>(
      existing?.records || [],
      incoming.records || [],
      true,
    ).sort(
      (left: TimeRecord, right: TimeRecord): number =>
        (left.time?.getTime() || 0) - (right.time?.getTime() || 0),
    ),
    teams: mergeById(existing?.teams || [], incoming.teams || [], false),
  };
  const scaffoldChanged: boolean =
    (raceState.categories?.length || 0) !==
      (existing?.categories?.length || 0) ||
    (raceState.participants?.length || 0) !==
      (existing?.participants?.length || 0) ||
    (raceState.teams?.length || 0) !== (existing?.teams?.length || 0);

  return {
    raceState,
    summary: {
      addedRecords,
      changed: addedRecords > 0 || updatedRecords > 0 || scaffoldChanged,
      unchangedRecords,
      updatedRecords,
    },
  };
};

export const getApicalRecentLapsPollingDecision = (
  _raceState: Partial<RaceState>,
  sessionStatus: EventCatalogSession["status"],
  _now: Date = new Date(),
  _pollingResumedAt?: string,
): ApicalRecentLapsPollingDecision => {
  if (sessionStatus === "completed") {
    return { reason: "The active session is complete.", shouldStop: true };
  }

  // A live Apical feed can have a gap between records that is longer than the
  // previous lap average. Keep its configured interval alive until the session
  // itself is explicitly completed so late records are not missed.
  return { shouldStop: false };
};
