import {
  type ApicalCategoryResult,
  type ApicalLapByCategory,
  type ApicalLapByCategoryViewModel,
  type ApicalParticipantViewModel
} from "../model/apical.ts";
import type { EventCategory, EventCategoryId } from "../model/eventcategory.ts";
import type { EventId, uuid } from "../model/types.ts";
import type { EventParticipant, EventParticipantId } from "../model/eventparticipant.ts";
import { RECORD_TX_CROSSING, type TimeRecord } from "../model/timerecord.ts";
import { assignParticipantNumber, assignTransponder, createParticipantIdFromEventAndCategory } from "../controllers/participant.ts";
import { generateTeamId, isEntrantTeam } from "../controllers/eventteam.ts";
import type { ChipCrossingData } from "../model/chipcrossing.ts";
import type { EventTeam } from "../model/eventteam.ts";
import type { RaceState } from "../model/racestate.ts";
import { addToTime } from "../app/utils/timeutils.ts";
import { createEventCategoryIdFromCategoryCode } from "../controllers/category.ts";
import { durationStringToMilliseconds } from "./genericTimeParser.ts";
import { inferTransponderFromRaceNumber } from "../controllers/transponder.ts";
import { split } from "../utils.ts";
import { v5 as uuidv5 } from 'uuid';

export const createChipCrossingRecord = (
  lap: ApicalLapByCategoryViewModel,
  eventStartTime: Date,
  txNo: number
): Pick<ChipCrossingData, 'id' | 'recordType' | 'chipCode' | 'time'> => {
  if (!txNo) {
    throw new Error('Cannot create chip crossing record without transponder number');
  }
  if (!eventStartTime) {
    throw new Error(`Event start time is undefined, cannot create crossing record for lap ${lap.Id}`);
  }
  const lapMs = durationStringToMilliseconds(lap.LapTimeSpan);
  const calculatedRecordTime = addToTime(eventStartTime, lapMs);

  const timeRecord: Pick<ChipCrossingData, 'id' | 'recordType' | 'chipCode' | 'time'> = {
    chipCode: txNo,
    id: lap.Id.toString(),
    recordType: RECORD_TX_CROSSING,
    time: calculatedRecordTime,
  };
  return timeRecord;
};

export const participantToLap = (
  eventId: EventId,
  categoryId: EventCategoryId,
  lap: ApicalLapByCategoryViewModel,
  inferTransponderNumberRange: number | undefined
): EventParticipant => {
  const epId: EventParticipantId = createParticipantIdFromEventAndCategory(eventId, categoryId, lap.RaceNumber);

  const txNo = inferTransponderNumberRange
    ? inferTransponderFromRaceNumber(lap.RaceNumber, inferTransponderNumberRange!)
    : undefined;

  return createEntrantFromLap(lap, categoryId, epId, txNo);
};

export const createEntrantFromLap = (
  lap: ApicalLapByCategoryViewModel,
  categoryId: EventCategoryId,
  participantId: EventParticipantId,
  txNo: number | undefined
): EventParticipant => {
  const nameParts = split(lap.FullName, ' ', 1);
  if (nameParts.length < 2) {
    throw new Error(`Participant name "${lap.FullName}" does not contain both first and last name.`);
  }
  const ep: Partial<EventParticipant> = {
    categoryId: categoryId,
    firstname: nameParts[0],
    id: participantId,
    surname: nameParts[1].toLocaleUpperCase(),
  };
  assignParticipantNumber(ep, lap.RaceNumber);
  if (txNo) {
    assignTransponder(ep, txNo);
  }
  return ep as EventParticipant;
};
export const getUniqueParticipantsFromLapCategoryViewModels = (
  lapCategoryViewModels: ApicalLapByCategoryViewModel[],
  eventId: EventId,
  categoryId: EventCategoryId,
  inferTransponderNumberRange?: number
): EventParticipant[] => {
  if (!lapCategoryViewModels || lapCategoryViewModels.length === 0) {
    return [];
  }

  const unique: EventParticipantId[] = [];
  const returnedParticipants: EventParticipant[] = [];
  lapCategoryViewModels.forEach(
    (lap: ApicalLapByCategoryViewModel) => {
      const participant = participantToLap(eventId, categoryId, lap, inferTransponderNumberRange);
      if (!unique.includes(participant.id)) {
        unique.push(participant.id);
        returnedParticipants.push(participant);
      }
    });

  return returnedParticipants;
};

export const convertLapCategoryViewModelToChipCrossing = (
  lap: ApicalLapByCategoryViewModel,
  eventId: EventId,
  categoryId: EventCategoryId,
  eventStartTime: Date,
  inferTransponderNumberRange: number
): Pick<ChipCrossingData, 'participantId'> & ReturnType<typeof createChipCrossingRecord> => {
  const epId: EventParticipantId = createParticipantIdFromEventAndCategory(eventId, categoryId, lap.RaceNumber);
  const txNo = inferTransponderFromRaceNumber(lap.RaceNumber, inferTransponderNumberRange);
  const crossing: Pick<ChipCrossingData, 'participantId'> & ReturnType<typeof createChipCrossingRecord> = createChipCrossingRecord(lap, eventStartTime, txNo);
  crossing.participantId = epId;

  return crossing;
};

export const getChipCrossingsFromLapCategoryViewModels = (
  lapCategoryViewModels: ApicalLapByCategoryViewModel[],
  eventId: EventId,
  categoryId: EventCategoryId,
  eventStartTime: Date,
  inferTransponderNumberRange: number
): ReturnType<typeof convertLapCategoryViewModelToChipCrossing>[] => lapCategoryViewModels.map(
  (lap: ApicalLapByCategoryViewModel) => convertLapCategoryViewModelToChipCrossing(
    lap,
    eventId,
    categoryId,
    eventStartTime,
    inferTransponderNumberRange
  ));

export const convertLapCategoryViewModelsForEntrant = (
  lapCategoryViewModels: ApicalLapByCategoryViewModel[],
  categoryId: EventCategoryId,
  eventId: EventId,
  eventStartTime: Date,
  inferTransponderNumberRange?: number
): { participants: EventParticipant[]; records?: Partial<ChipCrossingData>[]; } => {
  const participants: EventParticipant[] = getUniqueParticipantsFromLapCategoryViewModels(
    lapCategoryViewModels,
    eventId,
    categoryId,
    inferTransponderNumberRange
  );

  let records: Partial<ChipCrossingData>[] | undefined = undefined;

  if (inferTransponderNumberRange) {
    records = getChipCrossingsFromLapCategoryViewModels(
      lapCategoryViewModels,
      eventId,
      categoryId,
      eventStartTime,
      inferTransponderNumberRange
    );
  }

  return {
    participants,
    records,
  };
};

export const apiParticipantEntrantToEntrantData = (
  entrant: ApicalParticipantViewModel,
  eventId: EventId,
  categoryId: EventCategoryId,
  eventStartTime: Date | undefined,
  inferTransponderNumberRange?: number
): { team?: EventTeam; participants: EventParticipant[]; records?: Partial<ChipCrossingData>[]; } => {
  const teamName = entrant.TeamNameDisplay || '';

  let team: EventTeam | undefined;
  if (isEntrantTeam(entrant)) {
    team = {
      categoryId: categoryId,
      description: '',
      id: generateTeamId(eventId, teamName),
      members: [],
      name: teamName,
    } as EventTeam;
  }

  const results = convertLapCategoryViewModelsForEntrant(
    entrant.LapByCategoryViewModels,
    categoryId,
    eventId,
    eventStartTime || new Date(), // Default to now if no start time is provided
    inferTransponderNumberRange
  );

  results.participants.forEach((participant: EventParticipant) => {
    if (team && team.members.includes(participant.id.toString())) {
      team.members.push(participant.id.toString());
    }
  });

  return {
    participants: results.participants,
    records: results.records,
    team,
  };
};

export const convertDataToEntrantsMap = (
  eventId: EventId,
  eventStartTime: Date | undefined,
  data: ApicalLapByCategory,
  inferTransponderNumberRange?: number
): Partial<RaceState> => {
  const categoriesMap: Map<EventCategoryId, EventCategory> = new Map<EventCategoryId, EventCategory>();

  const records: TimeRecord[] = [];
  const participants: EventParticipant[] = [];
  const teams: EventTeam[] = [];
  const source: uuid = uuidv5(data.toString(), eventId);
  let sequence = 1;

  data.forEach((apiCategory: ApicalCategoryResult) => {
    let categoryId;
    try {
      categoryId = createEventCategoryIdFromCategoryCode(eventId, apiCategory.CategoryName);
    } catch (error) {
      console.error(`Error creating category:`, error, apiCategory);
      return; // Skip this category if there's an error
    }

    const category: EventCategory | undefined = categoriesMap.get(categoryId);

    if (!category) {
      categoriesMap.set(categoryId, {
        code: apiCategory.CategoryName,
        description: '',
        id: categoryId,
        name: apiCategory.CategoryName,
      } as EventCategory);
    }

    const entrantData = apiCategory.ParticipantViewModels.map((entrant: ApicalParticipantViewModel) => apiParticipantEntrantToEntrantData(
      entrant, eventId, categoryId, eventStartTime, inferTransponderNumberRange
    ));

    entrantData.forEach((entrant) => {
      entrant.records?.forEach((record: Partial<ChipCrossingData>) => {
        record.recordType = record.recordType ?? RECORD_TX_CROSSING;
        record.source = source;
        record.sequence = sequence++;
        records.push(record as ChipCrossingData);
      });
      if (entrant.team) {
        teams.push(entrant.team);
      }

      participants.push(...entrant.participants);
    });
  });

  const categories = Array.from(categoriesMap.values());

  return {
    categories,
    participants,
    records,
    teams,
  } as RaceState;
};

