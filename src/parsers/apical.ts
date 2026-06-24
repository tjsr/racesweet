import assert from "node:assert/strict";
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
import { addToTime, dateAtStartOfDayInTimeZone } from "../app/utils/timeutils.js";
import { createEventCategoryIdFromCategoryCode } from "../controllers/category.js";
import { normalizeCategoryResultExclusion } from "../controllers/category.js";
import { durationStringToMilliseconds, excelTimeToMilliseconds } from "./genericTimeParser.js";
import { inferTransponderFromRaceNumber } from "../controllers/transponder.js";
import { split } from "../utils.js";
import { v5 as uuidv5, validate as validateUuid } from 'uuid';
import { EventId } from "../model/raceevent.ts";
import { TimeParseError } from "./date/errors.ts";

const hasLapTimeValue = (value: string | number | null | undefined): value is string | number => {
  return typeof value === 'number' || (typeof value === 'string' && value.trim().length > 0);
};

export const apicalTimeToMilliseconds = (timeValue: string | number): number => {
  return typeof timeValue === 'number'
    ? excelTimeToMilliseconds(timeValue)
    : durationStringToMilliseconds(timeValue);
};

const getTimeOfDayValue = (lap: ApicalLapByCategoryViewModel): string | number => {
  if (hasLapTimeValue(lap.TimeOfDay)) {
    return lap.TimeOfDay;
  }

  throw new TimeParseError(`Missing Apical TimeOfDay for lap ${lap.Id}`, String(lap.TimeOfDay));
};

export const apicalTimeOfDayToDate = (sessionDate: Date, timeOfDay: string | number, timeZone?: string): Date => {
  const sessionMidnight = dateAtStartOfDayInTimeZone(sessionDate, timeZone);
  return addToTime(sessionMidnight, apicalTimeToMilliseconds(timeOfDay));
};

export const createChipCrossingRecord = (
  lap: ApicalLapByCategoryViewModel,
  eventStartTime: Date,
  txNo: number,
  eventId: EventId,
  timeZone?: string
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
  try {
    const calculatedRecordTime = hasLapTimeValue(lap.TimeOfDay)
      ? apicalTimeOfDayToDate(eventStartTime, getTimeOfDayValue(lap), timeZone)
      : addToTime(eventStartTime, apicalTimeToMilliseconds(lap.CumulativeLapTimeSpan));

    const timeRecord: Pick<ChipCrossingData, 'id' | 'recordType' | 'chipCode' | 'time' | 'eventId'> = {
      chipCode: txNo,
      eventId: eventId,
      id: lap.Id.toString(),
      recordType: RECORD_TX_CROSSING,
      time: calculatedRecordTime,
    };
    return timeRecord;
  } catch (error: unknown) {
    if (error instanceof TimeParseError) {
      console.error(`Error parsing TimeOfDay for lap ${lap.Id} with value "${lap.TimeOfDay}":`, error);
    }
    throw error;
  }
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
  inferTransponderNumberRange: number,
  timeZone?: string
): Pick<ChipCrossingData, 'participantId' | 'eventId'> & ReturnType<typeof createChipCrossingRecord> => {
  if (!validateUuid(eventId)) {
    throw new Error(`Invalid eventId provided: ${eventId}`);
  }
  if (!validateUuid(categoryId)) {
    throw new Error(`Invalid categoryId provided: ${categoryId}`);
  }
  const epId: EventParticipantId = createParticipantIdFromEventAndCategory(eventId, categoryId, lap.RaceNumber);
  const txNo = inferTransponderFromRaceNumber(lap.RaceNumber, inferTransponderNumberRange);
  const crossing: Pick<ChipCrossingData, 'participantId' | 'eventId'> & ReturnType<typeof createChipCrossingRecord> = createChipCrossingRecord(lap, eventStartTime, txNo, eventId, timeZone);
  crossing.participantId = epId;

  return crossing;
};

export const getChipCrossingsFromLapCategoryViewModels = (
  lapCategoryViewModels: ApicalLapByCategoryViewModel[],
  eventId: EventId,
  categoryId: EventCategoryId,
  eventStartTime: Date,
  inferTransponderNumberRange: number,
  timeZone?: string
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
    inferTransponderNumberRange,
    timeZone
  ));
};

export const convertLapCategoryViewModelsForEntrant = (
  lapCategoryViewModels: ApicalLapByCategoryViewModel[],
  categoryId: EventCategoryId,
  eventId: EventId,
  eventStartTime: Date,
  inferTransponderNumberRange?: number,
  timeZone?: string
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
      inferTransponderNumberRange,
      timeZone
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
  inferTransponderNumberRange?: number,
  timeZone?: string
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
    inferTransponderNumberRange,
    timeZone
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
  inferTransponderNumberRange?: number,
  timeZone?: string
): Partial<RaceState> => {
  if (!validateUuid(eventId)) {
    console.error('Invalid eventId provided:', eventId);
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
        excludeFromResults: normalizeCategoryResultExclusion({
          id: categoryId,
          name: apiCategory.CategoryName,
        } as EventCategory).excludeFromResults,
        id: categoryId,
        name: apiCategory.CategoryName,
      } as EventCategory);
    }

    const entrantData = apiCategory.ParticipantViewModels.map((entrant: ApicalParticipantViewModel) => apiParticipantEntrantToEntrantData(
      entrant, eventId, categoryId, eventStartTime, inferTransponderNumberRange, timeZone
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
    eventStartTime,
    participants,
    records,
    teams,
  } as RaceState;
};

