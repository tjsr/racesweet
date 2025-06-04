import type { EventParticipant, EventParticipantId } from "../model/eventparticipant.ts";
import { getParticipantIdentifiers, validateIdentifierType } from "./participant.ts";

import { type ChipCrossingData } from "../model/chipcrossing.ts";
import type { ParticipantPassingRecord } from "../model/timerecord.ts";
import type { PlateCrossingData } from "../model/platecrossing.ts";
import type { PlateNumberType } from "../model/types.ts";
import { asParsedChipCrossing } from "./chipCrossing.ts";
import { asUnparsedPlateCrossing } from "./plateCrossing.ts";

export const entrantHasIdentifier = (
  idenfitier: string | number | undefined,
  entrant: EventParticipant,
  identifierType: string,
  lookupTime: Date = new Date()
): boolean => {
  if (idenfitier === undefined) {
    return false;
  }
  const id = matchParticipantToIdentifier(entrant, idenfitier, identifierType, lookupTime);
  if (id !== null) {
    return true;
  }
  return false;
};

export const entrantHasPlate = (
  plateNumber: PlateNumberType,
  entrant: EventParticipant,
  lookupTime: Date = new Date()
): boolean => matchParticipantToIdentifier(entrant, plateNumber, 'plateNumber', lookupTime) != null;

export const entrantHasTransponder = (
  transponder: string | number,
  entrant: EventParticipant,
  lookupTime: Date = new Date()
): boolean => matchParticipantToIdentifier(entrant, transponder, 'txNo', lookupTime) != null;

export const matchParticipantToIdentifier = (
  participant: EventParticipant,
  identifierValue: string | number,
  identifierType: string,
  lookupTime: Date
): EventParticipantId | null => {
  validateIdentifierType(identifierType);
  const identifiers = getParticipantIdentifiers(participant, identifierType, lookupTime);
  if (identifiers.length >= 1) {
    if (identifiers.length > 1) {
      console.warn(`Participant ${participant.id} has multiple mathing ${identifierType} identifiers: ${identifiers.join(', ')}`);
    }
    if (identifiers.some((value) => value === identifierValue)) {
      return participant.id;
    }
  }
  return null;
};

export const crossingMatchesParticipantIdentifiers = (
  participant: EventParticipant,
  passing: ParticipantPassingRecord
): boolean => {
  if (passing === undefined || passing.time === undefined) {
    return false;
  }
  const chipCrossing = asParsedChipCrossing(passing as ChipCrossingData);
  if (chipCrossing && entrantHasTransponder(chipCrossing.chipCode, participant, passing.time)) {
    return true;
  }
  const manualPassing = asUnparsedPlateCrossing(passing as PlateCrossingData);
  if (manualPassing && entrantHasPlate(manualPassing.plateNumber, participant, passing.time)) {
    return true;
  }

  return passing.participantId === participant.id;
};
