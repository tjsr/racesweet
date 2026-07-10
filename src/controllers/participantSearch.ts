import type { EventCategoryId } from "../model/eventcategory.js";
import type { EventParticipant, EventParticipantId } from "../model/eventparticipant.js";
import { entrantHasIdentifier, entrantHasPlate } from "./participantMatch.js";

import type { PlateNumberType } from "../model/types.js";

const toPreferredCategoryIdSet = (
  preferredCategoryIds: Set<EventCategoryId> | EventCategoryId[] | undefined
): Set<string> | undefined => {
  if (!preferredCategoryIds) {
    return undefined;
  }

  if (Array.isArray(preferredCategoryIds)) {
    return preferredCategoryIds.length > 0
      ? new Set(preferredCategoryIds.map((categoryId) => categoryId.toString()))
      : undefined;
  }

  if (preferredCategoryIds.size === 0) {
    return undefined;
  }

  return new Set(Array.from(preferredCategoryIds).map((categoryId) => categoryId.toString()));
};

const selectMatchedEntrant = (
  entrants: Map<EventParticipantId, EventParticipant>,
  matcher: (entrant: EventParticipant) => boolean,
  preferredCategoryIds: Set<EventCategoryId> | EventCategoryId[] | undefined
): EventParticipant | undefined => {
  const matchedEntrants = Array.from(entrants.values()).filter(matcher);
  if (matchedEntrants.length <= 1) {
    return matchedEntrants[0];
  }

  const preferredCategoryIdSet = toPreferredCategoryIdSet(preferredCategoryIds);
  if (!preferredCategoryIdSet || preferredCategoryIdSet.size === 0) {
    return matchedEntrants[0];
  }

  const preferredEntrants = matchedEntrants.filter((entrant) => preferredCategoryIdSet.has(entrant.categoryId.toString()));
  return preferredEntrants[0] || matchedEntrants[0];
};

export const findEntrantByPlateNumber = (
  entrants: Map<EventParticipantId, EventParticipant>,
  plateNumber: PlateNumberType,
  lookupTime?: Date | undefined,
  preferredCategoryIds?: Set<EventCategoryId> | EventCategoryId[] | undefined
): EventParticipant | undefined => selectMatchedEntrant(
  entrants,
  (entrant) => entrantHasPlate(plateNumber, entrant, lookupTime),
  preferredCategoryIds
);

export const findEntrantByTransponder = (
  entrants: Map<EventParticipantId, EventParticipant>,
  transponder: string | number,
  lookupTime?: Date | undefined,
  preferredCategoryIds?: Set<EventCategoryId> | EventCategoryId[] | undefined
): EventParticipant | undefined => selectMatchedEntrant(
  entrants,
  (entrant) => entrantHasIdentifier(transponder, entrant, 'txNo', lookupTime),
  preferredCategoryIds
);

export const findEntrantByChipCode = (
  entrants: Map<EventParticipantId, EventParticipant>,
  chipCode: number,
  lookupTime?: Date | undefined,
  preferredCategoryIds?: Set<EventCategoryId> | EventCategoryId[] | undefined
): EventParticipant | undefined => findEntrantByTransponder(entrants, chipCode, lookupTime, preferredCategoryIds);
