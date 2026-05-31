import type { EventParticipant, EventParticipantId } from "../model/eventparticipant.js";
import { entrantHasIdentifier, entrantHasPlate } from "./participantMatch.js";

import type { PlateNumberType } from "../model/types.js";

export const findEntrantByPlateNumber = (
  entrants: Map<EventParticipantId, EventParticipant>,
  plateNumber: PlateNumberType,
  lookupTime?: Date | undefined
): EventParticipant | undefined => entrants.values().find((entrant) => entrantHasPlate(plateNumber, entrant, lookupTime));

export const findEntrantByTransponder = (
  entrants: Map<EventParticipantId, EventParticipant>,
  transponder: string | number,
  lookupTime?: Date | undefined
): EventParticipant | undefined => entrants.values().find((entrant) => entrantHasIdentifier(transponder, entrant, 'txNo', lookupTime));

export const findEntrantByChipCode = (
  entrants: Map<EventParticipantId, EventParticipant>,
  chipCode: number,
  lookupTime?: Date | undefined
): EventParticipant | undefined => findEntrantByTransponder(entrants, chipCode, lookupTime);
