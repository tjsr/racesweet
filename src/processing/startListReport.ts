import {
  type EventCatalogCategory,
  type EventCatalogEntrant,
  type EventCatalogEntry,
  type EventCatalogSession,
  type EventCatalogState,
  getEntrantCategoryIds,
  getSessionAssignedCategoryIds,
} from "../catalog/eventCatalog.js";
import type { ParticipantIdentifier } from "../model/eventparticipant.js";
import type { EventId, SessionId } from "../model/raceevent.js";

export interface StartListReportRow {
  categoryIds: string[];
  categoryName: string;
  completeness: string[];
  duplicatePosition: boolean;
  entrantId: string;
  entrantName: string;
  entryId?: string;
  gridPosition?: number;
  identifiers: string;
  participantNames: string[];
  raceNumber: string;
  sessionId: SessionId;
  sessionName: string;
  startGroup: string;
  startGroupId: string;
  startGroupOrder: number;
  teamName: string;
  vehicle: string;
}

export interface StartListReportProjection {
  eventName: string;
  rows: StartListReportRow[];
  sessionName: string;
  warnings: string[];
}

export interface StartListReportFilter {
  categoryId?: string;
  startGroupId?: string;
}

interface StartGroup {
  id: string;
  label: string;
  order: number;
}

const getIdentifierValues = (
  identifiers: ParticipantIdentifier[],
  key: string,
): string[] =>
  identifiers.flatMap((identifier: ParticipantIdentifier): string[] => {
    const value: string | number | undefined = (
      identifier as ParticipantIdentifier &
        Record<string, string | number | undefined>
    )[key];
    return value === undefined || value === null
      ? []
      : [String(value).trim()].filter(Boolean);
  });

const participantNames = (
  entrant: EventCatalogEntrant,
  entrants: EventCatalogEntrant[],
  ids: string[],
): string[] => {
  const names: string[] = entrants
    .filter(
      (candidate: EventCatalogEntrant): boolean =>
        candidate.entrantType === "rider" &&
        (ids.some(
          (id: string): boolean =>
            candidate.id === id || candidate.memberParticipantIds.includes(id),
        ) ||
          (ids.length === 0 && candidate.teamEntrantId === entrant.id)),
    )
    .map((candidate: EventCatalogEntrant): string => candidate.name);
  (entrant.teamMembers || [])
    .filter(
      (
        member: NonNullable<EventCatalogEntrant["teamMembers"]>[number],
      ): boolean => ids.length === 0 || ids.includes(member.participantId),
    )
    .forEach(
      (
        member: NonNullable<EventCatalogEntrant["teamMembers"]>[number],
      ): void => {
        names.push(
          [member.firstName, member.lastName].filter(Boolean).join(" ").trim(),
        );
      },
    );
  if (entrant.entrantType === "rider" && names.length === 0)
    names.push(entrant.name);
  return [...new Set(names.filter(Boolean))];
};

const buildGroups = (
  session: EventCatalogSession,
  categories: EventCatalogCategory[],
): Map<string, StartGroup> => {
  const groups: Map<string, StartGroup> = new Map();
  let wave: StartGroup | undefined;
  // Only explicitly configured sequence items identify a start group.
  (session.startSequence || []).forEach((item, index: number): void => {
    if (item.type === "start-wave") {
      const startDescription: string = item.timeOfDay
        ? `${item.timeOfDay} local time`
        : item.offset;
      wave = {
        id: `wave:${item.id}`,
        label: `Wave ${index + 1} (${startDescription})`,
        order: index,
      };
    } else if (session.categoryIds.includes(item.categoryId)) {
      const category: EventCatalogCategory | undefined = categories.find(
        (candidate: EventCatalogCategory): boolean =>
          candidate.id === item.categoryId,
      );
      if (category)
        groups.set(
          category.id,
          wave || {
            id: `category:${category.id}`,
            label: category.name,
            order: index,
          },
        );
    }
  });
  return groups;
};

export const filterStartListRows = (
  rows: StartListReportRow[],
  filter: StartListReportFilter,
): StartListReportRow[] =>
  rows.filter(
    (row: StartListReportRow): boolean =>
      (!filter.categoryId || row.categoryIds.includes(filter.categoryId)) &&
      (!filter.startGroupId || row.startGroupId === filter.startGroupId),
  );

export const buildStartListReport = (
  catalog: EventCatalogState,
  eventId: EventId | undefined,
  sessionId: SessionId | undefined,
): StartListReportProjection => {
  const event = catalog.events.find(
    (candidate): boolean =>
      candidate.id === eventId &&
      !catalog.deletedEventIds.includes(candidate.id),
  );
  const session: EventCatalogSession | undefined = catalog.sessions.find(
    (candidate: EventCatalogSession): boolean =>
      candidate.id === sessionId && candidate.eventId === eventId,
  );
  const empty: StartListReportProjection = {
    eventName: event?.name || "",
    rows: [],
    sessionName: session?.name || "",
    warnings: [],
  };
  if (!event || !session) return empty;
  const warnings: string[] = [];
  const categories: EventCatalogCategory[] = catalog.categories.filter(
    (category: EventCatalogCategory): boolean =>
      category.eventId === eventId && !category.deleted,
  );
  const entrants: EventCatalogEntrant[] = catalog.entrants.filter(
    (entrant: EventCatalogEntrant): boolean =>
      entrant.eventId === eventId && !entrant.deleted && !entrant.isPlaceholder,
  );
  const sessionCategoryIds: Set<string> = getSessionAssignedCategoryIds(
    categories,
    session.id,
    [session],
  );
  const groups: Map<string, StartGroup> = buildGroups(session, categories);
  session.categoryIds
    .filter(
      (id: string): boolean =>
        !categories.some(
          (category: EventCatalogCategory): boolean => category.id === id,
        ),
    )
    .forEach((id: string): number =>
      warnings.push(`Session references missing category ${id}.`),
    );
  const rows: StartListReportRow[] = [];
  const representedEntrants: Set<string> = new Set();
  const addRow = (
    entrant: EventCatalogEntrant,
    entry?: EventCatalogEntry,
  ): void => {
    const categoryIds: string[] = entry
      ? entry.categoryId
        ? [entry.categoryId]
        : []
      : [...getEntrantCategoryIds(entrant, entrants)];
    const explicitSessions: SessionId[] | undefined =
      entry?.sessionIds || entrant.sessionIds;
    if (
      explicitSessions?.length
        ? !explicitSessions.includes(session.id)
        : !categoryIds.some((id: string): boolean => sessionCategoryIds.has(id))
    )
      return;
    const validCategoryIds: string[] = categoryIds.filter(
      (id: string): boolean =>
        categories.some(
          (category: EventCatalogCategory): boolean => category.id === id,
        ),
    );
    if (validCategoryIds.length !== categoryIds.length)
      warnings.push(
        `Missing category reference for ${entry?.id || entrant.id}.`,
      );
    const group: StartGroup = validCategoryIds
      .map((id: string): StartGroup | undefined => groups.get(id))
      .find(Boolean) || {
      id: "unassigned",
      label: "Unassigned",
      order: Number.MAX_SAFE_INTEGER,
    };
    const identifiers: ParticipantIdentifier[] =
      entry?.identifiers || entrant.identifiers || [];
    const raceNumber: string =
      entry?.raceNumber?.trim() ||
      getIdentifierValues(identifiers, "racePlate").join(" / ");
    const identifierSummary: string = ["racePlate", "txNo", "chipCode"]
      .flatMap((key: string): string[] =>
        getIdentifierValues(identifiers, key).map(
          (value: string): string =>
            `${key === "txNo" ? "Transmitter" : key === "chipCode" ? "Chip" : "Plate"}: ${value}`,
        ),
      )
      .join("; ");
    const position: number | undefined =
      entry?.startOrder ?? entrant.startOrder;
    const gridPosition: number | undefined =
      typeof position === "number" && Number.isInteger(position) && position > 0
        ? position
        : undefined;
    const parent: EventCatalogEntrant | undefined = entrants.find(
      (candidate: EventCatalogEntrant): boolean =>
        candidate.id === entrant.teamEntrantId,
    );
    if (entrant.teamEntrantId && !parent)
      warnings.push(`Missing team reference for ${entrant.id}.`);
    const names: string[] = participantNames(
      entrant,
      entrants,
      entry?.participantIds || entrant.memberParticipantIds,
    );
    const teamName: string =
      parent?.name || (entrant.entrantType === "team" ? entrant.name : "");
    const completeness: string[] = [];
    if (validCategoryIds.length === 0) completeness.push("Missing category");
    if (entrant.teamEntrantId && !parent) completeness.push("Missing team");
    if (!raceNumber && !identifierSummary)
      completeness.push("Missing identifier");
    if (gridPosition === undefined)
      completeness.push("Unassigned start position");
    rows.push({
      categoryIds: validCategoryIds,
      categoryName:
        categories
          .filter((category: EventCatalogCategory): boolean =>
            validCategoryIds.includes(category.id),
          )
          .map((category: EventCatalogCategory): string => category.name)
          .join(" / ") || "Unassigned",
      completeness,
      duplicatePosition: false,
      entrantId: entrant.id,
      entrantName: entry?.name || entrant.name,
      entryId: entry?.id,
      gridPosition,
      identifiers: identifierSummary,
      participantNames: names,
      raceNumber,
      sessionId: session.id,
      sessionName: session.name,
      startGroup: group.label,
      startGroupId: group.id,
      startGroupOrder: group.order,
      teamName,
      vehicle: entry?.vehicle || entrant.vehicle || "",
    });
  };
  (catalog.entries || [])
    .filter(
      (entry: EventCatalogEntry): boolean =>
        entry.eventId === eventId && !entry.isPlaceholder,
    )
    .forEach((entry: EventCatalogEntry): void => {
      const entrant: EventCatalogEntrant | undefined = entrants.find(
        (candidate: EventCatalogEntrant): boolean =>
          candidate.id === entry.entrantId,
      );
      if (!entrant) {
        warnings.push(`Entry ${entry.id} references a missing entrant.`);
        return;
      }
      representedEntrants.add(entrant.id);
      entry.participantIds.forEach((id: string): void => {
        const rider: EventCatalogEntrant | undefined = entrants.find(
          (candidate: EventCatalogEntrant): boolean =>
            candidate.entrantType === "rider" &&
            (candidate.id === id ||
              candidate.memberParticipantIds.includes(id)),
        );
        if (rider) representedEntrants.add(rider.id);
        else if (
          !entrant.teamMembers?.some(
            (member): boolean => member.participantId === id,
          )
        )
          warnings.push(
            `Entry ${entry.id} references missing participant ${id}.`,
          );
      });
      addRow(entrant, entry);
    });
  entrants
    .filter(
      (entrant: EventCatalogEntrant): boolean =>
        !representedEntrants.has(entrant.id) &&
        !entrant.isEntryOwner &&
        !(
          entrant.entrantType === "rider" &&
          entrant.teamEntrantId &&
          entrants.some(
            (candidate: EventCatalogEntrant): boolean =>
              candidate.id === entrant.teamEntrantId,
          )
        ),
    )
    .forEach((entrant: EventCatalogEntrant): void => addRow(entrant));
  rows.forEach((row: StartListReportRow): void => {
    if (
      row.gridPosition !== undefined &&
      rows.some(
        (other: StartListReportRow): boolean =>
          other !== row &&
          other.startGroupId === row.startGroupId &&
          other.gridPosition === row.gridPosition,
      )
    ) {
      row.duplicatePosition = true;
      row.completeness.push("Duplicate start position");
    }
  });
  const compareNumbers = (left: string, right: string): number =>
    left.localeCompare(right, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  rows.sort(
    (first: StartListReportRow, second: StartListReportRow): number =>
      first.startGroupOrder - second.startGroupOrder ||
      (first.gridPosition ?? Number.MAX_SAFE_INTEGER) -
        (second.gridPosition ?? Number.MAX_SAFE_INTEGER) ||
      compareNumbers(first.raceNumber, second.raceNumber) ||
      first.entrantName.localeCompare(second.entrantName) ||
      (first.entryId || first.entrantId).localeCompare(
        second.entryId || second.entrantId,
      ),
  );
  return { eventName: event.name, rows, sessionName: session.name, warnings };
};
