import type { EventParticipant, EventParticipantId } from "../model/eventparticipant.ts";
import { assignEntrantToChipCrossing, categories, validateCategoriesToCreate } from "../printCrossings.ts";
import { assignParticipantNumber, createEntrant, findEntrantByPlateNumber } from "./participant.ts";

import type { ChipCrossingData } from "../model/chipcrossing.ts";
import type { EventCategory } from "../model/eventcategory.ts";
import type { PlateCrossingData } from "../model/platecrossing.ts";
import type { TimeEvent } from "../model/timeevent.ts";

export const assignEntrantToPlateCrossing = (
  entrants: Map<EventParticipantId, EventParticipant>,
  crossing: PlateCrossingData,
  createUnknownEntrants: boolean = false,
  categoryList: EventCategory[] | undefined = undefined
): void => {
  validateCategoriesToCreate(categories, createUnknownEntrants);
  if (crossing.time === undefined) {
    console.error(`Crossing for plate ${crossing.plateNumber} has no time`);
    return;
  }
  const entrant = findEntrantByPlateNumber(entrants, crossing.plateNumber);

  if (!entrant && createUnknownEntrants) {
    const categoryName = 'Unknown Plate';
    const createdEntrant = createEntrant(categoryList!, categoryName, false);
    assignParticipantNumber(createdEntrant as EventParticipant, crossing.plateNumber);
    entrants.set(createdEntrant.id!, createdEntrant as EventParticipant);
  }

  crossing.participantId = entrant?.id;
};export const assignEntrantToTime = (
  entrants: Map<EventParticipantId, EventParticipant>,
  evt: TimeEvent,
  createUnknownEntrants: boolean = false,
  categoryList: EventCategory[] | undefined = undefined
): void => {
  if (Object.prototype.hasOwnProperty.call(evt, 'chipCode')) {
    const crossing = evt as ChipCrossingData;
    assignEntrantToChipCrossing(entrants, crossing, createUnknownEntrants, categoryList);
  } else if (Object.prototype.hasOwnProperty.call(evt, 'plateNumber')) {
    const crossing = evt as PlateCrossingData;
    const plateNumber = crossing.plateNumber;
    if (plateNumber === undefined) {
      console.error(`Crossing ${crossing.plateNumber} has no plate number`);
      return;
    }
    assignEntrantToPlateCrossing(entrants, crossing, createUnknownEntrants);
  } else {
    console.error(`Crossing ${evt.dataLine} has no chip code or plate number - not assigne`);
  }
};

