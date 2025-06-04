import type {
  tChipTimes,
  tEventRidersResults,
  tEventRidersResults_Ignoring,
  tEvents,
  tEventsCategories,
  tEventsRiders,
  tEventsTeams,
  tRiders
} from "./pmtkTableTypes.ts";

import type { EventCategory } from "./eventcategory.ts";
import type { EventParticipant } from "./eventparticipant.ts";
import type { TimeRecord } from "./timerecord.ts";

export type PMTKRiderResultTypes = tEventRidersResults | tEventRidersResults_Ignoring;

export interface PMTKLookupEventCategory extends EventCategory {
  CategoryCode: tEventsCategories['CategoryCode'];
  CategoryDesc?: tEventsCategories['CategoryDesc'];
}

export interface PMTKEventData {
  categories: tEventsCategories[];
  chipTimes: tChipTimes[];
  event: tEvents;
  participants: PMTKParticipantsQueryResult[];
  teams: tEventsTeams[];
  results: PMTKRiderResultTypes[];
}

export interface PMTKProcessedEventData {
  categories: PMTKLookupEventCategory[];
  participants: EventParticipant[];
  records: TimeRecord[];
  teams: PMTKEventData['teams'];
  // results: PMTKRiderResultTypes[];
}

export interface PMTKParticipantsQueryResult {
  ID: tEventsRiders['ID'];
  EventRaceNo: tEventsRiders['EventRaceNo'];
  TagNo: tEventsRiders['TagNo'];
  CategoryCode: tEventsRiders['CategoryCode'];
  TeamID: tEventsRiders['TeamID'];
  FirstName: tRiders['FirstName'];
  Surname: tRiders['Surname'];
}

