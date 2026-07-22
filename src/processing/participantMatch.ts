import type { EventParticipant, EventParticipantId } from "../model/eventparticipant.js";
import { getParticipantIdentifiers, validateIdentifierType } from "./participant.js";

import { type ChipCrossingData } from "../model/chipcrossing.js";
import type { PlateCrossingData } from "../model/platecrossing.js";
import type { ParticipantPassingRecord } from "../model/timerecord.js";
import type { PlateNumberType } from "../model/types.js";
import { asParsedChipCrossing } from "./chipCrossing.js";
import { isPlateCrossing } from "./plateCrossing.js";

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
): boolean => matchParticipantToIdentifier(entrant, plateNumber, 'racePlate', lookupTime) != null;

export const entrantHasTransponder = (
  transponder: string | number,
  entrant: EventParticipant,
  lookupTime: Date = new Date()
): boolean => matchParticipantToIdentifier(entrant, transponder, 'txNo', lookupTime) != null;

export const entrantHasAnyTx = (
  participant: EventParticipant,
  lookupTime: Date = new Date()
): boolean => getParticipantIdentifiers(participant, 'txNo', lookupTime).length > 0;

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
    const normalizedIdentifierValue = identifierValue.toString().trim();
    if (identifiers.some((value) => value.toString().trim() === normalizedIdentifierValue)) {
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
  const platePassing = passing as PlateCrossingData;
  if (isPlateCrossing(platePassing) && entrantHasPlate(platePassing.plateNumber, participant, passing.time)) {
    return true;
  }

  return passing.participantId === participant.id;
};
