import type { ApicalParticipantViewModel } from "../model/apical.js";
import { EventId } from "../model/raceevent.js";
import type { EventTeamId } from "../model/eventteam.js";
import { v5 as uuidv5 } from "uuid";

export const isEntrantTeam = (entrant: ApicalParticipantViewModel): boolean => {
  if (entrant.IsTeamEntrant) {
    return true;
  }

  return entrant.RaceNumbers.split(',').map((raceNumber) => raceNumber.trim()).filter((raceNumber) => raceNumber.length > 0).length > 1;
};

export const generateTeamId = (eventId: EventId, teamName: string): EventTeamId => {
  if (!teamName) {
    throw new Error("Team name must not be empty.");
  }
  return uuidv5(teamName, eventId);
};
