import type { ApicalParticipantViewModel } from "../model/apical.ts";
import type { EventId } from "../model/types.ts";
import type { EventTeamId } from "../model/eventteam.ts";
import { v5 as uuidv5 } from "uuid";

export const isEntrantTeam = (entrant: ApicalParticipantViewModel): boolean => {
  return entrant.RaceNumbers.split(',').length > 1;
};
export const generateTeamId = (eventId: EventId, teamName: string): EventTeamId => {
  if (!teamName) {
    throw new Error("Team name must not be empty.");
  }
  return uuidv5(teamName, eventId);
};
