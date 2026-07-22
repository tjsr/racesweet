import { validate as validateUuid } from "uuid";

import type { MasterEntrantProfile } from "../app/systemConfig.js";
import { getSystemTimeZone } from "../app/utils/timeutils.js";
import {
  type CategoryDistanceRule,
  type CategoryTeamRules,
  type EntrantType,
  type EventCatalogCategory,
  type EventCatalogEntrant,
  type EventCatalogEntry,
  type EventCatalogSession,
  type EventCatalogState,
  type ParticipantEntrantMembership,
  getCategoriesForEvent,
  getEntriesForEvent,
  getEntrantsForEvent,
  getEventDisciplineLabels,
  getParticipantEntrantMemberships,
} from "../catalog/eventCatalog.js";
import {
  CategoryId,
  normalizeCategoryResultExclusion,
} from "../processing/category.js";
import {
  type EntrantImportRecord,
  isPlaceholderEntrantName,
} from "../processing/entrantImport.js";
import { createSeedEventCatalogLedger } from "../ledger/createSeedEventCatalogLedger.js";
import {
  type EventCatalogLedger,
  type EventCatalogMutation,
  applyEventCatalogLedger,
  applyEventCatalogLedgerWithProgress,
  applyEventCatalogMutation,
} from "../ledger/eventCatalogLedger.js";
import { incrementLoadingMetric } from "../loadingMetrics.js";
import type { LoadingProgressCallback } from "../loadingProgress.js";
import { EventEntrantId } from "../model/entrant.js";
import type { EventEntryId } from '../model/entry.js';
import type { EventCategory, EventCategoryId } from "../model/eventcategory.js";
import type { EventParticipant } from "../model/eventparticipant.js";
import type { EventTeam } from "../model/eventteam.js";
import {
  createCategoryId,
  createEventEntrantId,
  createEventId,
  createEventParticipantId,
  createId,
  createSessionId,
  rewriteImportedObjectIds,
} from "../model/ids.js";
import { getParticipantDisplayName } from "../model/participantDisplay.js";
import { EventId, SessionId } from "../model/raceevent.js";
import type { RaceState } from "../model/racestate.js";
import type { EventTimeRecord, TimeRecord } from "../model/timerecord.js";
import {
  MR_SCATS_DEFAULT_TIME_ZONE,
  type MrScatsCatalogImport,
} from "../parsers/mrScats/catalogImport.js";
import type { EventCatalogPersistence } from "../persistence/eventCatalogPersistence.js";
import { addMissingLinkedCategoryPlaceholders } from "../service/sessionSourceReload.js";

interface ApicalCatalogImport {
  apicalDataFilePath?: string;
  eventDate?: string;
  eventId: EventId;
  eventName: string;
  raceState: Partial<RaceState>;
  sessionId: SessionId;
  timeZone?: string;
}

const getMrScatsSessionKind = (
  eventType: string | undefined,
): EventCatalogSession["kind"] => {
  switch (eventType?.toUpperCase()) {
    case "Q":
      return "qualifying";
    case "R":
      return "race";
    case "S":
      return "practice";
    default:
      return "other";
  }
};

const filterRaceStateForCategories = (
  raceState: Partial<RaceState>,
  categoryIds: string[],
  sessionId?: SessionId,
): Partial<RaceState> => {
  const categoryIdSet = new Set(categoryIds);
  return {
    ...raceState,
    categories: (raceState.categories || []).filter((category) =>
      categoryIdSet.has(category.id.toString()),
    ),
    participants: (raceState.participants || []).filter((participant) =>
      participant.categoryId !== undefined &&
      categoryIdSet.has(participant.categoryId.toString()),
    ),
    records: (raceState.records || []).filter((record) => {
      const recordSessionId = (record as EventTimeRecord).sessionId?.toString();
      return (
        !sessionId ||
        !recordSessionId ||
        recordSessionId === sessionId.toString()
      );
    }),
    teams: raceState.teams || [],
  };
};

export interface ImportedRaceStateMetadata {
  apicalDataFilePath?: string;
  raceState: Partial<RaceState>;
}

export interface EventCatalogServiceOptions {
  onPersistedLedger?: (ledger: EventCatalogLedger) => Promise<void>;
  onProgress?: LoadingProgressCallback;
}

const assertEventCatalogPersistence = (
  persistence: EventCatalogPersistence,
): void => {
  if (
    !persistence ||
    typeof persistence.load !== "function" ||
    typeof persistence.save !== "function"
  ) {
    throw new Error(
      "EventCatalogService.create requires a persistence object with load() and save() methods.",
    );
  }
};

const createMutationId = (): string => createId("mutationId");
const createTimestamp = (): string => new Date().toISOString();
const createLedgerWithMutations = (
  mutations: EventCatalogLedger["mutations"],
): EventCatalogLedger => ({
  mutations,
  schemaVersion: 1,
});

const reviveDate = (value: Date | string | undefined): Date | undefined => {
  if (!value) {
    return undefined;
  }

  return value instanceof Date ? value : new Date(value);
};

const reviveRaceStateDates = (
  raceState: Partial<RaceState>,
): Partial<RaceState> => {
  return {
    ...raceState,
    categories: normalizeCategoriesForResultExclusion(
      raceState.categories || [],
    ),
    eventStartTime: reviveDate(raceState.eventStartTime),
    records: (raceState.records || []).map(
      (record): TimeRecord => ({
        ...record,
        time: reviveDate(record.time),
      }),
    ),
  };
};

const entrantNameFromMembers = (members: EventParticipant[]): string => {
  if (members.length === 0) {
    return "Unassigned Entrant";
  }
  if (members.length === 1) {
    return getParticipantDisplayName(members[0]);
  }
  return `Team ${members[0].entrantId}`;
};

const unique = (values: string[]): string[] =>
  Array.from(new Set(values.filter((value) => value.trim().length > 0)));
const hasOwn = <T extends object>(value: T, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);
const nonEmpty = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const NO_OP_COMPLETE_STEP = async (
  _currentTask: string,
  _index: number,
): Promise<void> => undefined;

const findProfileForParticipant = (
  participant: EventParticipant,
  masterProfiles: MasterEntrantProfile[],
): MasterEntrantProfile | undefined => {
  const participantId = participant.id.toString();
  const entrantId = participant.entrantId.toString();

  return masterProfiles.find((profile) => {
    return (
      (profile.participantId && profile.participantId === participantId) ||
      (profile.entrantId && profile.entrantId === entrantId)
    );
  });
};

const deriveDistanceRule = (
  category: EventCategory,
): CategoryDistanceRule | undefined => {
  if (
    typeof category.distance === "number" &&
    Number.isFinite(category.distance)
  ) {
    return {
      kind: "laps",
      value: category.distance,
    };
  }

  if (typeof category.duration === "string" && category.duration.length > 0) {
    return {
      kind: "time",
      value: category.duration,
    };
  }

  return undefined;
};

const normalizeCategoriesForResultExclusion = (
  categories: EventCategory[],
): EventCategory[] =>
  categories.map((category) => normalizeCategoryResultExclusion(category));

const getIdentifierValues = (
  identifiers: EventParticipant["identifiers"] | undefined,
  identifierType: "racePlate" | "txNo",
): string[] => {
  return (identifiers || [])
    .flatMap((identifier) => {
      if (!(identifierType in identifier)) {
        return [];
      }

      const value = (
        identifier as EventParticipant["identifiers"][number] &
          Record<"racePlate" | "txNo", string | number | undefined>
      )[identifierType];
      return value === undefined || value === null
        ? []
        : [value.toString().trim()];
    })
    .filter((value) => value.length > 0)
    .sort((left, right) =>
      left.localeCompare(right, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
};

const normalizeIdentityPart = (value: string | undefined): string => {
  return value?.trim().toLowerCase() || "";
};

const buildParticipantIdentity = (participant: EventParticipant): string => {
  const identity = buildRiderIdentity({
    categoryId: participant.categoryId?.toString() || "",
    firstName: participant.firstname,
    identifiers: participant.identifiers,
    lastName: participant.surname,
    name: `${participant.firstname} ${participant.surname}`.trim(),
  });

  return identity === "fallback|"
    ? `fallback|${participant.entrantId?.toString() || ""}|${participant.id.toString()}`
    : identity;
};

const buildRiderIdentity = (values: {
  categoryId?: string;
  firstName?: string;
  identifiers?: EventParticipant["identifiers"];
  lastName?: string;
  name?: string;
}): string => {
  const categoryId = values.categoryId || "";
  const firstName = normalizeIdentityPart(values.firstName);
  const lastName = normalizeIdentityPart(values.lastName);
  const name = normalizeIdentityPart(values.name);
  const racePlates = getIdentifierValues(values.identifiers, "racePlate");
  const transponders = getIdentifierValues(values.identifiers, "txNo");
  const identityCore = [
    categoryId,
    firstName,
    lastName,
    racePlates.join(","),
    transponders.join(","),
  ].join("|");

  if (identityCore !== "||||") {
    return identityCore;
  }

  return `fallback|${name}`;
};

const buildRiderEntrantIdentity = (entrant: EventCatalogEntrant): string => {
  return (
    buildRiderIdentity({
      categoryId:
        entrant.categoryId?.toString() ||
        entrant.categoryIds[0]?.toString() ||
        "",
      firstName: entrant.firstName,
      identifiers: entrant.identifiers,
      lastName: entrant.lastName,
      name: entrant.name,
    }) || `fallback|${entrant.id.toString()}`
  );
};

const buildTeamIdentity = (team: { id: string }): string => {
  return team.id.toString();
};

const mergeParticipantIdentifiers = (
  left: EventParticipant["identifiers"] = [],
  right: EventParticipant["identifiers"] = [],
): EventParticipant["identifiers"] => {
  const mergedByKey = new Map<
    string,
    EventParticipant["identifiers"][number]
  >();

  [...left, ...right].forEach((identifier) => {
    const racePlate =
      "racePlate" in identifier && identifier.racePlate != null
        ? identifier.racePlate.toString().trim()
        : "";
    const txNo =
      "txNo" in identifier && identifier.txNo != null
        ? identifier.txNo.toString().trim()
        : "";
    const key = [
      racePlate,
      txNo,
      identifier.fromTime instanceof Date
        ? identifier.fromTime.toISOString()
        : "",
      identifier.toTime instanceof Date ? identifier.toTime.toISOString() : "",
    ].join("|");

    if (!mergedByKey.has(key)) {
      mergedByKey.set(key, identifier);
    }
  });

  return Array.from(mergedByKey.values());
};

const normalizeEntrantImportValue = (
  value: string | number | undefined,
): string => {
  return value?.toString().trim().toLowerCase() || "";
};

const resolveEntrantImportCategoryId = (
  record: EntrantImportRecord,
  categories: EventCatalogCategory[],
  defaultCategoryId: EventCategoryId | undefined,
): EventCategoryId | undefined => {
  const importedCategory = normalizeEntrantImportValue(record.category);
  const matchedCategory = importedCategory
    ? categories.find(
        (category) =>
          category.id.toString() === importedCategory ||
          normalizeEntrantImportValue(category.code) === importedCategory ||
          normalizeEntrantImportValue(category.name) === importedCategory,
      )
    : undefined;

  return matchedCategory?.id || defaultCategoryId;
};

const hasPlaceholderCategory = (
  categoryId: EventCategoryId | undefined,
  categoriesById: Map<string, EventCatalogCategory>,
): boolean => {
  const category =
    categoryId === undefined
      ? undefined
      : categoriesById.get(categoryId.toString());
  const categoryName = normalizeEntrantImportValue(category?.name);

  return (
    category?.isPlaceholder === true ||
    normalizeEntrantImportValue(category?.code) === "missing" ||
    categoryName === "unassigned" ||
    categoryName === "unknown participants" ||
    categoryName === "unknown participant" ||
    categoryName.startsWith("missing category ")
  );
};

const participantMatchesEntrantImportRecord = (
  participant: EventParticipant,
  record: EntrantImportRecord,
): boolean => {
  const transponderNumber = normalizeEntrantImportValue(
    record.transponderNumber,
  );
  const raceNumber = normalizeEntrantImportValue(record.raceNumber);
  const participantName = normalizeEntrantImportValue(
    `${participant.firstname || ""} ${participant.surname || ""}`,
  );
  const importedName = normalizeEntrantImportValue(
    `${record.firstName || ""} ${record.lastName || ""}`,
  );

  return (
    (transponderNumber.length > 0 &&
      getIdentifierValues(participant.identifiers, "txNo")
        .map(normalizeEntrantImportValue)
        .includes(transponderNumber)) ||
    (raceNumber.length > 0 &&
      getIdentifierValues(participant.identifiers, "racePlate")
        .map(normalizeEntrantImportValue)
        .includes(raceNumber)) ||
    (importedName.length > 0 &&
      !isPlaceholderEntrantName(importedName) &&
      participantName === importedName)
  );
};

const findUniqueSourceParticipantImportMatch = (
  participants: EventParticipant[],
  record: EntrantImportRecord,
  categoriesById: Map<string, EventCatalogCategory>,
): EventParticipant | undefined => {
  const uniqueParticipants = Array.from(
    new Map(
      participants.map((participant) => [
        participant.id.toString(),
        participant,
      ]),
    ).values(),
  );
  const findUnique = (
    matches: EventParticipant[],
  ): EventParticipant | undefined =>
    matches.length === 1 ? matches[0] : undefined;
  const transponderNumber = normalizeEntrantImportValue(
    record.transponderNumber,
  );
  if (transponderNumber) {
    const matches = uniqueParticipants.filter((participant) =>
      getIdentifierValues(participant.identifiers, "txNo")
        .map(normalizeEntrantImportValue)
        .includes(transponderNumber),
    );
    const placeholderMatches = matches.filter(
      (participant) =>
        participant.isPlaceholder === true ||
        isPlaceholderEntrantName(getParticipantDisplayName(participant)) ||
        (hasPlaceholderCategory(participant.categoryId, categoriesById) &&
          !participant.firstname.trim() &&
          !participant.surname.trim()),
    );
    const identifiedMatches = matches.filter(
      (participant) => !placeholderMatches.includes(participant),
    );
    if (identifiedMatches.length === 1) {
      return identifiedMatches[0];
    }
    if (placeholderMatches.length > 0) {
      return placeholderMatches.sort((left, right) =>
        left.id.toString().localeCompare(right.id.toString()),
      )[0];
    }
    if (matches.length > 1) {
      throw new Error(
        `Cannot import transmitter ${record.transponderNumber}: it is already assigned to non-placeholder participant(s) ${matches.map((participant) => `${getParticipantDisplayName(participant)} [${participant.id}]`).join(", ")}.`,
      );
    }
    if (matches[0]) {
      return matches[0];
    }
  }

  const raceNumber = normalizeEntrantImportValue(record.raceNumber);
  if (raceNumber) {
    const match = findUnique(
      participants.filter((participant) =>
        getIdentifierValues(participant.identifiers, "racePlate")
          .map(normalizeEntrantImportValue)
          .includes(raceNumber),
      ),
    );
    if (match) {
      return match;
    }
  }

  const importedName = normalizeEntrantImportValue(
    `${record.firstName || ""} ${record.lastName || ""}`,
  );
  return importedName && !isPlaceholderEntrantName(importedName)
    ? findUnique(
        participants.filter(
          (participant) =>
            normalizeEntrantImportValue(
              `${participant.firstname || ""} ${participant.surname || ""}`,
            ) === importedName,
        ),
      )
    : undefined;
};

const createImportedIdentifier = (
  identifierType: "racePlate" | "txNo",
  value: string,
): EventParticipant["identifiers"][number] =>
  ({
    fromTime: undefined,
    [identifierType]: value,
    toTime: undefined,
  }) as EventParticipant["identifiers"][number];

const mergeEntrantImportIdentifiers = (
  identifiers: EventParticipant["identifiers"] = [],
  record: EntrantImportRecord,
): EventParticipant["identifiers"] => {
  let merged = [...identifiers];
  if (
    record.transponderNumber &&
    !getIdentifierValues(merged, "txNo").some(
      (value) =>
        normalizeEntrantImportValue(value) ===
        normalizeEntrantImportValue(record.transponderNumber),
    )
  ) {
    merged = mergeParticipantIdentifiers(merged, [
      createImportedIdentifier("txNo", record.transponderNumber),
    ]);
  }
  if (
    record.raceNumber &&
    getIdentifierValues(merged, "racePlate").length === 0
  ) {
    merged = mergeParticipantIdentifiers(merged, [
      createImportedIdentifier("racePlate", record.raceNumber),
    ]);
  }
  return merged;
};

const getParticipantsForCatalogEntrant = (
  entrant: EventCatalogEntrant,
  participants: EventParticipant[],
): EventParticipant[] => {
  const memberIds = new Set(
    entrant.memberParticipantIds.map((id) => id.toString()),
  );
  return participants.filter(
    (participant) =>
      memberIds.has(participant.id.toString()) ||
      (memberIds.size === 0 &&
        participant.entrantId?.toString() === entrant.id.toString()),
  );
};

const getEntrantImportIdentifierValues = (
  entrant: EventCatalogEntrant,
  participants: EventParticipant[],
  identifierType: "racePlate" | "txNo",
): string[] => {
  return [
    ...getIdentifierValues(entrant.identifiers, identifierType),
    ...getParticipantsForCatalogEntrant(entrant, participants).flatMap(
      (participant) =>
        getIdentifierValues(participant.identifiers, identifierType),
    ),
  ]
    .map(normalizeEntrantImportValue)
    .filter(Boolean);
};

const getEntrantImportNames = (
  entrant: EventCatalogEntrant,
  participants: EventParticipant[],
): string[] => {
  return [
    entrant.name,
    `${entrant.firstName || ""} ${entrant.lastName || ""}`,
    ...getParticipantsForCatalogEntrant(entrant, participants).map(
      (participant) =>
        `${participant.firstname || ""} ${participant.surname || ""}`,
    ),
  ]
    .map(normalizeEntrantImportValue)
    .filter((name) => name.length > 0 && !isPlaceholderEntrantName(name));
};

const findUniqueEntrantImportMatch = (
  entrants: EventCatalogEntrant[],
  participants: EventParticipant[],
  record: EntrantImportRecord,
  categoriesById: Map<string, EventCatalogCategory>,
  allowNameMatch = true,
): EventCatalogEntrant | undefined => {
  const riderEntrants = entrants.filter(
    (entrant) => entrant.entrantType === "rider",
  );
  const findUnique = (
    matches: EventCatalogEntrant[],
  ): EventCatalogEntrant | undefined => {
    if (matches.length <= 1) {
      return matches[0];
    }

    const placeholderMatches = matches.filter(
      (entrant) =>
        entrant.isPlaceholder === true ||
        isPlaceholderEntrantName(entrant.name) ||
        (hasPlaceholderCategory(entrant.categoryId, categoriesById) &&
          !entrant.firstName?.trim() &&
          !entrant.lastName?.trim()),
    );
    const identifiedMatches = matches.filter(
      (entrant) => !placeholderMatches.includes(entrant),
    );
    if (identifiedMatches.length === 1) {
      return identifiedMatches[0];
    }
    if (placeholderMatches.length > 0) {
      return placeholderMatches.sort((left, right) =>
        left.id.toString().localeCompare(right.id.toString()),
      )[0];
    }

    return undefined;
  };
  const transponder = normalizeEntrantImportValue(record.transponderNumber);
  if (transponder) {
    const matches = riderEntrants.filter((entrant) =>
      getEntrantImportIdentifierValues(entrant, participants, "txNo").includes(
        transponder,
      ),
    );
    const placeholderMatches = matches.filter(
      (entrant) =>
        entrant.isPlaceholder === true ||
        isPlaceholderEntrantName(entrant.name) ||
        (hasPlaceholderCategory(entrant.categoryId, categoriesById) &&
          !entrant.firstName?.trim() &&
          !entrant.lastName?.trim()),
    );
    const identifiedMatches = matches.filter(
      (entrant) => !placeholderMatches.includes(entrant),
    );
    if (identifiedMatches.length === 1) {
      return identifiedMatches[0];
    }
    if (placeholderMatches.length > 0) {
      return placeholderMatches.sort((left, right) =>
        left.id.toString().localeCompare(right.id.toString()),
      )[0];
    }
    if (matches.length > 1) {
      throw new Error(
        `Cannot import transmitter ${record.transponderNumber}: it is already assigned to non-placeholder competitor(s) ${matches.map((entrant) => `${entrant.name} [${entrant.id}]`).join(", ")}.`,
      );
    }
    if (matches[0]) {
      return matches[0];
    }
  }
  const raceNumber = normalizeEntrantImportValue(record.raceNumber);
  if (raceNumber) {
    const match = findUnique(
      riderEntrants.filter((entrant) =>
        getEntrantImportIdentifierValues(
          entrant,
          participants,
          "racePlate",
        ).includes(raceNumber),
      ),
    );
    if (match) {
      return match;
    }
  }
  const importedName = normalizeEntrantImportValue(
    `${record.firstName || ""} ${record.lastName || ""}`,
  );
  return allowNameMatch && importedName && !isPlaceholderEntrantName(importedName)
    ? findUnique(
        riderEntrants.filter((entrant) =>
          getEntrantImportNames(entrant, participants).includes(importedName),
        ),
      )
    : undefined;
};

const mergeImportedParticipant = (
  primary: EventParticipant,
  duplicate: EventParticipant,
): EventParticipant => {
  return {
    ...primary,
    categoryId: primary.categoryId || duplicate.categoryId,
    currentResult: primary.currentResult ?? duplicate.currentResult,
    entrantId: primary.entrantId || duplicate.entrantId,
    firstname: primary.firstname || duplicate.firstname,
    isPlaceholder: primary.isPlaceholder && duplicate.isPlaceholder,
    identifiers: mergeParticipantIdentifiers(
      primary.identifiers,
      duplicate.identifiers,
    ),
    lastRecordTime: primary.lastRecordTime ?? duplicate.lastRecordTime,
    lastRecordTimingPoint:
      primary.lastRecordTimingPoint ?? duplicate.lastRecordTimingPoint,
    resultDuration: primary.resultDuration ?? duplicate.resultDuration,
    surname: primary.surname || duplicate.surname,
  };
};

const mergeImportedTeam = (
  primary: EventTeam,
  duplicate: EventTeam,
): EventTeam => {
  return {
    ...primary,
    categoryId: primary.categoryId || duplicate.categoryId,
    description: primary.description || duplicate.description,
    members: unique([
      ...primary.members.map((member) => member.toString()),
      ...duplicate.members.map((member) => member.toString()),
    ]) as EventTeam["members"],
    name: primary.name || duplicate.name,
  };
};

const getTeamEntrantIdsByParticipantId = (
  teams: EventTeam[],
): Map<string, string> => {
  const teamEntrantIdsByParticipantId = new Map<string, string>();

  teams.forEach((team) => {
    team.members.forEach((participantId) => {
      teamEntrantIdsByParticipantId.set(
        participantId.toString(),
        team.id.toString(),
      );
    });
  });

  return teamEntrantIdsByParticipantId;
};

const ensureImportedParticipantEntrantIds = (
  raceState: Partial<RaceState>,
): Partial<RaceState> => {
  const teams = raceState.teams || [];
  const teamEntrantIdsByParticipantId = getTeamEntrantIdsByParticipantId(teams);
  const participants = (raceState.participants || []).map(
    (participant): EventParticipant => {
      const participantId = participant.id.toString();
      const entrantId =
        nonEmpty(participant.entrantId?.toString()) ||
        participantId;
      const entryId =
        nonEmpty(participant.entryId?.toString()) ||
        teamEntrantIdsByParticipantId.get(participantId) ||
        entrantId;

      if (
        participant.entrantId?.toString() === entrantId &&
        participant.entryId?.toString() === entryId
      ) {
        return participant;
      }

      return {
        ...participant,
        entryId,
        entrantId,
      };
    },
  );

  return {
    ...raceState,
    participants,
  };
};

const normalizeImportedRaceStateForCatalog = (
  raceState: Partial<RaceState>,
): Partial<RaceState> => {
  const parentSafeRaceState = ensureImportedParticipantEntrantIds(raceState);

  return addMissingLinkedCategoryPlaceholders({
    ...parentSafeRaceState,
    categories: normalizeCategoriesForResultExclusion(
      parentSafeRaceState.categories || [],
    ),
  });
};

const buildCategoryImportIdentity = (
  category: Pick<EventCategory, "code" | "name">,
): string | undefined => {
  const code = normalizeIdentityPart(category.code);
  if (code) {
    return `code|${code}`;
  }

  const name = normalizeIdentityPart(category.name);
  return name ? `name|${name}` : undefined;
};

const canonicalizeImportedCategoryIds = (
  raceState: Partial<RaceState>,
  existingEventCategories: EventCatalogCategory[],
): Partial<RaceState> => {
  const canonicalCategoryIdByIdentity = new Map<string, string>();
  existingEventCategories
    .filter((category) => category.deleted !== true)
    .forEach((category) => {
      const identity = buildCategoryImportIdentity(category);
      if (identity && !canonicalCategoryIdByIdentity.has(identity)) {
        canonicalCategoryIdByIdentity.set(identity, category.id.toString());
      }
    });

  const categoryIdMap = new Map<string, string>();
  const categories = (raceState.categories || []).map(
    (category): EventCategory => {
      const sourceCategoryId = category.id.toString();
      const identity = buildCategoryImportIdentity(category);
      const canonicalCategoryId = identity
        ? canonicalCategoryIdByIdentity.get(identity) || sourceCategoryId
        : sourceCategoryId;
      if (identity) {
        canonicalCategoryIdByIdentity.set(identity, canonicalCategoryId);
      }
      categoryIdMap.set(sourceCategoryId, canonicalCategoryId);
      return canonicalCategoryId === sourceCategoryId
        ? category
        : { ...category, id: canonicalCategoryId };
    },
  );
  const remapCategoryId = (
    categoryId: string | undefined,
  ): string | undefined =>
    categoryId ? categoryIdMap.get(categoryId) || categoryId : categoryId;

  return {
    ...raceState,
    categories,
    participants: (raceState.participants || []).map(
      (participant): EventParticipant => ({
        ...participant,
        categoryId:
          remapCategoryId(participant.categoryId?.toString()) ||
          participant.categoryId,
      }),
    ),
    teams: (raceState.teams || []).map(
      (team): EventTeam => ({
        ...team,
        categoryId:
          remapCategoryId(team.categoryId?.toString()) || team.categoryId,
      }),
    ),
  };
};

const normalizeImportedRaceStateForEvent = (
  raceState: Partial<RaceState>,
  existingImportedRaceStates: Partial<RaceState>[],
  existingEventEntrants: EventCatalogEntrant[],
  existingEventCategories: EventCatalogCategory[],
): Partial<RaceState> => {
  const normalizedRaceState = canonicalizeImportedCategoryIds(
    normalizeImportedRaceStateForCatalog(raceState),
    existingEventCategories,
  );
  const existingParticipants = existingImportedRaceStates.flatMap(
    (state) => state.participants || [],
  );
  const existingRiderEntrants = existingEventEntrants.filter(
    (entrant) => entrant.entrantType === "rider",
  );
  const existingTeamEntrants = existingEventEntrants.filter(
    (entrant) => entrant.entrantType === "team",
  );
  const participantIdMap = new Map<string, string>();
  const entrantIdMap = new Map<string, string>();
  const teamCanonicalIdByIdentity = new Map<string, string>();

  existingTeamEntrants.forEach((entrant) => {
    const identity = buildTeamIdentity({
      id: entrant.id,
    });
    if (!teamCanonicalIdByIdentity.has(identity)) {
      teamCanonicalIdByIdentity.set(identity, entrant.id.toString());
    }
  });

  (normalizedRaceState.teams || []).forEach((team) => {
    const identity = buildTeamIdentity(team);
    const canonicalId =
      teamCanonicalIdByIdentity.get(identity) || team.id.toString();
    teamCanonicalIdByIdentity.set(identity, canonicalId);
    entrantIdMap.set(team.id.toString(), canonicalId);
  });

  const existingParticipantIdByIdentity = new Map<string, string>();
  existingParticipants.forEach((participant) => {
    const identity = buildParticipantIdentity(participant);
    if (!existingParticipantIdByIdentity.has(identity)) {
      existingParticipantIdByIdentity.set(identity, participant.id.toString());
    }
  });

  const existingRiderEntrantIdByIdentity = new Map<string, string>();
  existingRiderEntrants.forEach((entrant) => {
    const identity = buildRiderEntrantIdentity(entrant);
    if (!existingRiderEntrantIdByIdentity.has(identity)) {
      existingRiderEntrantIdByIdentity.set(identity, entrant.id.toString());
    }
  });

  const participantCanonicalIdByIdentity = new Map<string, string>();
  const entrantCanonicalIdByParticipantIdentity = new Map<string, string>();
  const participantsByCanonicalId = new Map<string, EventParticipant>();

  (normalizedRaceState.participants || []).forEach((participant) => {
    const participantIdentity = buildParticipantIdentity(participant);
    const oldParticipantId = participant.id.toString();
    const oldEntrantId =
      nonEmpty(participant.entrantId?.toString()) || oldParticipantId;
    const canonicalParticipantId =
      existingParticipantIdByIdentity.get(participantIdentity) ||
      participantCanonicalIdByIdentity.get(participantIdentity) ||
      oldParticipantId;
    const canonicalTeamEntrantId = entrantIdMap.get(oldEntrantId);
    const canonicalEntrantId =
      canonicalTeamEntrantId ||
      existingRiderEntrantIdByIdentity.get(participantIdentity) ||
      entrantCanonicalIdByParticipantIdentity.get(participantIdentity) ||
      oldEntrantId;
    const remappedParticipant: EventParticipant = {
      ...participant,
      entryId: canonicalEntrantId,
      entrantId: canonicalEntrantId,
      id: canonicalParticipantId,
    };
    const existingParticipant = participantsByCanonicalId.get(
      canonicalParticipantId,
    );

    participantIdMap.set(oldParticipantId, canonicalParticipantId);
    entrantIdMap.set(oldEntrantId, canonicalEntrantId);
    participantCanonicalIdByIdentity.set(
      participantIdentity,
      canonicalParticipantId,
    );
    entrantCanonicalIdByParticipantIdentity.set(
      participantIdentity,
      canonicalEntrantId,
    );
    participantsByCanonicalId.set(
      canonicalParticipantId,
      existingParticipant
        ? mergeImportedParticipant(existingParticipant, remappedParticipant)
        : remappedParticipant,
    );
  });

  const teamsByCanonicalId = new Map<string, EventTeam>();
  (normalizedRaceState.teams || []).forEach((team) => {
    const canonicalId =
      entrantIdMap.get(team.id.toString()) || team.id.toString();
    const remappedTeam: EventTeam = {
      ...team,
      id: canonicalId,
      members: unique(
        team.members.map(
          (member) =>
            participantIdMap.get(member.toString()) || member.toString(),
        ),
      ) as EventTeam["members"],
    };
    const existingTeam = teamsByCanonicalId.get(canonicalId);
    teamsByCanonicalId.set(
      canonicalId,
      existingTeam
        ? mergeImportedTeam(existingTeam, remappedTeam)
        : remappedTeam,
    );
  });

  return {
    ...normalizedRaceState,
    participants: Array.from(participantsByCanonicalId.values()),
    records: (normalizedRaceState.records || []).map((record): TimeRecord => {
      const remappedRecord = { ...record } as TimeRecord & {
        entrantId?: EventEntrantId;
        participantId?: EventParticipant["id"];
      };

      if ("entrantId" in remappedRecord && remappedRecord.entrantId) {
        remappedRecord.entrantId =
          entrantIdMap.get(remappedRecord.entrantId.toString()) ||
          remappedRecord.entrantId;
      }
      if ("participantId" in remappedRecord && remappedRecord.participantId) {
        remappedRecord.participantId =
          participantIdMap.get(remappedRecord.participantId.toString()) ||
          remappedRecord.participantId;
      }

      return remappedRecord;
    }),
    teams: Array.from(teamsByCanonicalId.values()),
  };
};

const deriveMaxTeamSizesByCategory = (
  teams: EventTeam[],
  participants: EventParticipant[],
): Map<string, number> => {
  const participantById = new Map(
    participants.map((participant) => [participant.id.toString(), participant]),
  );
  const maxTeamSizeByCategory = new Map<string, number>();

  teams.forEach((team) => {
    if (team.members.length <= 1) {
      return;
    }

    const categoryIds = unique([
      team.categoryId?.toString() || "",
      ...team.members.map(
        (memberId) =>
          participantById.get(memberId.toString())?.categoryId?.toString() || "",
      ),
    ]);

    categoryIds.forEach((categoryId) => {
      const currentMaxTeamSize = maxTeamSizeByCategory.get(categoryId) || 0;
      maxTeamSizeByCategory.set(
        categoryId,
        Math.max(currentMaxTeamSize, team.members.length),
      );
    });
  });

  return maxTeamSizeByCategory;
};

const createCategoryTeamRules = (
  categoryId: string,
  maxTeamSizeByCategory: Map<string, number>,
  identityMode: 'single' | 'multiple' = 'single',
): CategoryTeamRules => {
  const maxTeamSize = maxTeamSizeByCategory.get(categoryId);

  return {
    identityMode,
    ...(maxTeamSize && maxTeamSize > 1 ? { maxTeamSize } : {}),
    teamCompositionRules: [],
  };
};

const mergeSessionCategoryIds = (
  existingCategoryIds: string[] = [],
  nextCategoryIds: string[] = [],
): string[] => {
  return unique([...existingCategoryIds, ...nextCategoryIds]);
};

const deriveCategoriesFromEventData = (
  eventId: EventId,
  categories: EventCategory[],
  participants: EventParticipant[],
  teams: EventTeam[] = [],
  _assignedSessionId?: SessionId,
  _assignedSessionStart?: string,
): EventCatalogCategory[] => {
  const byId = new Map<EventId, EventCatalogCategory>();
  const maxTeamSizeByCategory = deriveMaxTeamSizesByCategory(
    teams,
    participants,
  );

  normalizeCategoriesForResultExclusion(categories).forEach((category) => {
    const id = validateUuid(category.id)
      ? category.id
      : createCategoryId(category.id);
    byId.set(id, {
      ...category,
      distanceRule: deriveDistanceRule(category),
      eventId,
        teamRules: createCategoryTeamRules(
          id.toString(),
          maxTeamSizeByCategory,
          (category as EventCatalogCategory).teamRules?.identityMode,
        ),
    });
  });

  unique(
    participants
      .map((participant) => participant.categoryId?.toString())
      .filter((categoryId): categoryId is string => categoryId !== undefined),
  ).forEach((categoryId) => {
    if (!byId.has(categoryId)) {
      byId.set(categoryId, {
        code: "",
        description: "",
        distanceRule: {
          kind: "unspecified",
        },
        eventId,
        id: categoryId,
        isPlaceholder: true,
        name: `Category ${categoryId}`,
        teamRules: createCategoryTeamRules(categoryId, maxTeamSizeByCategory),
      });
    }
  });

  return Array.from(byId.values());
};

const deriveEntrantsFromParticipants = async (
  eventId: EventId,
  participants: EventParticipant[],
  categories: EventCatalogCategory[] = [],
  masterProfiles: MasterEntrantProfile[] = [],
  teams: EventTeam[] = [],
): Promise<EventCatalogEntrant[]> => {
  const groups = new Map<string, EventParticipant[]>();
  const teamsById = new Map<string, EventTeam>(
    teams.map((team) => [team.id.toString(), team]),
  );
  participants.forEach((participant) => {
    const entrantId =
      nonEmpty(participant.entrantId?.toString()) || participant.id.toString();
    const existing = groups.get(entrantId) || [];
    existing.push(participant);
    groups.set(entrantId, existing);
  });

  return Array.from(groups.entries()).flatMap(([entrantId, members]) => {
    const importedTeam = teamsById.get(entrantId);
    const enrichedMembers = members.map((member) => {
      const profile = findProfileForParticipant(member, masterProfiles);
      const fallbackCategoryId = nonEmpty(profile?.categoryId);

      return {
        categoryId:
          nonEmpty(member.categoryId?.toString()) || fallbackCategoryId,
        dateOfBirth: nonEmpty(profile?.dateOfBirth),
        firstName:
          nonEmpty(member.firstname) || nonEmpty(profile?.firstName) || "",
        gender: nonEmpty(profile?.gender),
        lastName: nonEmpty(member.surname) || nonEmpty(profile?.lastName) || "",
        participantId: member.id.toString(),
      };
    });

    const importedTeamCategoryId = nonEmpty(
      (importedTeam as (EventTeam & { categoryId?: string }) | undefined)
        ?.categoryId,
    );
    const categoryIds = unique([
      importedTeamCategoryId || "",
      ...enrichedMembers.map((member) => member.categoryId || ""),
    ]);
    const memberParticipantIds = unique(
      enrichedMembers.map((member) => member.participantId),
    );
    const entrantType = importedTeam
      ? "team"
      : members.length > 1
        ? "team"
        : "rider";
    const riderEntries = members.map((member) => {
      const profile = findProfileForParticipant(member, masterProfiles);
      const riderFirstName =
        nonEmpty(member.firstname) || nonEmpty(profile?.firstName);
      const riderLastName =
        nonEmpty(member.surname) || nonEmpty(profile?.lastName);
      const riderCategoryId =
        nonEmpty(member.categoryId?.toString()) ||
        nonEmpty(profile?.categoryId) ||
        (member.isPlaceholder
          ? categories.find((category) => category.isPlaceholder === true)?.id
          : undefined);
      const riderName = [riderFirstName, riderLastName]
        .filter((part) => !!part)
        .join(" ")
        .trim();
      const participantId = member.id.toString();

      return {
        categoryId: riderCategoryId,
        categoryIds: riderCategoryId ? [riderCategoryId] : [],
        dateOfBirth: nonEmpty(profile?.dateOfBirth),
        entrantType: "rider" as const,
        eventId,
        firstName: riderFirstName,
        gender: nonEmpty(profile?.gender),
        id: entrantType === "team" ? participantId : entrantId,
        identifiers: [...member.identifiers],
        isPlaceholder: member.isPlaceholder === true,
        lastName: riderLastName,
        memberParticipantIds: [participantId],
        name: riderName || getParticipantDisplayName(member),
        teamEntrantId: entrantType === "team" ? entrantId : undefined,
      };
    });

    if (entrantType === "rider") {
      return riderEntries;
    }

    return [
      {
        categoryId: categoryIds[0],
        categoryIds,
        entrantType,
        eventId,
        id: entrantId,
        memberParticipantIds,
        name: nonEmpty(importedTeam?.name) || entrantNameFromMembers(members),
        teamMembers: enrichedMembers,
      },
      ...riderEntries,
    ];
  });
};

const normalizeEntrantChanges = (
  changes: Partial<
    Pick<
      EventCatalogEntrant,
      | "categoryId"
      | "categoryIds"
      | "dateOfBirth"
      | "entrantType"
      | "firstName"
      | "gender"
      | "identifiers"
      | "lastName"
      | "memberParticipantIds"
      | "name"
      | "notes"
      | "startOrder"
      | "teamEntrantId"
      | "teamMembers"
      | "vehicle"
    >
  >,
): Partial<
  Pick<
    EventCatalogEntrant,
    | "categoryId"
    | "categoryIds"
    | "dateOfBirth"
    | "entrantType"
    | "firstName"
    | "gender"
    | "identifiers"
    | "lastName"
    | "memberParticipantIds"
    | "name"
    | "notes"
    | "startOrder"
    | "teamEntrantId"
    | "teamMembers"
    | "vehicle"
  >
> => {
  if (!hasOwn(changes, "categoryId")) {
    return changes;
  }

  const categoryId = nonEmpty(changes.categoryId);
  return {
    ...changes,
    categoryId,
    categoryIds: categoryId ? [categoryId] : [],
  };
};

const hasSameMembers = (left: string[], right: string[]): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const hasSameSerializedValue = (left: unknown, right: unknown): boolean => {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch (_error) {
    return false;
  }
};

const getRaceStateImportMutationKey = (
  mutation: Extract<EventCatalogMutation, { type: "race-state-imported" }>,
): string => `${mutation.eventId.toString()}:${mutation.sessionId.toString()}`;

const compactSupersededRaceStateImportMutations = (
  mutations: EventCatalogLedger["mutations"],
): EventCatalogLedger["mutations"] => {
  const latestImportIndexByKey = new Map<string, number>();
  mutations.forEach((mutation, index) => {
    if (mutation.type === "race-state-imported") {
      latestImportIndexByKey.set(
        getRaceStateImportMutationKey(mutation),
        index,
      );
    }
  });

  return mutations.filter(
    (mutation, index) =>
      mutation.type !== "race-state-imported" ||
      latestImportIndexByKey.get(getRaceStateImportMutationKey(mutation)) ===
        index,
  );
};

const findLatestRaceStateImportMutation = (
  mutations: EventCatalogLedger["mutations"],
  eventId: EventId,
  sessionId: SessionId,
):
  | Extract<EventCatalogMutation, { type: "race-state-imported" }>
  | undefined => {
  return [...mutations]
    .reverse()
    .find(
      (
        mutation,
      ): mutation is Extract<
        EventCatalogMutation,
        { type: "race-state-imported" }
      > => {
        return (
          mutation.type === "race-state-imported" &&
          mutation.eventId === eventId &&
          mutation.sessionId === sessionId
        );
      },
    );
};

const raceStateImportMutationChangesLedger = (
  acceptedMutations: EventCatalogLedger["mutations"],
  mutation: Extract<EventCatalogMutation, { type: "race-state-imported" }>,
): boolean => {
  const existingImport = findLatestRaceStateImportMutation(
    acceptedMutations,
    mutation.eventId,
    mutation.sessionId,
  );
  if (!existingImport) {
    return true;
  }

  return (
    !hasSameSerializedValue(
      existingImport.apicalDataFilePath,
      mutation.apicalDataFilePath,
    ) || !hasSameSerializedValue(existingImport.raceState, mutation.raceState)
  );
};

const removeDuplicateMutationIds = (
  mutations: EventCatalogLedger["mutations"],
): EventCatalogLedger["mutations"] => {
  const acceptedMutations: EventCatalogLedger["mutations"] = [];
  const acceptedMutationIds = new Set<string>();

  mutations.forEach((mutation) => {
    if (acceptedMutationIds.has(mutation.id)) {
      return;
    }

    acceptedMutations.push(mutation);
    acceptedMutationIds.add(mutation.id);
  });

  return acceptedMutations;
};

const hasSameMutationSequence = (
  left: EventCatalogLedger["mutations"],
  right: EventCatalogLedger["mutations"],
): boolean =>
  left.length === right.length &&
  left.every((mutation, index) => mutation.id === right[index]?.id);

const removeDuplicateAndNoopMutations = async (
  existingMutations: EventCatalogLedger["mutations"],
  proposedMutations: EventCatalogLedger["mutations"],
  onCompleteStep: (
    currentTask: string,
    index: number,
  ) => Promise<void> = NO_OP_COMPLETE_STEP,
): Promise<EventCatalogLedger["mutations"]> => {
  const acceptedMutations = compactSupersededRaceStateImportMutations(
    removeDuplicateMutationIds(existingMutations),
  );
  const acceptedMutationIds = new Set(
    acceptedMutations.map((mutation) => mutation.id),
  );
  let acceptedState = applyEventCatalogLedger(
    createLedgerWithMutations(acceptedMutations),
  );

  for (const [index, mutation] of proposedMutations.entries()) {
    if (acceptedMutationIds.has(mutation.id)) {
      continue;
    }

    if (mutation.type === "race-state-imported") {
      if (!raceStateImportMutationChangesLedger(acceptedMutations, mutation)) {
        continue;
      }
    } else {
      const nextState = applyEventCatalogMutation(acceptedState, mutation);
      if (hasSameSerializedValue(acceptedState, nextState)) {
        continue;
      }
      acceptedState = nextState;
    }

    acceptedMutations.push(mutation);
    acceptedMutationIds.add(mutation.id);
    await onCompleteStep("removeDuplicateAndNoopMutations", index);
  }

  return compactSupersededRaceStateImportMutations(acceptedMutations);
};

const hasSameCategoryScaffold = (
  existing: EventCatalogCategory,
  next: EventCatalogCategory,
): boolean => {
  return (
    existing.code === next.code &&
    existing.description === next.description &&
    existing.distance === next.distance &&
    hasSameSerializedValue(existing.distanceRule, next.distanceRule) &&
    existing.duration === next.duration &&
    existing.excludeFromResults === next.excludeFromResults &&
    existing.isPlaceholder === next.isPlaceholder &&
    existing.name === next.name &&
    existing.startTime === next.startTime &&
    hasSameSerializedValue(existing.teamRules, next.teamRules)
  );
};

const hasSameEntrantScaffold = (
  existing: EventCatalogEntrant,
  next: EventCatalogEntrant,
): boolean => {
  return (
    existing.categoryId === next.categoryId &&
    hasSameMembers(existing.categoryIds, next.categoryIds) &&
    existing.dateOfBirth === next.dateOfBirth &&
    existing.entrantType === next.entrantType &&
    existing.firstName === next.firstName &&
    existing.gender === next.gender &&
    hasSameSerializedValue(existing.identifiers, next.identifiers) &&
    existing.lastName === next.lastName &&
    hasSameMembers(existing.memberParticipantIds, next.memberParticipantIds) &&
    existing.name === next.name &&
    existing.notes === next.notes &&
    existing.teamEntrantId === next.teamEntrantId &&
    hasSameSerializedValue(existing.teamMembers, next.teamMembers)
  );
};

const getCategoryScaffoldChanges = (
  category: EventCatalogCategory,
): NonNullable<
  Extract<EventCatalogMutation, { type: "category-updated" }>["changes"]
> => ({
  code: category.code,
  description: category.description,
  distance: category.distance,
  distanceRule: category.distanceRule,
  duration: category.duration,
  excludeFromResults: category.excludeFromResults,
  isPlaceholder: category.isPlaceholder,
  name: category.name,
  startTime: category.startTime,
  teamRules: category.teamRules,
});

const normalizePlaceholderCategoryName = (name: string): string =>
  name
    .replace(/^missing category\s+/i, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();

const getPlaceholderCategoryReplacements = (
  existingCategories: EventCatalogCategory[],
  identifiedCategories: EventCatalogCategory[],
): Map<string, EventCategoryId> => {
  const identifiedCategoryIdsByName = new Map<string, EventCategoryId>();
  identifiedCategories
    .filter((category) => category.isPlaceholder !== true)
    .forEach((category) => {
      identifiedCategoryIdsByName.set(
        normalizePlaceholderCategoryName(category.name),
        category.id,
      );
    });

  return existingCategories.reduce<Map<string, EventCategoryId>>(
    (replacements, category) => {
      if (category.isPlaceholder !== true) {
        return replacements;
      }

      const replacementCategoryId = identifiedCategoryIdsByName.get(
        normalizePlaceholderCategoryName(category.name),
      );
      if (replacementCategoryId && replacementCategoryId !== category.id) {
        replacements.set(category.id.toString(), replacementCategoryId);
      }
      return replacements;
    },
    new Map<string, EventCategoryId>(),
  );
};

const migrateEntrantPlaceholderCategories = (
  entrant: EventCatalogEntrant,
  replacements: Map<string, EventCategoryId>,
): EventCatalogEntrant => {
  const replaceCategoryId = (
    categoryId: EventCategoryId | undefined,
  ): EventCategoryId | undefined => {
    return categoryId
      ? replacements.get(categoryId.toString()) || categoryId
      : undefined;
  };
  const categoryId = replaceCategoryId(entrant.categoryId);
  const categoryIds = unique(
    entrant.categoryIds.map(
      (existingCategoryId) =>
        replaceCategoryId(existingCategoryId) || existingCategoryId,
    ),
  );
  const teamMembers = entrant.teamMembers?.map((teamMember) => ({
    ...teamMember,
    categoryId: replaceCategoryId(teamMember.categoryId),
  }));
  if (
    categoryId === entrant.categoryId &&
    hasSameMembers(categoryIds, entrant.categoryIds) &&
    hasSameSerializedValue(teamMembers, entrant.teamMembers)
  ) {
    return entrant;
  }

  return {
    ...entrant,
    categoryId,
    categoryIds,
    teamMembers,
  };
};

const getEntrantScaffoldChanges = (
  entrant: EventCatalogEntrant,
): NonNullable<
  Extract<EventCatalogMutation, { type: "entrant-updated" }>["changes"]
> => ({
  categoryId: entrant.categoryId,
  categoryIds: entrant.categoryIds,
  dateOfBirth: entrant.dateOfBirth,
  entrantType: entrant.entrantType,
  firstName: entrant.firstName,
  gender: entrant.gender,
  identifiers: entrant.identifiers,
  lastName: entrant.lastName,
  memberParticipantIds: entrant.memberParticipantIds,
  name: entrant.name,
  notes: entrant.notes,
  teamEntrantId: entrant.teamEntrantId,
  teamMembers: entrant.teamMembers,
});

const mergeLinkedCatalogEntrant = (
  existingEntrant: EventCatalogEntrant,
  derivedEntrant: EventCatalogEntrant,
  eventId: EventId,
): EventCatalogEntrant => ({
  ...existingEntrant,
  categoryId: derivedEntrant.categoryId,
  categoryIds: derivedEntrant.categoryIds,
  eventId,
  identifiers: derivedEntrant.identifiers || existingEntrant.identifiers,
  memberParticipantIds: unique([
    ...existingEntrant.memberParticipantIds,
    ...derivedEntrant.memberParticipantIds,
  ]),
  teamEntrantId: derivedEntrant.teamEntrantId,
  teamMembers: derivedEntrant.teamMembers || existingEntrant.teamMembers,
});

const mergeDerivedEntrants = (
  primary: EventCatalogEntrant,
  duplicate: EventCatalogEntrant,
): EventCatalogEntrant => ({
  ...primary,
  categoryId: primary.categoryId || duplicate.categoryId,
  categoryIds: unique([...primary.categoryIds, ...duplicate.categoryIds]),
  identifiers: mergeParticipantIdentifiers(
    primary.identifiers,
    duplicate.identifiers,
  ),
  memberParticipantIds: unique([
    ...primary.memberParticipantIds,
    ...duplicate.memberParticipantIds,
  ]),
  teamMembers: primary.teamMembers || duplicate.teamMembers,
});

const buildCatalogEntrantIdentity = (entrant: EventCatalogEntrant): string => {
  if (entrant.entrantType === "team") {
    return buildTeamIdentity({
      id: entrant.id,
    });
  }

  return buildRiderEntrantIdentity(entrant);
};

const deduplicateCatalogEntrants = (
  entrants: EventCatalogEntrant[],
): EventCatalogEntrant[] => {
  const entrantsByIdentity = new Map<string, EventCatalogEntrant>();

  entrants.forEach((entrant) => {
    const identity = buildCatalogEntrantIdentity(entrant);
    const existingEntrant = entrantsByIdentity.get(identity);
    if (!existingEntrant) {
      entrantsByIdentity.set(identity, entrant);
      return;
    }

    entrantsByIdentity.set(
      identity,
      mergeDerivedEntrants(existingEntrant, entrant),
    );
  });

  return Array.from(entrantsByIdentity.values());
};

const assertUuid = (
  errors: string[],
  label: string,
  value: string | undefined,
): void => {
  if (!value || !validateUuid(value)) {
    errors.push(`${label} "${value || ""}" is not a valid UUID.`);
  }
};

const validateEventCatalogStateIds = (state: EventCatalogState): void => {
  const errors: string[] = [];
  const eventsById = new Map(state.events.map((event) => [event.id, event]));
  const categoriesById = new Map(
    state.categories
      .filter((category) => category.deleted !== true)
      .map((category) => [category.id, category]),
  );
  const entrantsById = new Map(
    state.entrants.map((entrant) => [entrant.id, entrant]),
  );
  const sessionsById = new Map(
    state.sessions.map((session) => [session.id, session]),
  );
  const deletedEventIds = new Set(state.deletedEventIds);

  state.events.forEach((event) => {
    assertUuid(errors, "event.id", event.id);
    event.categoryIds.forEach((categoryId) =>
      assertUuid(errors, `event ${event.id} categoryId`, categoryId),
    );
    event.entrantIds.forEach((entrantId) =>
      assertUuid(errors, `event ${event.id} entrantId`, entrantId),
    );
    event.sessionIds.forEach((sessionId) =>
      assertUuid(errors, `event ${event.id} sessionId`, sessionId),
    );
  });
  state.categories.forEach((category) => {
    assertUuid(errors, "category.id", category.id);
    assertUuid(errors, `category ${category.id} eventId`, category.eventId);
    if (
      !eventsById.has(category.eventId) &&
      !deletedEventIds.has(category.eventId)
    ) {
      errors.push(
        `category ${category.id} references missing parent event ${category.eventId}.`,
      );
    }
  });
  state.entrants.forEach((entrant) => {
    assertUuid(errors, "entrant.id", entrant.id);
    assertUuid(errors, `entrant ${entrant.id} eventId`, entrant.eventId);
    entrant.categoryIds.forEach((categoryId) =>
      assertUuid(errors, `entrant ${entrant.id} categoryId`, categoryId),
    );
    entrant.memberParticipantIds.forEach((participantId) =>
      assertUuid(
        errors,
        `entrant ${entrant.id} memberParticipantId`,
        participantId,
      ),
    );
    if (
      !eventsById.has(entrant.eventId) &&
      !deletedEventIds.has(entrant.eventId)
    ) {
      errors.push(
        `entrant ${entrant.id} references missing parent event ${entrant.eventId}.`,
      );
    }
  });
  state.sessions.forEach((session) => {
    assertUuid(errors, "session.id", session.id);
    assertUuid(errors, `session ${session.id} eventId`, session.eventId);
    if (
      !eventsById.has(session.eventId) &&
      !deletedEventIds.has(session.eventId)
    ) {
      errors.push(
        `session ${session.id} references missing parent event ${session.eventId}.`,
      );
    }
    session.categoryIds.forEach((categoryId) => {
      const category = categoriesById.get(categoryId);
      if (!category || category.eventId !== session.eventId) {
        errors.push(
          `session ${session.id} categoryIds contains ${categoryId}, but that category does not belong to the session event ${session.eventId}.`,
        );
      }
    });
  });
  if (state.activeEventId) {
    assertUuid(errors, "activeEventId", state.activeEventId);
    if (!eventsById.has(state.activeEventId)) {
      errors.push(
        `activeEventId ${state.activeEventId} does not reference an existing event.`,
      );
    }
  }
  if (state.activeSessionId) {
    assertUuid(errors, "activeSessionId", state.activeSessionId);
    const activeSession = sessionsById.get(state.activeSessionId);
    if (!activeSession) {
      errors.push(
        `activeSessionId ${state.activeSessionId} does not reference an existing session.`,
      );
    } else if (
      state.activeEventId &&
      activeSession.eventId !== state.activeEventId
    ) {
      errors.push(
        `activeSessionId ${state.activeSessionId} belongs to event ${activeSession.eventId}, not active event ${state.activeEventId}.`,
      );
    }
  }

  state.events.forEach((event) => {
    event.categoryIds.forEach((categoryId) => {
      const category = categoriesById.get(categoryId);
      if (!category || category.eventId !== event.id) {
        errors.push(
          `event ${event.id} categoryIds contains ${categoryId}, but that category does not belong to the event.`,
        );
      }
    });
    event.entrantIds.forEach((entrantId) => {
      const entrant = entrantsById.get(entrantId);
      if (!entrant || entrant.eventId !== event.id) {
        errors.push(
          `event ${event.id} entrantIds contains ${entrantId}, but that entrant does not belong to the event.`,
        );
      }
    });
    event.sessionIds.forEach((sessionId) => {
      const session = sessionsById.get(sessionId);
      if (!session || session.eventId !== event.id) {
        errors.push(
          `event ${event.id} sessionIds contains ${sessionId}, but that session does not belong to the event.`,
        );
      }
    });
  });

  if (errors.length > 0) {
    throw new Error(
      `Loaded event catalog ledger contains invalid IDs or parent relationships:\n${errors.join("\n")}`,
    );
  }
};

const createLedgerRelationshipRepairMutations = (
  state: EventCatalogState,
): EventCatalogLedger["mutations"] => {
  const categoriesByEventId = new Map<string, string[]>();
  const entrantsByEventId = new Map<string, string[]>();
  const sessionsByEventId = new Map<string, string[]>();

  state.categories
    .filter((category) => category.deleted !== true)
    .forEach((category) => {
      categoriesByEventId.set(category.eventId, [
        ...(categoriesByEventId.get(category.eventId) || []),
        category.id,
      ]);
    });
  state.entrants.forEach((entrant) => {
    entrantsByEventId.set(entrant.eventId, [
      ...(entrantsByEventId.get(entrant.eventId) || []),
      entrant.id,
    ]);
  });
  state.sessions.forEach((session) => {
    sessionsByEventId.set(session.eventId, [
      ...(sessionsByEventId.get(session.eventId) || []),
      session.id,
    ]);
  });

  const eventRelationshipRepairs = state.events.flatMap((event) => {
    const categoryIds = unique([
      ...event.categoryIds.filter((categoryId) =>
        categoriesByEventId.get(event.id)?.includes(categoryId),
      ),
      ...(categoriesByEventId.get(event.id) || []),
    ]);
    const entrantIds = unique([
      ...event.entrantIds.filter((entrantId) =>
        entrantsByEventId.get(event.id)?.includes(entrantId),
      ),
      ...(entrantsByEventId.get(event.id) || []),
    ]);
    const sessionIds = unique([
      ...event.sessionIds.filter((sessionId) =>
        sessionsByEventId.get(event.id)?.includes(sessionId),
      ),
      ...(sessionsByEventId.get(event.id) || []),
    ]);

    if (
      hasSameMembers(event.categoryIds, categoryIds) &&
      hasSameMembers(event.entrantIds, entrantIds) &&
      hasSameMembers(event.sessionIds, sessionIds)
    ) {
      return [];
    }

    return [
      {
        changes: {
          categoryIds,
          entrantIds,
          sessionIds,
        },
        eventId: event.id,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: "event-updated" as const,
      },
    ];
  });
  const sessionRelationshipRepairs = state.sessions.flatMap((session) => {
    const categoryIds = unique(
      session.categoryIds.filter((categoryId) =>
        categoriesByEventId.get(session.eventId)?.includes(categoryId),
      ),
    );
    if (hasSameMembers(session.categoryIds, categoryIds)) {
      return [];
    }

    return [
      {
        changes: {
          categoryIds,
        },
        id: createMutationId(),
        sessionId: session.id,
        timestamp: createTimestamp(),
        type: "session-updated" as const,
      },
    ];
  });

  return [...eventRelationshipRepairs, ...sessionRelationshipRepairs];
};

const assertSessionCategoryIdsBelongToEvent = (
  state: EventCatalogState,
  sessionId: SessionId,
  categoryIds: string[] | undefined,
): string[] | undefined => {
  if (!categoryIds) {
    return undefined;
  }

  const session = state.sessions.find(
    (candidate) => candidate.id === sessionId,
  );
  if (!session) {
    throw new Error(
      `Cannot assign categories because session ${sessionId} does not exist.`,
    );
  }

  const categoriesById = new Map(
    state.categories
      .filter((category) => category.deleted !== true)
      .map((category) => [category.id, category]),
  );
  const invalidCategoryIds = categoryIds.filter(
    (categoryId) => categoriesById.get(categoryId)?.eventId !== session.eventId,
  );
  const existingCategoryIds = new Set(session.categoryIds);
  const newlyInvalidCategoryIds = invalidCategoryIds.filter(
    (categoryId) => !existingCategoryIds.has(categoryId),
  );
  if (newlyInvalidCategoryIds.length > 0) {
    throw new Error(
      `Cannot assign categories from another event to session ${sessionId}: ${newlyInvalidCategoryIds.join(", ")}.`,
    );
  }
  return categoryIds.filter(
    (categoryId) => categoriesById.get(categoryId)?.eventId === session.eventId,
  );
};

const repairAndValidateLoadedLedger = async (
  ledger: EventCatalogLedger,
): Promise<EventCatalogLedger> => {
  incrementLoadingMetric(
    "Repair event catalog ledger",
    `${ledger.mutations.length} mutations`,
  );
  const rewrittenLedger = rewriteImportedObjectIds(ledger).value;
  let repairedLedger: EventCatalogLedger = {
    ...rewrittenLedger,
    mutations: compactSupersededRaceStateImportMutations(
      removeDuplicateMutationIds(rewrittenLedger.mutations),
    ),
  };
  const repairMutations = createLedgerRelationshipRepairMutations(
    applyEventCatalogLedger(repairedLedger),
  );
  if (repairMutations.length > 0) {
    repairedLedger = {
      ...repairedLedger,
      mutations: await removeDuplicateAndNoopMutations(
        repairedLedger.mutations,
        repairMutations,
      ),
    };
  }

  validateEventCatalogStateIds(applyEventCatalogLedger(repairedLedger));
  return repairedLedger;
};

export class EventCatalogService {
  private batchDepth = 0;
  private ledger: EventCatalogLedger;
  private pendingBatchPersist = false;
  private applyingRemoteMutations = false;
  private state: EventCatalogState;
  private readonly options: EventCatalogServiceOptions;
  private readonly persistence: EventCatalogPersistence;

  private constructor(
    persistence: EventCatalogPersistence,
    ledger: EventCatalogLedger,
    options: EventCatalogServiceOptions = {},
    state?: EventCatalogState,
  ) {
    incrementLoadingMetric(
      "Rebuild event catalog state",
      `${ledger.mutations.length} mutations`,
    );
    this.ledger = ledger;
    this.options = options;
    this.persistence = persistence;
    this.state = state || applyEventCatalogLedger(ledger);
  }

  public static async create(
    persistence: EventCatalogPersistence,
    options: EventCatalogServiceOptions = {},
  ): Promise<EventCatalogService> {
    assertEventCatalogPersistence(persistence);
    incrementLoadingMetric("Load event catalog service ledger");
    let ledger: EventCatalogLedger = await persistence.load();
    if (ledger.mutations.length === 0) {
      incrementLoadingMetric("Create seed event catalog ledger");
      ledger = createSeedEventCatalogLedger();
      await persistence.save(ledger);
      if (options.onPersistedLedger) {
        await options.onPersistedLedger(ledger);
      }
    } else {
      const repairedLedger: EventCatalogLedger =
        await repairAndValidateLoadedLedger(ledger);
      if (JSON.stringify(repairedLedger) !== JSON.stringify(ledger)) {
        ledger = repairedLedger;
        await persistence.save(ledger);
        if (options.onPersistedLedger) {
          await options.onPersistedLedger(ledger);
        }
      } else {
        ledger = repairedLedger;
      }
    }

    const state = options.onProgress
      ? await applyEventCatalogLedgerWithProgress(ledger, options.onProgress)
      : undefined;
    return new EventCatalogService(persistence, ledger, options, state);
  }

  public get catalog(): EventCatalogState {
    return this.state;
  }

  public async applyRemoteMutations(
    mutations: EventCatalogMutation[],
  ): Promise<EventCatalogState> {
    this.applyingRemoteMutations = true;
    try {
      return await this.appendMutations(mutations);
    } finally {
      this.applyingRemoteMutations = false;
    }
  }

  public getImportedRaceStateMetadata(
    eventId: EventId,
    sessionId: SessionId,
  ): ImportedRaceStateMetadata | undefined {
    const mutation = [...this.ledger.mutations].reverse().find((candidate) => {
      return (
        candidate.type === "race-state-imported" &&
        candidate.eventId === eventId &&
        candidate.sessionId === sessionId
      );
    });

    if (mutation?.type !== "race-state-imported") {
      return undefined;
    }

    return {
      apicalDataFilePath: mutation.apicalDataFilePath,
      raceState: reviveRaceStateDates(mutation.raceState),
    };
  }

  public getImportedRaceState(
    eventId: EventId,
    sessionId: SessionId,
  ): Partial<RaceState> | undefined {
    return this.getImportedRaceStateMetadata(eventId, sessionId)?.raceState;
  }

  public findEntrantMembershipsForParticipant(
    participantId: EventParticipant["id"],
    eventId?: EventId,
  ): ParticipantEntrantMembership[] {
    return getParticipantEntrantMemberships(this.state, participantId, {
      eventId,
      includeTeamParents: true,
    });
  }

  public async createEvent(
    onCompleteStep: (
      currentTask: string,
      index: number,
    ) => Promise<void> = NO_OP_COMPLETE_STEP,
  ): Promise<EventCatalogState> {
    const eventId = createEventId();
    return this.appendMutations(
      [
        {
          event: {
            categoryIds: [],
            date: createTimestamp().slice(0, 10),
            discipline: "motorsport",
            entrantIds: [],
            format: "race-weekend",
            id: eventId,
            name: "New Event",
            sessionIds: [],
            timeZone: getSystemTimeZone(),
          },
          id: createMutationId(),
          timestamp: createTimestamp(),
          type: "event-created",
        },
      ],
      onCompleteStep,
    );
  }

  public async activateEvent(
    eventId: EventId,
    onCompleteStep: (
      currentTask: string,
      index: number,
    ) => Promise<void> = NO_OP_COMPLETE_STEP,
  ): Promise<EventCatalogState> {
    return this.appendMutations(
      [
        {
          eventId,
          id: createMutationId(),
          timestamp: createTimestamp(),
          type: "event-activated",
        },
      ],
      onCompleteStep,
    );
  }

  public async updateEvent(
    eventId: EventId,
    changes: {
      date?: string;
      discipline?: EventCatalogState["events"][number]["discipline"];
      format?: EventCatalogState["events"][number]["format"];
      minimumLapTimeMilliseconds?: number | null;
      name?: string;
      timeZone?: string;
      trackMap?: EventCatalogState["events"][number]["trackMap"];
    },
    onCompleteStep: (
      currentTask: string,
      index: number,
    ) => Promise<void> = NO_OP_COMPLETE_STEP,
  ): Promise<EventCatalogState> {
    return this.appendMutations(
      [
        {
          changes,
          eventId,
          id: createMutationId(),
          timestamp: createTimestamp(),
          type: "event-updated",
        },
      ],
      onCompleteStep,
    );
  }

  public async deleteEvent(
    eventId: EventId,
    onCompleteStep: (
      currentTask: string,
      index: number,
    ) => Promise<void> = NO_OP_COMPLETE_STEP,
  ): Promise<EventCatalogState> {
    return this.appendMutations(
      [
        {
          eventId,
          id: createMutationId(),
          timestamp: createTimestamp(),
          type: "event-deleted",
        },
      ],
      onCompleteStep,
    );
  }

  public async syncEventScaffold(
    eventId: EventId,
    categories: EventCategory[],
    participants: EventParticipant[],
    masterProfiles: MasterEntrantProfile[] = [],
    teams: EventTeam[] = [],
    assignedSessionId?: SessionId,
    onCompleteStep: (
      currentTask: string,
      index: number,
    ) => Promise<void> = NO_OP_COMPLETE_STEP,
    replaceAssignedSessionScaffold = false,
  ): Promise<EventCatalogState> {
    incrementLoadingMetric("Sync event scaffold", eventId);
    const event = this.state.events.find((item) => item.id === eventId);
    const assignedSession = assignedSessionId
      ? this.state.sessions.find((session) => session.id === assignedSessionId)
      : undefined;

    for (const [index, category] of categories.entries()) {
      incrementLoadingMetric(
        "Derive scaffold category",
        category.name || category.id.toString(),
      );
      await onCompleteStep(`Derive scaffold category ${category.name || category.id}`, index);
    }
    for (const [index, participant] of participants.entries()) {
      incrementLoadingMetric(
        "Derive scaffold entrant participant",
        participant.id.toString(),
      );
      await onCompleteStep(`Derive scaffold participant ${participant.id}`, categories.length + index);
    }
    for (const [index, team] of teams.entries()) {
      incrementLoadingMetric("Derive scaffold team", team.id.toString());
      await onCompleteStep(`Derive scaffold team ${team.id}`, categories.length + participants.length + index);
    }

    const scaffoldCategories = deriveCategoriesFromEventData(
      eventId,
      categories,
      participants,
      teams,
    );
    const categoryIds = scaffoldCategories.map((category) =>
      category.id.toString(),
    );
    const derivedEntrants = deduplicateCatalogEntrants(
      await deriveEntrantsFromParticipants(
        eventId,
        participants,
        scaffoldCategories,
        masterProfiles,
        teams,
      ),
    );
    for (const [index, entrant] of derivedEntrants.entries()) {
      await onCompleteStep(`Prepare scaffold entrant ${entrant.name || entrant.id}`, index);
    }
    const existingEventEntrantsById = new Map(
      getEntrantsForEvent(this.state, eventId).map(
        (entrant) => [entrant.id.toString(), entrant] as const,
      ),
    );
    const linkedGlobalEntrantsById = new Map(
      this.state.entrants
        .filter((entrant) => entrant.eventId !== eventId)
        .filter(
          (entrant) => !existingEventEntrantsById.has(entrant.id.toString()),
        )
        .map((entrant) => [entrant.id.toString(), entrant] as const),
    );
    const linkedEntrantIds = new Set<string>();
    let entrants = deduplicateCatalogEntrants(
      derivedEntrants.map((entrant) => {
        const linkedEntrant = linkedGlobalEntrantsById.get(
          entrant.id.toString(),
        );
        if (!linkedEntrant) {
          return entrant;
        }

        linkedEntrantIds.add(entrant.id.toString());
        return mergeLinkedCatalogEntrant(linkedEntrant, entrant, eventId);
      }),
    );

    const existingCategoriesById = new Map(
      this.state.categories
        .filter((category) => category.eventId === eventId)
        .map((category) => [category.id.toString(), category] as const),
    );
    const placeholderCategoryReplacements = getPlaceholderCategoryReplacements(
      Array.from(existingCategoriesById.values()),
      scaffoldCategories,
    );
    entrants = entrants.map((entrant) =>
      migrateEntrantPlaceholderCategories(
        entrant,
        placeholderCategoryReplacements,
      ),
    );
    const existingEntrantsById = new Map(existingEventEntrantsById);
    const categoryMutations = scaffoldCategories
      .map((category) => {
        incrementLoadingMetric(
          "Prepare scaffold category mutation",
          category.name || category.id.toString(),
        );
        const existingCategory = existingCategoriesById.get(
          category.id.toString(),
        );
        if (existingCategory) {
          if (hasSameCategoryScaffold(existingCategory, category)) {
            return undefined;
          }

          return {
            categoryId: category.id,
            changes: getCategoryScaffoldChanges(category),
            id: createMutationId(),
            timestamp: createTimestamp(),
            type: "category-updated" as const,
          };
        }

        return {
          category,
          id: createMutationId(),
          timestamp: createTimestamp(),
          type: "category-created" as const,
        };
      })
      .filter(
        (mutation): mutation is NonNullable<typeof mutation> =>
          mutation !== undefined,
      );

    const categoryIdsAssignedOutsideSession = new Set(
      this.state.sessions
        .filter(
          (session) =>
            session.eventId === eventId && session.id !== assignedSessionId,
        )
        .flatMap((session) => session.categoryIds),
    );
    const removedSessionCategoryIds =
      replaceAssignedSessionScaffold && assignedSession
        ? assignedSession.categoryIds.filter(
            (categoryId) =>
              !categoryIds.includes(categoryId) &&
              !categoryIdsAssignedOutsideSession.has(categoryId),
          )
        : [];
    const nextAssignedSessionCategoryIds = assignedSession
      ? replaceAssignedSessionScaffold
        ? categoryIds
        : mergeSessionCategoryIds(assignedSession.categoryIds, categoryIds)
      : [];
    const sessionCategoryMutation = assignedSession
      ? (() => {
          if (
            hasSameMembers(
              assignedSession.categoryIds || [],
              nextAssignedSessionCategoryIds,
            )
          ) {
            return undefined;
          }

          return {
            changes: {
              categoryIds: nextAssignedSessionCategoryIds,
            },
            id: createMutationId(),
            sessionId: assignedSession.id,
            timestamp: createTimestamp(),
            type: "session-updated" as const,
          };
        })()
      : undefined;

    const entrantMutations: EventCatalogLedger["mutations"] = entrants.flatMap(
      (entrant): EventCatalogLedger["mutations"] => {
        incrementLoadingMetric(
          "Prepare scaffold entrant mutation",
          entrant.name || entrant.id.toString(),
        );
        const linkedEntrant = linkedGlobalEntrantsById.get(
          entrant.id.toString(),
        );
        if (linkedEntrantIds.has(entrant.id.toString()) && linkedEntrant) {
          return [
            {
              entrantId: linkedEntrant.id,
              id: createMutationId(),
              timestamp: createTimestamp(),
              type: "entrant-deleted" as const,
            },
            {
              entrant,
              id: createMutationId(),
              timestamp: createTimestamp(),
              type: "entrant-created" as const,
            },
          ];
        }

        const existingEntrant = existingEntrantsById.get(entrant.id.toString());
        if (existingEntrant) {
          if (hasSameEntrantScaffold(existingEntrant, entrant)) {
            return [];
          }

          return [
            {
              changes: getEntrantScaffoldChanges(entrant),
              entrantId: entrant.id,
              id: createMutationId(),
              timestamp: createTimestamp(),
              type: "entrant-updated" as const,
            },
          ];
        }

        return [
          {
            entrant,
            id: createMutationId(),
            timestamp: createTimestamp(),
            type: "entrant-created" as const,
          },
        ];
      },
    );

    const migratedExistingEntrantMutations: EventCatalogLedger["mutations"] =
      getEntrantsForEvent(this.state, eventId)
        .filter(
          (entrant) =>
            !entrants.some(
              (incomingEntrant) => incomingEntrant.id === entrant.id,
            ),
        )
        .flatMap((entrant): EventCatalogLedger["mutations"] => {
          const migratedEntrant = migrateEntrantPlaceholderCategories(
            entrant,
            placeholderCategoryReplacements,
          );
          if (migratedEntrant === entrant) {
            return [];
          }
          return [
            {
              changes: {
                categoryId: migratedEntrant.categoryId,
                categoryIds: migratedEntrant.categoryIds,
                teamMembers: migratedEntrant.teamMembers,
              },
              entrantId: entrant.id,
              id: createMutationId(),
              timestamp: createTimestamp(),
              type: "entrant-updated" as const,
            },
          ];
        });

    const staleDuplicateEntrants = getEntrantsForEvent(
      this.state,
      eventId,
    ).filter((existingEntrant) => {
      const matchingEntrant = entrants.find(
        (entrant) =>
          buildCatalogEntrantIdentity(entrant) ===
          buildCatalogEntrantIdentity(existingEntrant),
      );
      return !!matchingEntrant && matchingEntrant.id !== existingEntrant.id;
    });
    const staleDuplicateEntrantMutations = staleDuplicateEntrants.map(
      (entrant) => ({
        entrantId: entrant.id,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: "entrant-deleted" as const,
      }),
    );
    const removedEntrantMutations = replaceAssignedSessionScaffold
      ? getEntrantsForEvent(this.state, eventId)
          .filter(
            (entrant) =>
              !entrants.some(
                (incomingEntrant) => incomingEntrant.id === entrant.id,
              ),
          )
          .filter(
            (entrant) =>
              !this.importedRaceStateReferencesEntrant(eventId, entrant.id),
          )
          .map((entrant) => ({
            entrantId: entrant.id,
            id: createMutationId(),
            timestamp: createTimestamp(),
            type: "entrant-deleted" as const,
          }))
      : [];

    const eventCategoryIds = [...(event?.categoryIds || [])];
    const eventEntrantIds = [...(event?.entrantIds || [])];
    const eventSessionIds = [...(event?.sessionIds || [])];
    const nextEventCategoryIds = replaceAssignedSessionScaffold
      ? unique([
          ...eventCategoryIds.filter(
            (categoryId) => !removedSessionCategoryIds.includes(categoryId),
          ),
          ...categoryIds,
        ])
      : unique([...eventCategoryIds, ...categoryIds]);
    const nextEventEntrantIds = unique(
      entrants.map((entrant) => entrant.id.toString()),
    );
    const nextEventSessionIds = eventSessionIds;
    const eventChanges =
      event &&
      (!hasSameMembers(eventCategoryIds, nextEventCategoryIds) ||
        !hasSameMembers(eventEntrantIds, nextEventEntrantIds) ||
        !hasSameMembers(eventSessionIds, nextEventSessionIds))
        ? {
            categoryIds: nextEventCategoryIds,
            entrantIds: nextEventEntrantIds,
            sessionIds: nextEventSessionIds,
          }
        : undefined;

    const removedCategoryMutations = removedSessionCategoryIds
      .map((categoryId) => existingCategoriesById.get(categoryId))
      .filter(
        (category): category is EventCatalogCategory => category !== undefined,
      )
      .map((category) => ({
        categoryId: category.id,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: "category-deleted" as const,
      }));

    if (
      categoryMutations.length === 0 &&
      entrantMutations.length === 0 &&
      migratedExistingEntrantMutations.length === 0 &&
      staleDuplicateEntrantMutations.length === 0 &&
      removedEntrantMutations.length === 0 &&
      removedCategoryMutations.length === 0 &&
      !eventChanges
    ) {
      if (!sessionCategoryMutation) {
        return this.state;
      }
    }

    return this.appendMutations(
      [
        ...categoryMutations,
        ...removedCategoryMutations,
        ...entrantMutations,
        ...migratedExistingEntrantMutations,
        ...staleDuplicateEntrantMutations,
        ...removedEntrantMutations,
        ...(sessionCategoryMutation ? [sessionCategoryMutation] : []),
        ...(eventChanges
          ? [
              {
                changes: eventChanges,
                eventId,
                id: createMutationId(),
                timestamp: createTimestamp(),
                type: "event-updated" as const,
              },
            ]
          : []),
      ],
      onCompleteStep,
    );
  }

  public async importApicalRaceState(
    importData: ApicalCatalogImport,
    masterProfiles: MasterEntrantProfile[] = [],
    onCompleteStep: (
      currentTask: string,
      index: number,
    ) => Promise<void> = NO_OP_COMPLETE_STEP,
  ): Promise<EventCatalogState> {
    return this.runMutationBatch(async () =>
      this.importApicalRaceStateUnbatched(
        importData,
        masterProfiles,
        onCompleteStep,
      ),
    );
  }

  private async importApicalRaceStateUnbatched(
    importData: ApicalCatalogImport,
    masterProfiles: MasterEntrantProfile[] = [],
    onCompleteStep: (
      currentTask: string,
      index: number,
    ) => Promise<void> = NO_OP_COMPLETE_STEP,
  ): Promise<EventCatalogState> {
    const normalizedImportData = rewriteImportedObjectIds(importData).value;
    normalizedImportData.raceState = normalizeImportedRaceStateForEvent(
      normalizedImportData.raceState,
      this.getLatestImportedRaceStatesForEvent(normalizedImportData.eventId),
      getEntrantsForEvent(this.state, normalizedImportData.eventId),
      getCategoriesForEvent(this.state, normalizedImportData.eventId),
    );
    const existingEvent = this.state.events.find(
      (event) => event.id === normalizedImportData.eventId,
    );
    const existingSession = this.state.sessions.find(
      (session) => session.id === normalizedImportData.sessionId,
    );
    const sessionIds = Array.from(
      new Set([
        ...(existingEvent?.sessionIds || []),
        normalizedImportData.sessionId,
      ]),
    );
    const mutations: EventCatalogLedger["mutations"] = [];
    const scheduledStart = normalizedImportData.eventDate
      ? new Date(normalizedImportData.eventDate).toISOString()
      : createTimestamp();
    const timeZone =
      normalizedImportData.timeZone ||
      existingEvent?.timeZone ||
      getSystemTimeZone();
    const existingImportedRaceState = this.getImportedRaceStateMetadata(
      normalizedImportData.eventId,
      normalizedImportData.sessionId,
    );
    const derivedCategories = deriveCategoriesFromEventData(
      normalizedImportData.eventId,
      normalizedImportData.raceState.categories || [],
      normalizedImportData.raceState.participants || [],
      normalizedImportData.raceState.teams || [],
    );
    const categoryIds = derivedCategories.map((category) =>
      category.id.toString(),
    );
    const derivedEntrants = await deriveEntrantsFromParticipants(
      normalizedImportData.eventId,
      normalizedImportData.raceState.participants || [],
      derivedCategories,
      masterProfiles,
      normalizedImportData.raceState.teams || [],
    );
    const existingCategories = new Map(
      getCategoriesForEvent(this.state, normalizedImportData.eventId).map(
        (category) => [category.id.toString(), category] as const,
      ),
    );
    const existingEntrants = new Map(
      getEntrantsForEvent(this.state, normalizedImportData.eventId).map(
        (entrant) => [entrant.id.toString(), entrant] as const,
      ),
    );
    const importMatchesExistingState =
      existingEvent &&
      existingSession &&
      existingEvent.name === normalizedImportData.eventName &&
      existingEvent.timeZone === timeZone &&
      existingEvent.date === scheduledStart.slice(0, 10) &&
      hasSameSerializedValue(
        existingImportedRaceState?.apicalDataFilePath,
        normalizedImportData.apicalDataFilePath,
      ) &&
      hasSameSerializedValue(
        existingImportedRaceState?.raceState,
        normalizedImportData.raceState,
      );
    const scaffoldMatchesExistingState =
      derivedCategories.every((category) => {
        const existingCategory = existingCategories.get(category.id.toString());
        return (
          !!existingCategory &&
          hasSameCategoryScaffold(existingCategory, category)
        );
      }) &&
      derivedEntrants.every((entrant) => {
        const existingEntrant = existingEntrants.get(entrant.id.toString());
        return (
          !!existingEntrant && hasSameEntrantScaffold(existingEntrant, entrant)
        );
      }) &&
      derivedCategories.every((category) =>
        (existingSession?.categoryIds || []).includes(category.id),
      );

    if (importMatchesExistingState && scaffoldMatchesExistingState) {
      return this.state;
    }

    if (!existingEvent) {
      mutations.push({
        event: {
          categoryIds: [],
          date: scheduledStart.slice(0, 10),
          discipline: "motorsport",
          entrantIds: [],
          format: "race-weekend",
          id: normalizedImportData.eventId,
          name: normalizedImportData.eventName,
          sessionIds,
          timeZone,
        },
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: "event-created",
      });
    } else {
      mutations.push({
        changes: {
          date: scheduledStart.slice(0, 10),
          name: normalizedImportData.eventName,
          sessionIds,
          timeZone,
        },
        eventId: normalizedImportData.eventId,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: "event-updated",
      });
    }

    if (!existingSession) {
      mutations.push({
        id: createMutationId(),
        session: {
          categoryIds: categoryIds,
          eventId: normalizedImportData.eventId,
          id: normalizedImportData.sessionId,
          kind: "race",
          name: normalizedImportData.eventName,
          notes: "Imported from Apical data file endpoint.",
          scheduledStart,
          status: "completed",
        },
        timestamp: createTimestamp(),
        type: "session-created",
      });
    } else {
      mutations.push({
        changes: {
          name: normalizedImportData.eventName,
          scheduledStart,
        },
        id: createMutationId(),
        sessionId: normalizedImportData.sessionId,
        timestamp: createTimestamp(),
        type: "session-updated",
      });
    }

    mutations.push({
      apicalDataFilePath: normalizedImportData.apicalDataFilePath,
      eventId: normalizedImportData.eventId,
      id: createMutationId(),
      raceState: normalizedImportData.raceState,
      sessionId: normalizedImportData.sessionId,
      timestamp: createTimestamp(),
      type: "race-state-imported",
    });

    if (mutations.length > 0) {
      await this.appendMutations(mutations, onCompleteStep);
    }

    return this.syncEventScaffold(
      normalizedImportData.eventId,
      normalizedImportData.raceState.categories || [],
      normalizedImportData.raceState.participants || [],
      masterProfiles,
      normalizedImportData.raceState.teams || [],
      normalizedImportData.sessionId,
      onCompleteStep,
    );
  }

  public async importMrScatsCatalog(
    importData: MrScatsCatalogImport,
    onCompleteStep: (
      currentTask: string,
      index: number,
    ) => Promise<void> = NO_OP_COMPLETE_STEP,
  ): Promise<EventCatalogState> {
    return this.runMutationBatch(async () =>
      this.importMrScatsCatalogUnbatched(importData, onCompleteStep),
    );
  }

  private async importMrScatsCatalogUnbatched(
    importData: MrScatsCatalogImport,
    onCompleteStep: (
      currentTask: string,
      index: number,
    ) => Promise<void> = NO_OP_COMPLETE_STEP,
  ): Promise<EventCatalogState> {
    const normalizedImportData = rewriteImportedObjectIds(importData).value;
    normalizedImportData.raceState = normalizeImportedRaceStateForEvent(
      normalizedImportData.raceState,
      this.getLatestImportedRaceStatesForEvent(normalizedImportData.eventId),
      getEntrantsForEvent(this.state, normalizedImportData.eventId),
      getCategoriesForEvent(this.state, normalizedImportData.eventId),
    );

    const existingEvent = this.state.events.find(
      (event) => event.id === normalizedImportData.eventId,
    );
    const existingSessions = new Map(
      this.state.sessions.map((session) => [session.id, session] as const),
    );
    const sessionIds = normalizedImportData.sessions.map(
      (session) => session.id,
    );
    const mutations: EventCatalogLedger["mutations"] = [];
    const eventDate =
      normalizedImportData.eventDate ||
      normalizedImportData.sessions[0]?.scheduledStart?.slice(0, 10) ||
      createTimestamp().slice(0, 10);
    const timeZone =
      existingEvent?.timeZone ||
      MR_SCATS_DEFAULT_TIME_ZONE ||
      getSystemTimeZone();

    if (!existingEvent) {
      mutations.push({
        event: {
          categoryIds: [],
          date: eventDate,
          discipline: "motorsport",
          entrantIds: [],
          format: "race-weekend",
          id: normalizedImportData.eventId,
          name: normalizedImportData.eventName,
          sessionIds,
          timeZone,
        },
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: "event-created",
      });
    } else {
      mutations.push({
        changes: {
          date: eventDate,
          discipline: "motorsport",
          name: normalizedImportData.eventName,
          sessionIds: Array.from(
            new Set([...existingEvent.sessionIds, ...sessionIds]),
          ),
          timeZone,
        },
        eventId: normalizedImportData.eventId,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: "event-updated",
      });
    }

    normalizedImportData.sessions.forEach((session) => {
      const existingSession = existingSessions.get(session.id);
      if (!existingSession) {
        mutations.push({
          id: createMutationId(),
          session: {
            categoryIds: session.categoryIds,
            eventId: normalizedImportData.eventId,
            id: session.id,
            kind: getMrScatsSessionKind(session.eventType),
            minimumLapTimeMilliseconds: session.minimumLapTimeMilliseconds,
            name: session.name,
            notes: "Imported from MR-SCATS data files.",
            scheduledStart: session.scheduledStart,
            status: "completed",
          },
          timestamp: createTimestamp(),
          type: "session-created",
        });
        return;
      }

      mutations.push({
        changes: {
          categoryIds: session.categoryIds,
          kind: getMrScatsSessionKind(session.eventType),
          minimumLapTimeMilliseconds: session.minimumLapTimeMilliseconds,
          name: session.name,
          scheduledStart: session.scheduledStart,
          status: "completed",
        },
        id: createMutationId(),
        sessionId: session.id,
        timestamp: createTimestamp(),
        type: "session-updated",
      });
    });

    normalizedImportData.sessions.forEach((session, index) => {
      mutations.push({
        eventId: normalizedImportData.eventId,
        id: createMutationId(),
        raceState: filterRaceStateForCategories(
          normalizedImportData.raceState,
          session.categoryIds,
          session.id,
        ),
        sessionId: session.id,
        timestamp: createTimestamp(),
        type: "race-state-imported",
      });
      onCompleteStep("importMrScatsCatalogUnbatched", index);
    });

    await this.appendMutations(mutations, onCompleteStep);

    return this.syncEventScaffold(
      normalizedImportData.eventId,
      normalizedImportData.raceState.categories || [],
      normalizedImportData.raceState.participants || [],
      [],
      normalizedImportData.raceState.teams || [],
      undefined,
      onCompleteStep,
    );
  }

  public async updateImportedRaceState(
    eventId: EventId,
    sessionId: SessionId,
    raceState: Partial<RaceState>,
    apicalDataFilePath?: string,
    onCompleteStep: (
      currentTask: string,
      index: number,
    ) => Promise<void> = NO_OP_COMPLETE_STEP,
  ): Promise<EventCatalogState> {
    return this.runMutationBatch(async () =>
      this.updateImportedRaceStateUnbatched(
        eventId,
        sessionId,
        raceState,
        onCompleteStep,
        apicalDataFilePath,
      ),
    );
  }

  public async replaceImportedRaceState(
    eventId: EventId,
    sessionId: SessionId,
    raceState: Partial<RaceState>,
    apicalDataFilePath?: string,
    onCompleteStep: (
      currentTask: string,
      index: number,
    ) => Promise<void> = NO_OP_COMPLETE_STEP,
  ): Promise<EventCatalogState> {
    return this.runMutationBatch(async () =>
      this.updateImportedRaceStateUnbatched(
        eventId,
        sessionId,
        raceState,
        onCompleteStep,
        apicalDataFilePath,
        true,
      ),
    );
  }

  private async updateImportedRaceStateUnbatched(
    eventId: EventId,
    sessionId: SessionId,
    raceState: Partial<RaceState>,
    onCompleteStep: (
      currentTask: string,
      index: number,
    ) => Promise<void> = NO_OP_COMPLETE_STEP,
    apicalDataFilePath?: string,
    replaceAssignedSessionScaffold = false,
  ): Promise<EventCatalogState> {
    const normalizedRaceState = normalizeImportedRaceStateForEvent(
      rewriteImportedObjectIds(raceState).value,
      this.getLatestImportedRaceStatesForEvent(eventId),
      getEntrantsForEvent(this.state, eventId),
      getCategoriesForEvent(this.state, eventId),
    );
    const existingMetadata = this.getImportedRaceStateMetadata(
      eventId,
      sessionId,
    );
    const existingEvent = this.state.events.find(
      (event) => event.id === eventId,
    );

    await this.appendMutations(
      [
        {
          apicalDataFilePath:
            apicalDataFilePath ?? existingMetadata?.apicalDataFilePath,
          eventId,
          id: createMutationId(),
          raceState: normalizedRaceState,
          sessionId,
          timestamp: createTimestamp(),
          type: "race-state-imported",
        },
      ],
      onCompleteStep,
    );

    if (!existingEvent) {
      return this.state;
    }

    return this.syncEventScaffold(
      eventId,
      normalizedRaceState.categories || [],
      normalizedRaceState.participants || [],
      [],
      normalizedRaceState.teams || [],
      sessionId,
      onCompleteStep,
      replaceAssignedSessionScaffold,
    );
  }

  public async reloadImportedRaceState(
    eventId: EventId,
    sessionId: SessionId,
    raceState: Partial<RaceState>,
    apicalDataFilePath?: string,
    masterProfiles: MasterEntrantProfile[] = [],
    onCompleteStep: (
      currentTask: string,
      index: number,
    ) => Promise<void> = NO_OP_COMPLETE_STEP,
  ): Promise<EventCatalogState> {
    return this.runMutationBatch(async () =>
      this.reloadImportedRaceStateUnbatched(
        eventId,
        sessionId,
        raceState,
        onCompleteStep,
        apicalDataFilePath,
        masterProfiles,
      ),
    );
  }

  private async reloadImportedRaceStateUnbatched(
    eventId: EventId,
    sessionId: SessionId,
    raceState: Partial<RaceState>,
    onCompleteStep: (currentTask: string, index: number) => Promise<void>,
    apicalDataFilePath?: string,
    masterProfiles: MasterEntrantProfile[] = [],
  ): Promise<EventCatalogState> {
    const linkedCategorySafeRaceState = normalizeImportedRaceStateForEvent(
      rewriteImportedObjectIds(raceState).value,
      this.getLatestImportedRaceStatesForEvent(eventId),
      getEntrantsForEvent(this.state, eventId),
      getCategoriesForEvent(this.state, eventId),
    );
    const existingMetadata = this.getImportedRaceStateMetadata(
      eventId,
      sessionId,
    );
    const replayMutations =
      await this.getManualScaffoldMutationsAfterLatestImport(
        eventId,
        sessionId,
        masterProfiles,
      );

    await this.appendMutations(
      [
        {
          apicalDataFilePath:
            apicalDataFilePath ?? existingMetadata?.apicalDataFilePath,
          eventId,
          id: createMutationId(),
          raceState: linkedCategorySafeRaceState,
          sessionId,
          timestamp: createTimestamp(),
          type: "race-state-imported",
        },
      ],
      onCompleteStep,
    );

    await this.syncEventScaffold(
      eventId,
      linkedCategorySafeRaceState.categories || [],
      linkedCategorySafeRaceState.participants || [],
      masterProfiles,
      linkedCategorySafeRaceState.teams || [],
      sessionId,
      onCompleteStep,
    );

    return replayMutations.length > 0
      ? this.appendMutations(replayMutations, onCompleteStep)
      : this.state;
  }

  public async createSession(
    eventId: EventId,
    onCompleteStep: (
      currentTask: string,
      index: number,
    ) => Promise<void> = NO_OP_COMPLETE_STEP,
  ): Promise<EventCatalogState> {
    const sessionId = createSessionId();
    const session: EventCatalogSession = {
      categoryIds: [],
      eventId,
      id: sessionId,
      kind: "practice",
      name: "New Session",
      notes: "",
      scheduledStart: createTimestamp(),
      status: "draft",
    };
    const event = this.state.events.find((item) => item.id === eventId);

    return this.appendMutations(
      [
        {
          id: createMutationId(),
          session,
          timestamp: createTimestamp(),
          type: "session-created",
        },
        {
          changes: {
            sessionIds: [...(event?.sessionIds || []), sessionId],
          },
          eventId,
          id: createMutationId(),
          timestamp: createTimestamp(),
          type: "event-updated",
        },
      ],
      onCompleteStep,
    );
  }

  public async updateSession(
    sessionId: SessionId,
    changes: Partial<
      Pick<
        EventCatalogSession,
        | "categoryIds"
        | "kind"
        | "minimumLapTimeMilliseconds"
        | "name"
        | "notes"
        | "scheduledStart"
        | "status"
      >
    >,
    onCompleteStep: (
      currentTask: string,
      index: number,
    ) => Promise<void> = NO_OP_COMPLETE_STEP,
  ): Promise<EventCatalogState> {
    const categoryIds = assertSessionCategoryIdsBelongToEvent(
      this.state,
      sessionId,
      changes.categoryIds,
    );
    const normalizedChanges = changes.categoryIds
      ? { ...changes, categoryIds }
      : changes;
    return this.appendMutations(
      [
        {
          changes: normalizedChanges,
          id: createMutationId(),
          sessionId,
          timestamp: createTimestamp(),
          type: "session-updated",
        },
      ],
      onCompleteStep,
    );
  }

  public async updateSessions(
    updates: Array<{
      changes: Partial<
        Pick<
          EventCatalogSession,
          | "categoryIds"
          | "kind"
          | "minimumLapTimeMilliseconds"
          | "name"
          | "notes"
          | "scheduledStart"
          | "status"
        >
      >;
      sessionId: SessionId;
    }>,
    onCompleteStep: (
      currentTask: string,
      index: number,
    ) => Promise<void> = NO_OP_COMPLETE_STEP,
  ): Promise<EventCatalogState> {
    const normalizedUpdates = updates.map((update) => ({
      ...update,
      changes: update.changes.categoryIds
        ? {
            ...update.changes,
            categoryIds: assertSessionCategoryIdsBelongToEvent(
              this.state,
              update.sessionId,
              update.changes.categoryIds,
            ),
          }
        : update.changes,
    }));
    return this.appendMutations(
      normalizedUpdates.map((update) => ({
        changes: update.changes,
        id: createMutationId(),
        sessionId: update.sessionId,
        timestamp: createTimestamp(),
        type: "session-updated" as const,
      })),
      onCompleteStep,
    );
  }

  public async updateCategorySessionAssignments(
    categoryId: EventCategoryId,
    sessionIds: SessionId[],
    onCompleteStep: (
      currentTask: string,
      index: number,
    ) => Promise<void> = NO_OP_COMPLETE_STEP,
  ): Promise<EventCatalogState> {
    const category = this.state.categories.find(
      (candidate) => candidate.id === categoryId && candidate.deleted !== true,
    );
    if (!category) {
      throw new Error(`Cannot assign sessions because category ${categoryId} does not exist.`);
    }

    const selectedSessionIds = new Set(unique(sessionIds));
    const invalidSessionIds = sessionIds.filter((sessionId) => {
      const session = this.state.sessions.find((candidate) => candidate.id === sessionId);
      return !session || session.eventId !== category.eventId;
    });
    if (invalidSessionIds.length > 0) {
      throw new Error(
        `Cannot assign category ${categoryId} to sessions from another event: ${unique(invalidSessionIds).join(", ")}.`,
      );
    }

    const eventCategoryIds = new Set(
      this.state.categories
        .filter((candidate) => candidate.eventId === category.eventId && candidate.deleted !== true)
        .map((candidate) => candidate.id),
    );
    const updates = this.state.sessions
      .filter((session) => session.eventId === category.eventId)
      .flatMap((session) => {
        const validExistingCategoryIds = session.categoryIds.filter((id) => eventCategoryIds.has(id));
        const isAssigned = validExistingCategoryIds.includes(categoryId);
        const shouldBeAssigned = selectedSessionIds.has(session.id);
        const categoryIds = shouldBeAssigned
          ? unique([...validExistingCategoryIds, categoryId])
          : validExistingCategoryIds.filter((id) => id !== categoryId);
        if (isAssigned === shouldBeAssigned && hasSameMembers(session.categoryIds, categoryIds)) {
          return [];
        }
        return [{
          changes: { categoryIds },
          sessionId: session.id,
        }];
      });

    return this.updateSessions(updates, onCompleteStep);
  }

  public async moveSessionToEvent(
    sessionId: SessionId,
    nextEventId: EventId,
    onCompleteStep: (
      currentTask: string,
      index: number,
    ) => Promise<void> = NO_OP_COMPLETE_STEP,
  ): Promise<EventCatalogState> {
    const session = this.state.sessions.find((item) => item.id === sessionId);
    const nextEvent = this.state.events.find((item) => item.id === nextEventId);
    if (!session || !nextEvent || session.eventId === nextEventId) {
      return this.state;
    }

    const previousEvent = this.state.events.find(
      (item) => item.id === session.eventId,
    );
    const targetEventCategoryIds = new Set(
      this.state.categories
        .filter((category) => category.eventId === nextEventId && category.deleted !== true)
        .map((category) => category.id),
    );
    const mutations: EventCatalogLedger["mutations"] = [
      {
        changes: {
          categoryIds: session.categoryIds.filter((categoryId) => targetEventCategoryIds.has(categoryId)),
          eventId: nextEventId,
        },
        id: createMutationId(),
        sessionId,
        timestamp: createTimestamp(),
        type: "session-updated",
      },
      {
        changes: {
          sessionIds: unique([...(nextEvent.sessionIds || []), sessionId]),
        },
        eventId: nextEventId,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: "event-updated",
      },
    ];

    if (previousEvent) {
      mutations.push({
        changes: {
          sessionIds: (previousEvent.sessionIds || []).filter(
            (id) => id !== sessionId,
          ),
        },
        eventId: previousEvent.id,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: "event-updated",
      });
    }

    return this.appendMutations(mutations, onCompleteStep);
  }

  public async activateSession(
    eventId: EventId,
    sessionId: SessionId,
    onCompleteStep: (
      currentTask: string,
      index: number,
    ) => Promise<void> = NO_OP_COMPLETE_STEP,
  ): Promise<EventCatalogState> {
    return this.appendMutations(
      [
        {
          eventId,
          id: createMutationId(),
          sessionId,
          timestamp: createTimestamp(),
          type: "session-activated",
        },
        {
          changes: {
            status: "live",
          },
          id: createMutationId(),
          sessionId,
          timestamp: createTimestamp(),
          type: "session-updated",
        },
      ],
      onCompleteStep,
    );
  }

  public async deleteSession(
    eventId: EventId,
    sessionId: SessionId,
    onCompleteStep: (
      currentTask: string,
      index: number,
    ) => Promise<void> = NO_OP_COMPLETE_STEP,
  ): Promise<EventCatalogState> {
    const event = this.state.events.find((item) => item.id === eventId);
    return this.appendMutations(
      [
        {
          id: createMutationId(),
          sessionId,
          timestamp: createTimestamp(),
          type: "session-deleted",
        },
        {
          changes: {
            sessionIds: (event?.sessionIds || []).filter(
              (id) => id !== sessionId,
            ),
          },
          eventId,
          id: createMutationId(),
          timestamp: createTimestamp(),
          type: "event-updated",
        },
      ],
      onCompleteStep,
    );
  }

  public async createCategory(
    eventId: EventId,
    onCompleteStep: (
      currentTask: string,
      index: number,
    ) => Promise<void> = NO_OP_COMPLETE_STEP,
  ): Promise<EventCatalogState> {
    const categoryId = createCategoryId();
    const category: EventCatalogCategory = {
      code: "",
      description: "",
      distanceRule: {
        kind: "unspecified",
      },
      eventId,
      id: categoryId,
      name: "New Category",
      teamRules: {
        teamCompositionRules: [],
      },
    };
    const event = this.state.events.find((item) => item.id === eventId);

    return this.appendMutations(
      [
        {
          category,
          id: createMutationId(),
          timestamp: createTimestamp(),
          type: "category-created",
        },
        {
          changes: {
            categoryIds: [...(event?.categoryIds || []), categoryId],
          },
          eventId,
          id: createMutationId(),
          timestamp: createTimestamp(),
          type: "event-updated",
        },
      ],
      onCompleteStep,
    );
  }

  public async updateCategory(
    categoryId: CategoryId,
    changes: Partial<
      Pick<
        EventCatalogCategory,
        | "code"
        | "deleted"
        | "description"
        | "distance"
        | "distanceRule"
        | "duration"
        | "excludeFromResults"
        | "isPlaceholder"
        | "name"
        | "startTime"
        | "teamRules"
      >
    >,
    onCompleteStep: (
      currentTask: string,
      index: number,
    ) => Promise<void> = NO_OP_COMPLETE_STEP,
  ): Promise<EventCatalogState> {
    return this.appendMutations(
      [
        {
          categoryId,
          changes,
          id: createMutationId(),
          timestamp: createTimestamp(),
          type: "category-updated",
        },
      ],
      onCompleteStep,
    );
  }

  public async deleteCategory(
    eventId: EventId,
    categoryId: CategoryId,
    onCompleteStep: (
      currentTask: string,
      index: number,
    ) => Promise<void> = NO_OP_COMPLETE_STEP,
  ): Promise<EventCatalogState> {
    const event = this.state.events.find((item) => item.id === eventId);

    return this.appendMutations(
      [
        {
          categoryId,
          id: createMutationId(),
          timestamp: createTimestamp(),
          type: "category-deleted",
        },
        {
          changes: {
            categoryIds: (event?.categoryIds || []).filter(
              (id) => id !== categoryId,
            ),
          },
          eventId,
          id: createMutationId(),
          timestamp: createTimestamp(),
          type: "event-updated",
        },
      ],
      onCompleteStep,
    );
  }

  public async importEntrants(
    eventId: EventId,
    records: EntrantImportRecord[],
    defaultCategoryId: EventCategoryId | undefined = undefined,
    onCompleteStep: (
      currentTask: string,
      index: number,
    ) => Promise<void> = NO_OP_COMPLETE_STEP,
  ): Promise<EventCatalogState> {
    const event = this.state.events.find(
      (candidate) => candidate.id === eventId,
    );
    if (!event) {
      throw new Error(`Cannot import entrants for unknown event ${eventId}.`);
    }
    const importedRaceStates = this.state.sessions
      .filter((session) => session.eventId === eventId)
      .flatMap((session) => {
        const metadata = this.getImportedRaceStateMetadata(eventId, session.id);
        return metadata ? [{ metadata, sessionId: session.id }] : [];
      });
    const sourceParticipants = importedRaceStates.flatMap(
      ({ metadata }) => metadata.raceState.participants || [],
    );
    const originalEntrants = getEntrantsForEvent(this.state, eventId);
    const originalEntries = getEntriesForEvent(this.state, eventId);
    const categories = getCategoriesForEvent(this.state, eventId);
    const categoriesById = new Map(
      categories.map((category) => [category.id.toString(), category] as const),
    );
    const selectedDefaultCategoryId =
      defaultCategoryId && categoriesById.has(defaultCategoryId.toString())
        ? defaultCategoryId
        : undefined;
    if (defaultCategoryId && !selectedDefaultCategoryId) {
      throw new Error(
        `Cannot import entrants into category ${defaultCategoryId}: it does not belong to event ${eventId}.`,
      );
    }
    let workingEntrants: EventCatalogEntrant[] = originalEntrants.map(
      (entrant) => ({
        ...entrant,
        categoryIds: [...entrant.categoryIds],
        identifiers: [...(entrant.identifiers || [])],
        memberParticipantIds: [...entrant.memberParticipantIds],
        teamMembers: entrant.teamMembers ? [...entrant.teamMembers] : undefined,
      }),
    );
    const workingEntriesById = new Map<EventEntryId, EventCatalogEntry>(
      originalEntries.map((entry) => [entry.id, {
        ...entry,
        identifiers: [...entry.identifiers],
        participantIds: [...entry.participantIds],
      }]),
    );
    const importedRiderIds = new Set<EventEntrantId>();

    records.forEach((record) => {
      const importedCategoryId = resolveEntrantImportCategoryId(
        record,
        categories,
        selectedDefaultCategoryId,
      );
      const importedName =
        `${record.firstName || ""} ${record.lastName || ""}`.trim();
      const hasUsableName =
        importedName.length > 0 &&
        !isPlaceholderEntrantName(record.fullName || importedName);
      const matchingSourceParticipant = findUniqueSourceParticipantImportMatch(
        sourceParticipants,
        record,
        categoriesById,
      );
      let rider = findUniqueEntrantImportMatch(
        workingEntrants,
        sourceParticipants,
        record,
        categoriesById,
        false,
      );
      if (!rider) {
        const entrantId =
          matchingSourceParticipant?.entrantId || createEventEntrantId();
        const participantId =
          matchingSourceParticipant?.id || createEventParticipantId();
        rider = {
          categoryId: importedCategoryId || event.categoryIds[0],
          categoryIds:
            importedCategoryId || event.categoryIds[0]
              ? [importedCategoryId || event.categoryIds[0]]
              : [],
          entrantType: "rider",
          eventId,
          firstName: hasUsableName ? record.firstName : undefined,
          id: entrantId,
          identifiers: [],
          lastName: hasUsableName ? record.lastName : undefined,
          memberParticipantIds: [participantId],
          name: hasUsableName ? importedName : "Unknown participant",
        };
        workingEntrants.push(rider);
      }

      const riderIndex = workingEntrants.findIndex(
        (entrant) => entrant.id === rider!.id,
      );
      const participantId =
        matchingSourceParticipant?.id ||
        rider.memberParticipantIds[0] ||
        getParticipantsForCatalogEntrant(rider, sourceParticipants)[0]?.id ||
        createEventParticipantId();
      const riderCategoryId = importedCategoryId || rider.categoryId;
      rider = {
        ...rider,
        categoryId: riderCategoryId,
        categoryIds: riderCategoryId ? [riderCategoryId] : rider.categoryIds,
        firstName: hasUsableName ? record.firstName : rider.firstName,
        identifiers: mergeEntrantImportIdentifiers(rider.identifiers, record),
        isPlaceholder: false,
        lastName: hasUsableName ? record.lastName : rider.lastName,
        memberParticipantIds: unique([
          ...rider.memberParticipantIds,
          participantId,
        ]),
        name: hasUsableName ? importedName : rider.name,
        startOrder:
          event.discipline === "motorsport"
            ? undefined
            : (record.startOrder ?? rider.startOrder),
        teamEntrantId: record.teamName ? rider.teamEntrantId : undefined,
        vehicle: event.discipline === "motorsport" ? undefined : rider.vehicle,
      };

      if (record.teamName) {
        const normalizedTeamName = normalizeEntrantImportValue(
          record.teamName,
        );
        let team = workingEntrants.find(
          (entrant) =>
            entrant.entrantType === "team" &&
            entrant.isEntryOwner !== true &&
            normalizeEntrantImportValue(entrant.name) === normalizedTeamName,
        );
        if (!team) {
          team = {
            categoryId: rider.categoryId,
            categoryIds: rider.categoryIds,
            entrantType: "team",
            eventId,
            id: createEventEntrantId(),
            memberParticipantIds: [],
            name: record.teamName,
            startOrder: record.startOrder,
            teamMembers: [],
            vehicle: record.vehicle,
          };
          workingEntrants.push(team);
        }
        const resolvedTeam = team;
        const teamCategoryId =
          importedCategoryId || resolvedTeam.categoryId || riderCategoryId;
        const teamMemberIds = new Set(
          resolvedTeam.memberParticipantIds.map((id) => id.toString()),
        );
        teamMemberIds.add(participantId.toString());
        const teamMembers = (resolvedTeam.teamMembers || []).filter(
          (member) => member.participantId !== participantId,
        );
        teamMembers.push({
          categoryId: rider.categoryId,
          firstName: rider.firstName || "",
          lastName: rider.lastName || "",
          participantId,
        });
        const teamIndex = workingEntrants.findIndex(
          (entrant) => entrant.id === resolvedTeam.id,
        );
        workingEntrants[teamIndex] = {
          ...resolvedTeam,
          categoryId: teamCategoryId,
          categoryIds: teamCategoryId
            ? [teamCategoryId]
            : resolvedTeam.categoryIds,
          memberParticipantIds: Array.from(teamMemberIds),
          startOrder: record.startOrder ?? resolvedTeam.startOrder,
          teamMembers,
          vehicle: record.vehicle || resolvedTeam.vehicle,
        };
        rider.teamEntrantId = resolvedTeam.id;
      }

      const entryId = (record.teamName && rider.teamEntrantId
        ? rider.teamEntrantId
        : rider.id) as EventEntryId;
      let ownerEntrantId: EventEntrantId | undefined;
      const ownerName = record.entrantName || (
        event.discipline === "motorsport" ? rider.name : undefined
      );
      const normalizedOwnerName = normalizeEntrantImportValue(ownerName);
      if (normalizedOwnerName) {
        let owner = workingEntrants.find((entrant) => (
          entrant.isEntryOwner === true &&
          normalizeEntrantImportValue(entrant.name) === normalizedOwnerName
        ));
        if (!owner) {
          owner = {
            categoryIds: [],
            entrantType: "team",
            entryIds: [],
            eventId,
            id: createEventEntrantId(),
            isEntryOwner: true,
            memberParticipantIds: [],
            name: ownerName!,
          };
          workingEntrants.push(owner);
        }
        ownerEntrantId = owner.id;
        owner.entryIds = unique([...(owner.entryIds || []), entryId]);
        owner.memberParticipantIds = unique([...(owner.memberParticipantIds || []), participantId]);
        if (rider.categoryId) {
          owner.categoryIds = unique([...(owner.categoryIds || []), rider.categoryId]);
        }
      }

      const entryParent = workingEntrants.find((entrant) => entrant.id === entryId);
      const existingEntry = workingEntriesById.get(entryId);
      workingEntriesById.set(entryId, {
        categoryId: rider.categoryId || entryParent?.categoryId,
        entrantId: ownerEntrantId || existingEntry?.entrantId || rider.id,
        eventId,
        id: entryId,
        identifiers: mergeParticipantIdentifiers(existingEntry?.identifiers, rider.identifiers),
        name: record.teamName || rider.name,
        participantIds: unique([...(existingEntry?.participantIds || []), participantId]),
        raceNumber: record.raceNumber || existingEntry?.raceNumber,
        sessionIds: existingEntry?.sessionIds,
        startOrder: record.startOrder ?? existingEntry?.startOrder,
        vehicle: record.vehicle || existingEntry?.vehicle,
      });

      workingEntrants[riderIndex] = rider;
      importedRiderIds.add(rider.id);
    });

    const originalEntrantsById = new Map(
      originalEntrants.map((entrant) => [entrant.id, entrant]),
    );
    const entrantMutations: EventCatalogLedger["mutations"] =
      workingEntrants.flatMap((entrant): EventCatalogLedger["mutations"] => {
        const original = originalEntrantsById.get(entrant.id);
        if (!original) {
          return [
            {
              entrant,
              id: createMutationId(),
              timestamp: createTimestamp(),
              type: "entrant-created" as const,
            },
          ];
        }
        if (hasSameSerializedValue(original, entrant)) {
          return [];
        }
        const {
          eventId: _eventId,
          id: _id,
          sessionIds: _sessionIds,
          ...changes
        } = entrant;
        return [
          {
            changes,
            entrantId: entrant.id,
            id: createMutationId(),
            timestamp: createTimestamp(),
            type: "entrant-updated" as const,
          },
        ];
      });
    const originalEntriesById = new Map(originalEntries.map((entry) => [entry.id, entry]));
    const workingEntries = Array.from(workingEntriesById.values());
    const entryMutations: EventCatalogLedger["mutations"] = workingEntries.flatMap((entry): EventCatalogLedger["mutations"] => {
      const original = originalEntriesById.get(entry.id);
      if (!original) {
        return [{
          entry,
          id: createMutationId(),
          timestamp: createTimestamp(),
          type: "entry-created" as const,
        }];
      }
      if (hasSameSerializedValue(original, entry)) {
        return [];
      }
      const { eventId: _eventId, id: _id, ...changes } = entry;
      return [{
        changes,
        entryId: entry.id,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: "entry-updated" as const,
      }];
    });
    const importedRiders = workingEntrants.filter((entrant) =>
      importedRiderIds.has(entrant.id),
    );
    const importedCategoryIds = new Set<EventCategoryId>(
      workingEntries
        .map((entry) => entry.categoryId)
        .filter((categoryId): categoryId is EventCategoryId => categoryId !== undefined),
    );
    const importedTransponderNumbers = new Set(
      records
        .map((record) => normalizeEntrantImportValue(record.transponderNumber))
        .filter(Boolean),
    );
    const importedRiderIdsByTransponder = new Map<string, string>();
    importedRiders.forEach((rider) => {
      getEntrantImportIdentifierValues(rider, sourceParticipants, "txNo")
        .filter((transponder) => importedTransponderNumbers.has(transponder))
        .forEach((transponder) => {
          importedRiderIdsByTransponder.set(
            transponder,
            rider.memberParticipantIds[0]?.toString() || "",
          );
        });
    });
    const selectedRiderIds = new Set(
      importedRiders.map((rider) => rider.id.toString()),
    );
    const placeholderEntrantIdsToRemove = new Set(
      workingEntrants
        .filter((entrant) =>
          !selectedRiderIds.has(entrant.id.toString()) &&
          (entrant.isPlaceholder === true ||
            isPlaceholderEntrantName(entrant.name) ||
            (hasPlaceholderCategory(entrant.categoryId, categoriesById) &&
              !entrant.firstName?.trim() &&
              !entrant.lastName?.trim())) &&
          getEntrantImportIdentifierValues(entrant, sourceParticipants, "txNo")
            .some((transponder) => importedTransponderNumbers.has(transponder)),
        )
        .map((entrant) => entrant.id.toString()),
    );
    workingEntrants = workingEntrants.filter(
      (entrant) => !placeholderEntrantIdsToRemove.has(entrant.id.toString()),
    );
    const placeholderParticipantRedirects = new Map<string, string>();
    sourceParticipants.forEach((participant) => {
      const matchingTransponder = getIdentifierValues(participant.identifiers, "txNo")
        .map(normalizeEntrantImportValue)
        .find((transponder) => importedRiderIdsByTransponder.has(transponder));
      const replacementParticipantId = matchingTransponder
        ? importedRiderIdsByTransponder.get(matchingTransponder)
        : undefined;
      if (
        replacementParticipantId &&
        replacementParticipantId !== participant.id.toString() &&
        (participant.isPlaceholder === true ||
          isPlaceholderEntrantName(getParticipantDisplayName(participant)) ||
          (hasPlaceholderCategory(participant.categoryId, categoriesById) &&
            !participant.firstname.trim() &&
            !participant.surname.trim()))
      ) {
        placeholderParticipantRedirects.set(
          participant.id.toString(),
          replacementParticipantId,
        );
      }
    });
    const teamsById = new Map(
      workingEntrants
        .filter((entrant) => entrant.entrantType === "team")
        .map((entrant) => [entrant.id, entrant]),
    );
    const participantCategoryUpdates = new Map<string, EventCategoryId>();
    records.forEach((record) => {
      const categoryId = resolveEntrantImportCategoryId(
        record,
        categories,
        selectedDefaultCategoryId,
      );
      if (!categoryId) {
        return;
      }
      sourceParticipants.forEach((participant) => {
        if (participantMatchesEntrantImportRecord(participant, record)) {
          participantCategoryUpdates.set(participant.id.toString(), categoryId);
        }
      });
    });
    const raceStateMutations: EventCatalogLedger["mutations"] =
      importedRaceStates.map(({ metadata, sessionId }) => {
        const participants = (metadata.raceState.participants || [])
          .filter(
            (participant) =>
              !placeholderParticipantRedirects.has(participant.id.toString()),
          )
          .map(
          (participant): EventParticipant => {
            const categoryId = participantCategoryUpdates.get(
              participant.id.toString(),
            );
            return categoryId && !participant.entrantId
              ? { ...participant, categoryId }
              : participant;
          },
        );
        importedRiders.forEach((rider) => {
          const memberIds = new Set(
            rider.memberParticipantIds.map((id) => id.toString()),
          );
          let participantIndex = participants.findIndex((participant) =>
            memberIds.has(participant.id.toString()),
          );
          if (participantIndex < 0) {
            participantIndex = participants.length;
          }
          const existingParticipant = participants[participantIndex];
          const participantId = existingParticipant?.id || rider.memberParticipantIds[0];
          const entry = workingEntries.find((candidate) => (
            candidate.participantIds.includes(participantId)
          ));
          const entryId = entry?.id || rider.teamEntrantId || rider.id;
          participants[participantIndex] = {
            categoryId: undefined,
            currentResult: existingParticipant?.currentResult,
            entrantId: entry?.entrantId || rider.id,
            entryId,
            firstname: rider.firstName || existingParticipant?.firstname || "",
            id: participantId,
            identifiers: mergeParticipantIdentifiers(
              existingParticipant?.identifiers,
              rider.identifiers,
            ),
            isPlaceholder: false,
            lastRecordTime: existingParticipant?.lastRecordTime || null,
            resultDuration: existingParticipant?.resultDuration || null,
            surname: rider.lastName || existingParticipant?.surname || "",
          };
        });
        const remappedRecords = (metadata.raceState.records || []).map(
          (record): TimeRecord => {
            if (!("participantId" in record) || !record.participantId) {
              return record;
            }
            const participantId = placeholderParticipantRedirects.get(
              record.participantId.toString(),
            );
            return participantId
              ? ({ ...record, participantId } as TimeRecord)
              : record;
          },
        );
        const teamsByRaceStateId = new Map(
          (metadata.raceState.teams || []).map((team) => [team.id, team]),
        );
        importedRiders.forEach((rider) => {
          if (!rider.teamEntrantId) {
            return;
          }
          const catalogTeam = teamsById.get(rider.teamEntrantId);
          if (!catalogTeam) {
            return;
          }
          const existingTeam = teamsByRaceStateId.get(catalogTeam.id);
          teamsByRaceStateId.set(catalogTeam.id, {
            categoryId: catalogTeam.categoryId || rider.categoryId || "",
            description: existingTeam?.description || "Imported entrant team",
            id: catalogTeam.id,
            members: Array.from(
              new Set([
                ...(existingTeam?.members || []),
                ...catalogTeam.memberParticipantIds,
              ]),
            ),
            name: catalogTeam.name,
          });
        });
        return {
          apicalDataFilePath: metadata.apicalDataFilePath,
          eventId,
          id: createMutationId(),
          raceState: {
            ...metadata.raceState,
            categories: [
              ...(metadata.raceState.categories || []),
              ...categories.filter((category) => (
                importedCategoryIds.has(category.id) &&
                !(metadata.raceState.categories || []).some((existingCategory) => existingCategory.id === category.id)
              )),
            ],
            entries: workingEntries,
            participants,
            records: remappedRecords,
            teams: Array.from(teamsByRaceStateId.values()),
          },
          sessionId,
          timestamp: createTimestamp(),
          type: "race-state-imported" as const,
        };
      });
    const sessionMutations: EventCatalogLedger["mutations"] = importedRaceStates.flatMap(({ sessionId }) => {
      const session = this.state.sessions.find((candidate) => candidate.id === sessionId && candidate.eventId === eventId);
      if (!session) {
        return [];
      }
      const categoryIds = unique([...session.categoryIds, ...importedCategoryIds]);
      if (hasSameMembers(session.categoryIds, categoryIds)) {
        return [];
      }
      return [{
        changes: { categoryIds },
        id: createMutationId(),
        sessionId,
        timestamp: createTimestamp(),
        type: "session-updated" as const,
      }];
    });
    const entrantIds = workingEntrants.map((entrant) => entrant.id);
    const entryIds = workingEntries.map((entry) => entry.id);
    const eventMutation: EventCatalogLedger["mutations"] = hasSameMembers(event.entrantIds, entrantIds) && hasSameMembers(event.entryIds || [], entryIds)
      ? []
      : [
          {
            changes: { entrantIds, entryIds },
            eventId,
            id: createMutationId(),
            timestamp: createTimestamp(),
            type: "event-updated" as const,
          },
        ];

    const placeholderEntrantRemovalMutations: EventCatalogLedger["mutations"] =
      originalEntrants
        .filter((entrant) => placeholderEntrantIdsToRemove.has(entrant.id.toString()))
        .map((entrant) => ({
          entrantId: entrant.id,
          id: createMutationId(),
          timestamp: createTimestamp(),
          type: "entrant-deleted" as const,
        }));

    return this.appendMutations(
      [...entrantMutations, ...entryMutations, ...eventMutation, ...sessionMutations, ...raceStateMutations, ...placeholderEntrantRemovalMutations],
      onCompleteStep,
    );
  }

  public async createEntrant(
    eventId: EventId,
    entrantType: EntrantType = "rider",
    onCompleteStep: (
      currentTask: string,
      index: number,
    ) => Promise<void> = NO_OP_COMPLETE_STEP,
  ): Promise<EventCatalogState> {
    const entrantId = createEventEntrantId();
    const event = this.state.events.find((item) => item.id === eventId);
    const categoryId = event?.categoryIds[0];
    const entrantLabels = getEventDisciplineLabels(event?.discipline);
    const entrant: EventCatalogEntrant = {
      categoryId,
      categoryIds: categoryId ? [categoryId] : [],
      entrantType,
      eventId,
      id: entrantId,
      memberParticipantIds: [],
      name:
        entrantType === "team"
          ? event?.discipline === "motorsport"
            ? "New Entrant"
            : "New Team"
          : `New ${entrantLabels.singular}`,
      notes: "",
      teamMembers: entrantType === "team" ? [] : undefined,
    };

    return this.appendMutations(
      [
        {
          entrant,
          id: createMutationId(),
          timestamp: createTimestamp(),
          type: "entrant-created",
        },
        {
          changes: {
            entrantIds: [...(event?.entrantIds || []), entrantId],
          },
          eventId,
          id: createMutationId(),
          timestamp: createTimestamp(),
          type: "event-updated",
        },
      ],
      onCompleteStep,
    );
  }

  public async updateEntrant(
    entrantId: EventEntrantId,
    changes: Partial<
      Pick<
        EventCatalogEntrant,
        | "categoryId"
        | "categoryIds"
        | "dateOfBirth"
        | "entrantType"
        | "firstName"
        | "gender"
        | "identifiers"
        | "lastName"
        | "memberParticipantIds"
        | "name"
        | "notes"
        | "startOrder"
        | "teamEntrantId"
        | "teamMembers"
        | "vehicle"
      >
    >,
    onCompleteStep: (
      currentTask: string,
      index: number,
    ) => Promise<void> = NO_OP_COMPLETE_STEP,
  ): Promise<EventCatalogState> {
    return this.appendMutations(
      [{
        changes: normalizeEntrantChanges(changes),
        entrantId,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: "entrant-updated",
      }],
      onCompleteStep,
    );
  }

  public async updateEntry(
    entryId: EventEntryId,
    changes: Partial<
      Pick<
        EventCatalogEntry,
        | "categoryId"
        | "entrantId"
        | "identifiers"
        | "name"
        | "participantIds"
        | "raceNumber"
        | "sessionIds"
        | "startOrder"
        | "vehicle"
      >
    >,
    onCompleteStep: (
      currentTask: string,
      index: number,
    ) => Promise<void> = NO_OP_COMPLETE_STEP,
  ): Promise<EventCatalogState> {
    const entry = (this.state.entries || []).find((candidate) => candidate.id === entryId);
    if (!entry) {
      throw new Error(`Cannot update missing Entry ${entryId}.`);
    }
    if (changes.categoryId) {
      const category = this.state.categories.find((candidate) => candidate.id === changes.categoryId);
      if (!category || category.eventId !== entry.eventId) {
        throw new Error(`Cannot assign Entry ${entryId} to a category from another event.`);
      }
    }

    return this.appendMutations(
      [{
        changes,
        entryId,
        id: createMutationId(),
        timestamp: createTimestamp(),
        type: "entry-updated",
      }],
      onCompleteStep,
    );
  }

  public async deleteEntrant(
    eventId: EventId,
    entrantId: EventEntrantId,
    onCompleteStep: (
      currentTask: string,
      index: number,
    ) => Promise<void> = NO_OP_COMPLETE_STEP,
  ): Promise<EventCatalogState> {
    const event = this.state.events.find((item) => item.id === eventId);
    if (this.importedRaceStateReferencesEntrant(eventId, entrantId)) {
      throw new Error(
        `Cannot delete entrant ${entrantId} because imported participants still reference it.`,
      );
    }

    return this.appendMutations(
      [
        {
          entrantId,
          id: createMutationId(),
          timestamp: createTimestamp(),
          type: "entrant-deleted",
        },
        {
          changes: {
            entrantIds: (event?.entrantIds || []).filter(
              (id) => id !== entrantId,
            ),
          },
          eventId,
          id: createMutationId(),
          timestamp: createTimestamp(),
          type: "event-updated",
        },
      ],
      onCompleteStep,
    );
  }

  private async appendMutations(
    mutations: EventCatalogLedger["mutations"],
    onCompleteStep: (
      currentTask: string,
      index: number,
    ) => Promise<void> = NO_OP_COMPLETE_STEP,
  ): Promise<EventCatalogState> {
    const nextMutations = await removeDuplicateAndNoopMutations(
      this.ledger.mutations,
      mutations,
      onCompleteStep,
    );
    if (hasSameMutationSequence(nextMutations, this.ledger.mutations)) {
      return this.state;
    }

    this.ledger = {
      ...this.ledger,
      mutations: nextMutations,
    };
    await this.persist();
    return this.state;
  }

  private cloneReplayMutation<TMutation extends EventCatalogMutation>(
    mutation: TMutation,
  ): TMutation {
    return {
      ...mutation,
      id: createMutationId(),
      timestamp: createTimestamp(),
    };
  }

  private async runMutationBatch<T>(operation: () => Promise<T>): Promise<T> {
    this.batchDepth += 1;
    try {
      return await operation();
    } finally {
      this.batchDepth -= 1;
      if (this.batchDepth === 0 && this.pendingBatchPersist) {
        this.pendingBatchPersist = false;
        await this.persistCurrentLedger();
      }
    }
  }

  private getLatestImportedRaceStatesForEvent(
    eventId: EventId,
  ): Partial<RaceState>[] {
    const latestRaceStatesBySessionId = new Map<string, Partial<RaceState>>();

    this.ledger.mutations.forEach((mutation) => {
      if (
        mutation.type !== "race-state-imported" ||
        mutation.eventId !== eventId
      ) {
        return;
      }

      latestRaceStatesBySessionId.set(
        mutation.sessionId.toString(),
        normalizeImportedRaceStateForCatalog(mutation.raceState),
      );
    });

    return Array.from(latestRaceStatesBySessionId.values());
  }

  private importedRaceStateReferencesEntrant(
    eventId: EventId,
    entrantId: EventEntrantId,
  ): boolean {
    const targetEntrantId = entrantId.toString();

    return this.getLatestImportedRaceStatesForEvent(eventId).some(
      (raceState) => {
        return (raceState.participants || []).some((participant) => {
          return (
            participant.entrantId?.toString() === targetEntrantId ||
            participant.id.toString() === targetEntrantId
          );
        });
      },
    );
  }

  private async getManualScaffoldMutationsAfterLatestImport(
    eventId: EventId,
    sessionId: SessionId,
    masterProfiles: MasterEntrantProfile[],
  ): Promise<EventCatalogLedger["mutations"]> {
    const latestImportIndex = this.ledger.mutations.findLastIndex(
      (mutation) => {
        return (
          mutation.type === "race-state-imported" &&
          mutation.eventId === eventId &&
          mutation.sessionId === sessionId
        );
      },
    );
    if (latestImportIndex < 0) {
      return [];
    }

    const importedRaceState = this.getImportedRaceState(eventId, sessionId);
    const importedCategories = deriveCategoriesFromEventData(
      eventId,
      importedRaceState?.categories || [],
      importedRaceState?.participants || [],
      importedRaceState?.teams || [],
    );
    const importedEntrants = await deriveEntrantsFromParticipants(
      eventId,
      importedRaceState?.participants || [],
      importedCategories,
      masterProfiles,
      importedRaceState?.teams || [],
    );
    const importedCategoryChangesById = new Map(
      importedCategories.map(
        (category) =>
          [
            category.id.toString(),
            getCategoryScaffoldChanges(category),
          ] as const,
      ),
    );
    const importedEntrantChangesById = new Map(
      importedEntrants.map(
        (entrant) =>
          [entrant.id.toString(), getEntrantScaffoldChanges(entrant)] as const,
      ),
    );
    const importedCategoryIds = new Set(
      importedCategories.map((category) => category.id.toString()),
    );
    const importedEntrantIds = new Set(
      importedEntrants.map((entrant) => entrant.id.toString()),
    );

    return this.ledger.mutations
      .slice(latestImportIndex + 1)
      .reduce<EventCatalogLedger["mutations"]>((replayMutations, mutation) => {
        if (mutation.type === "category-updated") {
          const importedChanges = importedCategoryChangesById.get(
            mutation.categoryId.toString(),
          );
          if (
            !importedChanges ||
            !hasSameSerializedValue(mutation.changes, importedChanges)
          ) {
            replayMutations.push(this.cloneReplayMutation(mutation));
          }
          return replayMutations;
        }

        if (mutation.type === "entrant-updated") {
          const importedChanges = importedEntrantChangesById.get(
            mutation.entrantId.toString(),
          );
          if (
            !importedChanges ||
            !hasSameSerializedValue(mutation.changes, importedChanges)
          ) {
            replayMutations.push(this.cloneReplayMutation(mutation));
          }
          return replayMutations;
        }

        if (mutation.type === "category-deleted") {
          if (!importedCategoryIds.has(mutation.categoryId.toString())) {
            replayMutations.push(this.cloneReplayMutation(mutation));
          }
          return replayMutations;
        }

        if (mutation.type === "entrant-deleted") {
          if (!importedEntrantIds.has(mutation.entrantId.toString())) {
            replayMutations.push(this.cloneReplayMutation(mutation));
          }
          return replayMutations;
        }

        return replayMutations;
      }, []);
  }

  private async persist(): Promise<void> {
    this.state = applyEventCatalogLedger(this.ledger);
    if (this.batchDepth > 0) {
      this.pendingBatchPersist = true;
      return;
    }

    await this.persistCurrentLedger();
  }

  private async persistCurrentLedger(): Promise<void> {
    await this.persistence.save(this.ledger);
    if (this.options.onPersistedLedger && !this.applyingRemoteMutations) {
      await this.options.onPersistedLedger(this.ledger);
    }
  }
}
