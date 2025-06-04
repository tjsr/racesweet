import type { EventParticipant, EventParticipantId } from "../model/eventparticipant.ts";
import { assignParticipantNumber, createEntrant, createEntrantForUnmatchedChipCode } from "./participant.ts";
import { findEntrantByChipCode, findEntrantByPlateNumber } from "./participantSearch.ts";

import type { ChipCrossingData } from "../model/chipcrossing.ts";
import type { EventCategory } from "../model/eventcategory.ts";
import type { PlateCrossingData } from "../model/platecrossing.ts";
import type { TimeRecord } from "../model/timerecord.ts";
import { validateCategoriesToCreate } from '../validators/categories.ts';

export const assignEntrantToPlateCrossing = (
  entrants: Map<EventParticipantId, EventParticipant>,
  crossing: PlateCrossingData,
  createUnknownEntrants: boolean = false,
  categoryList: EventCategory[] | undefined = undefined
): void => {
  validateCategoriesToCreate(categoryList, createUnknownEntrants);
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
};

export const assignEntrantToTime = (
  entrants: Map<EventParticipantId, EventParticipant>,
  record: TimeRecord,
  createUnknownEntrants: boolean = false,
  categoryList: EventCategory[] | undefined = undefined
): void => {
  if (Object.prototype.hasOwnProperty.call(record, 'chipCode')) {
    const crossing = record as ChipCrossingData;
    assignEntrantToChipCrossing(entrants, crossing, createUnknownEntrants, categoryList);
  } else if (Object.prototype.hasOwnProperty.call(record, 'plateNumber')) {
    const crossing = record as PlateCrossingData;
    const plateNumber = crossing.plateNumber;
    if (plateNumber === undefined) {
      console.error(`Crossing ${crossing.plateNumber} has no plate number`);
      return;
    }
    assignEntrantToPlateCrossing(entrants, crossing, createUnknownEntrants);
  } else {
    console.error(assignEntrantToTime.name, `Crossing ${record.dataLine} has no chip code or plate number - not assigne`);
  }
};

export const assignEntrantToChipCrossing = (
  entrants: Map<EventParticipantId, EventParticipant>,
  crossing: ChipCrossingData,
  createUnknownEntrants: boolean = false,
  categoryList: EventCategory[] | undefined
): void => {
  validateCategoriesToCreate(categoryList, createUnknownEntrants);
  if (crossing.time === undefined) {
    console.error(`Crossing for chip ${crossing.chipCode} has no time`);
    return;
  }
  let entrant = findEntrantByChipCode(entrants, crossing.chipCode);
  if (!entrant && createUnknownEntrants) {
    assert(categoryList !== undefined, 'Categories list must be passed when creating unnown entrants to create unknown entrants');
    entrant = createEntrantForUnmatchedChipCode(categoryList!, crossing.chipCode);
    entrants.set(entrant.id, entrant);
  }

  crossing.participantId = entrant?.id;
};

