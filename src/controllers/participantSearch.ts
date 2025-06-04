import type { EventParticipant, EventParticipantId } from "../model/eventparticipant.ts";
import { entrantHasIdentifier, entrantHasPlate } from "./participantMatch.ts";

import type { PlateNumberType } from "../model/types.ts";

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
