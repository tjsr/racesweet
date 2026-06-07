import {
  type ApicalCategoryResult,
  type ApicalLapByCategory,
  type ApicalLapByCategoryViewModel,
  type ApicalParticipantViewModel
} from "../model/apical.ts";
import type { EventCategory, EventCategoryId } from "../model/eventcategory.js";
import type { uuid } from "../model/types.js";
import type { EventParticipant, EventParticipantId } from "../model/eventparticipant.js";
import { RECORD_TX_CROSSING, type TimeRecord } from "../model/timerecord.js";
import { assignParticipantNumber, assignTransponder, createParticipantIdFromEventAndCategory } from "../controllers/participant.js";
import { generateTeamId, isEntrantTeam } from "../controllers/eventteam.js";
import type { ChipCrossingData } from "../model/chipcrossing.js";
import type { EventTeam } from "../model/eventteam.js";
import type { RaceState } from "../model/racestate.js";
import { addToTime } from "../app/utils/timeutils.js";
import { createEventCategoryIdFromCategoryCode } from "../controllers/category.js";
import { durationStringToMilliseconds } from "./genericTimeParser.js";
import { inferTransponderFromRaceNumber } from "../controllers/transponder.js";
import { split } from "../utils.js";
import { v5 as uuidv5, validate as validateUuid } from 'uuid';
import { EventId } from "../model/raceevent.ts";

export const createChipCrossingRecord = (
  lap: ApicalLapByCategoryViewModel,
  eventStartTime: Date,
  txNo: number,
  eventId: EventId
): Pick<ChipCrossingData, 'id' | 'recordType' | 'chipCode' | 'time' | 'eventId'> => {
  if (!validateUuid(eventId)) {
    throw new Error(`Invalid eventId provided: ${eventId}`);
  }
  if (!txNo) {
    throw new Error('Cannot create chip crossing record without transponder number');
  }
  if (!eventStartTime) {
    throw new Error(`Event start time is undefined, cannot create crossing record for lap ${lap.Id}`);
  }
  const lapMs = durationStringToMilliseconds(lap.LapTimeSpan);
  const calculatedRecordTime = addToTime(eventStartTime, lapMs);

  const timeRecord: Pick<ChipCrossingData, 'id' | 'recordType' | 'chipCode' | 'time' | 'eventId'> = {
    chipCode: txNo,
    eventId: eventId,
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
  if (!validateUuid(eventId)) {
    throw new Error(`Invalid eventId provided: ${eventId}`);
  }
  if (!validateUuid(categoryId)) {
    throw new Error(`Invalid categoryId provided: ${categoryId}`);
  }
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
  if (!validateUuid(participantId)) {
    throw new Error(`Invalid participantId provided: ${participantId}`);
  }
  if (!validateUuid(categoryId)) {
    throw new Error(`Invalid categoryId provided: ${categoryId}`);
  }
  const nameParts = split(lap.FullName, ' ', 1);
  if (nameParts.length < 2) {
    throw new Error(`Participant name "${lap.FullName}" does not contain both first and last name.`);
  }
  const ep: Partial<EventParticipant> = {
    categoryId: categoryId,
    entrantId: participantId,
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
  if (!validateUuid(eventId)) {
    throw new Error(`Invalid eventId provided: ${eventId}`);
  }
  if (!validateUuid(categoryId)) {
    throw new Error(`Invalid categoryId provided: ${categoryId}`);
  }
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
): Pick<ChipCrossingData, 'participantId' | 'eventId'> & ReturnType<typeof createChipCrossingRecord> => {
  if (!validateUuid(eventId)) {
    throw new Error(`Invalid eventId provided: ${eventId}`);
  }
  if (!validateUuid(categoryId)) {
    throw new Error(`Invalid categoryId provided: ${categoryId}`);
  }
  const epId: EventParticipantId = createParticipantIdFromEventAndCategory(eventId, categoryId, lap.RaceNumber);
  const txNo = inferTransponderFromRaceNumber(lap.RaceNumber, inferTransponderNumberRange);
  const crossing: Pick<ChipCrossingData, 'participantId' | 'eventId'> & ReturnType<typeof createChipCrossingRecord> = createChipCrossingRecord(lap, eventStartTime, txNo, eventId);
  crossing.participantId = epId;

  return crossing;
};

export const getChipCrossingsFromLapCategoryViewModels = (
  lapCategoryViewModels: ApicalLapByCategoryViewModel[],
  eventId: EventId,
  categoryId: EventCategoryId,
  eventStartTime: Date,
  inferTransponderNumberRange: number
): ReturnType<typeof convertLapCategoryViewModelToChipCrossing>[] => {
    if (!validateUuid(eventId)) {
    throw new Error(`Invalid eventId provided: ${eventId}`);
  }
  if (!validateUuid(categoryId)) {
    throw new Error(`Invalid categoryId provided: ${categoryId}`);
  }
  return lapCategoryViewModels.map(
  (lap: ApicalLapByCategoryViewModel) => convertLapCategoryViewModelToChipCrossing(
    lap,
    eventId,
    categoryId,
    eventStartTime,
    inferTransponderNumberRange
  ));
};

export const convertLapCategoryViewModelsForEntrant = (
  lapCategoryViewModels: ApicalLapByCategoryViewModel[],
  categoryId: EventCategoryId,
  eventId: EventId,
  eventStartTime: Date,
  inferTransponderNumberRange?: number
): { participants: EventParticipant[]; records?: Partial<ChipCrossingData>[]; } => {
  if (!validateUuid(eventId)) {
    throw new Error(`Invalid eventId provided: ${eventId}`);
  }
  if (!validateUuid(categoryId)) {
    throw new Error(`Invalid categoryId provided: ${categoryId}`);
  }
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
  if (!validateUuid(eventId)) {
    throw new Error(`Invalid eventId provided: ${eventId}`);
  }
  if (!validateUuid(categoryId)) {
    throw new Error(`Invalid categoryId provided: ${categoryId}`);
  }
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
    if (team && !team.members.includes(participant.id.toString())) {
      team.members.push(participant.id.toString());
      participant.entrantId = team.id;
    }
  });

  return {
    participants: results.participants,
    records: results.records,
    team,
  };
};

export const convertDataToRaceState = (
  eventId: EventId,
  eventStartTime: Date | undefined,
  data: ApicalLapByCategory,
  inferTransponderNumberRange?: number
): Partial<RaceState> => {
  if (validateUuid(eventId) === false) {
    throw new Error(`Invalid eventId provided: ${eventId}`);
  }
  const categoriesMap: Map<EventCategoryId, EventCategory> = new Map<EventCategoryId, EventCategory>();

  const records: TimeRecord[] = [];
  const participants: EventParticipant[] = [];
  const teams: EventTeam[] = [];
  assert(data != null);
  assert(eventId);
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

