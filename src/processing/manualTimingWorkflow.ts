import {
  dateStringInTimeZone,
  tableTimeStringInTimeZone,
} from "../app/utils/timeutils.js";
import {
  type EventCatalogEntrant,
  type EventCatalogState,
  getEntrantAssignedSessionIds,
  getEntrantsForEvent,
} from "../catalog/eventCatalog.js";
import type { ManualCrossingIdentifierKind } from "../model/manualCrossing.js";

export interface ManualTimingIdentity {
  entrantId: string;
  label: string;
  participantId?: string;
}

export const getManualTimingIdentities = (
  catalog: EventCatalogState,
  eventId: string,
  sessionId: string,
): ManualTimingIdentity[] => {
  const entrants: EventCatalogEntrant[] = getEntrantsForEvent(catalog, eventId);
  const eligible: EventCatalogEntrant[] = entrants.filter(
    (entrant: EventCatalogEntrant): boolean =>
      !entrant.deleted &&
      !entrant.isPlaceholder &&
      (entrant.sessionIds?.includes(sessionId) === true ||
        getEntrantAssignedSessionIds(
          entrant,
          catalog.categories.filter(
            (category): boolean => category.eventId === eventId,
          ),
          catalog.sessions.filter(
            (session): boolean => session.eventId === eventId,
          ),
          entrants,
        ).has(sessionId)),
  );
  return eligible.flatMap(
    (entrant: EventCatalogEntrant): ManualTimingIdentity[] => {
      if (
        entrant.entrantType === "rider" ||
        entrant.memberParticipantIds.length === 0
      )
        return [
          {
            entrantId: entrant.id,
            label: entrant.name,
            participantId:
              entrant.memberParticipantIds.length === 1
                ? entrant.memberParticipantIds[0]
                : undefined,
          },
        ];
      return (entrant.teamMembers || [])
        .filter(
          (member): boolean =>
            !eligible.some(
              (rider: EventCatalogEntrant): boolean =>
                rider.entrantType === "rider" &&
                rider.memberParticipantIds.includes(member.participantId),
            ),
        )
        .map((member): ManualTimingIdentity => ({
          entrantId: entrant.id,
          label: `${member.firstName} ${member.lastName} / ${entrant.name}`,
          participantId: member.participantId,
        }));
    },
  );
};

export const resolveManualTimingIdentifier = (
  catalog: EventCatalogState,
  eventId: string,
  sessionId: string,
  kind: ManualCrossingIdentifierKind,
  value: string,
): ManualTimingIdentity[] => {
  const normalized: string = value.trim().toLocaleLowerCase();
  if (!normalized) return [];
  return getManualTimingIdentities(catalog, eventId, sessionId).filter(
    (identity: ManualTimingIdentity): boolean => {
      const entrant: EventCatalogEntrant | undefined = catalog.entrants.find(
        (candidate): boolean => candidate.id === identity.entrantId,
      );
      if (!entrant) return false;
      if (kind === "entrant" && entrant.id.toLocaleLowerCase() === normalized)
        return true;
      return (entrant.identifiers || []).some((identifier): boolean => {
        const values: {
          racePlate?: string;
          txNo?: string | number;
          chipCode?: string | number;
        } = identifier as typeof identifier & {
          racePlate?: string;
          txNo?: string | number;
          chipCode?: string | number;
        };
        const match: string | number | undefined =
          kind === "plate" || kind === "entrant"
            ? values.racePlate
            : (values.txNo ?? values.chipCode);
        return match?.toString().trim().toLocaleLowerCase() === normalized;
      });
    },
  );
};

/** Enumerates matching instants, including both sides of a daylight-saving fold. */
export const getManualTimingInstants = (
  date: string,
  time: string,
  timeZone: string,
): string[] => {
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(date) ||
    !/^\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/u.test(time)
  )
    return [];
  const parts: string[] = time.split(":");
  const normalizedTime: string = `${parts[0]}:${parts[1]}:${(parts[2] || "00").split(".")[0]}.${((parts[2] || "").split(".")[1] || "0").padEnd(3, "0")}`;
  const utcGuess: number = Date.parse(`${date}T${normalizedTime}Z`);
  if (!Number.isFinite(utcGuess)) return [];
  const matches: Set<string> = new Set();
  const offsets: Set<number> = new Set();
  // Sample both sides of the transition; IANA offsets include non-hour changes.
  for (let sampleHours: number = -48; sampleHours <= 48; sampleHours += 6) {
    const sample: Date = new Date(utcGuess + sampleHours * 3_600_000);
    const local: number = Date.parse(
      `${dateStringInTimeZone(sample, timeZone)}T${tableTimeStringInTimeZone(sample, timeZone)}Z`,
    );
    offsets.add(sample.getTime() - local);
  }
  for (const offset of offsets) {
    const instant: Date = new Date(utcGuess + offset);
    if (
      dateStringInTimeZone(instant, timeZone) === date &&
      tableTimeStringInTimeZone(instant, timeZone) === normalizedTime
    ) {
      matches.add(instant.toISOString());
    }
  }
  return [...matches].sort();
};

const spokenDigits: Record<string, string> = {
  eight: "8",
  five: "5",
  four: "4",
  nine: "9",
  oh: "0",
  one: "1",
  seven: "7",
  six: "6",
  three: "3",
  two: "2",
  zero: "0",
};
const spokenNumbers: Record<string, number> = {
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  ten: 10,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
export const parseSpokenTimingIdentifier = (transcript: string): string => {
  const correction: string =
    transcript
      .toLocaleLowerCase()
      .split(/\b(?:correction|actually|no)\b/u)
      .at(-1)
      ?.trim() || "";
  const words: string[] = correction.replace(/[-,]/gu, " ").split(/\s+/u);
  if (
    words.some(
      (word: string): boolean =>
        word in spokenNumbers || word === "hundred" || word === "thousand",
    ) &&
    words.every(
      (word: string): boolean =>
        word in spokenNumbers ||
        word in spokenDigits ||
        ["and", "hundred", "thousand"].includes(word),
    )
  ) {
    let total: number = 0;
    let group: number = 0;
    words.forEach((word: string): void => {
      if (word === "hundred") group = (group || 1) * 100;
      else if (word === "thousand") {
        total += (group || 1) * 1000;
        group = 0;
      } else if (word !== "and")
        group += spokenNumbers[word] ?? Number(spokenDigits[word]);
    });
    return (total + group).toString();
  }
  const result: string[] = [];
  words.forEach((word: string, index: number): void => {
    if (word === "double" || word === "triple") return;
    const value: string = spokenDigits[word] || word;
    const count: number =
      words[index - 1] === "double" ? 2 : words[index - 1] === "triple" ? 3 : 1;
    result.push(value.repeat(count));
  });
  return result
    .join("")
    .replace(/[^a-z0-9]/gu, "")
    .toUpperCase();
};
