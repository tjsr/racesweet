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
import { assignParticipantNumber, assignTransponder, createParticipantIdFromEventAndCategory } from "../processing/participant.js";
import { generateTeamId, isEntrantTeam } from "../processing/eventteam.js";
import type { ChipCrossingData } from "../model/chipcrossing.js";
import type { EventTeam } from "../model/eventteam.js";
import type { GreenFlagRecord } from "../model/flag.js";
import type { RaceState } from "../model/racestate.js";
import { addToTime, dateAtStartOfDayInTimeZone } from "../app/utils/timeutils.js";
import { createEventCategoryIdFromCategoryCode } from "../processing/category.js";
import { createGreenFlagEvent } from "../processing/flag.js";
import { createTimeRecordId } from "../model/ids.js";
import { normalizeCategoryResultExclusion } from "../processing/category.js";
import { durationStringToMilliseconds, excelTimeToMilliseconds } from "./genericTimeParser.js";
import { inferTransponderFromRaceNumber } from "../processing/transponder.js";
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

const getCumulativeMilliseconds = (lap: ApicalLapByCategoryViewModel): number => {
  if (hasLapTimeValue(lap.CumulativeSeconds)) {
    return Number(lap.CumulativeSeconds) * 1000;
  }

  return apicalTimeToMilliseconds(lap.CumulativeLapTimeSpan);
};

const getCategoryStartTimeForLap = (
  lap: ApicalLapByCategoryViewModel,
  eventStartTime: Date,
  timeZone?: string
): Date => {
  const crossingTime = apicalTimeOfDayToDate(eventStartTime, getTimeOfDayValue(lap), timeZone);
  return addToTime(crossingTime, -getCumulativeMilliseconds(lap));
};

export const getCategoryStartTimeMap = (
  data: ApicalLapByCategory,
  eventId: EventId,
  eventStartTime: Date | undefined,
  timeZone?: string
): Map<EventCategoryId, Date> => {
  if (!validateUuid(eventId)) {
    throw new Error(`Invalid eventId provided: ${eventId}`);
  }

  const startTimeTotals = new Map<EventCategoryId, { count: number; totalMilliseconds: number }>();
  data.forEach((apiCategory: ApicalCategoryResult) => {
    const categoryId = createEventCategoryIdFromCategoryCode(eventId, apiCategory.CategoryName);
    apiCategory.ParticipantViewModels.forEach((entrant: ApicalParticipantViewModel) => {
      entrant.LapByCategoryViewModels.forEach((lap: ApicalLapByCategoryViewModel) => {
        if (!hasLapTimeValue(lap.TimeOfDay)) {
          return;
        }

        const startTime = getCategoryStartTimeForLap(lap, eventStartTime || new Date(), timeZone);
        const current = startTimeTotals.get(categoryId) || { count: 0, totalMilliseconds: 0 };
        startTimeTotals.set(categoryId, {
          count: current.count + 1,
          totalMilliseconds: current.totalMilliseconds + startTime.getTime(),
        });
      });
    });
  });

  return new Map(Array.from(startTimeTotals.entries()).map(([categoryId, start]) => [
    categoryId,
    new Date(start.totalMilliseconds / start.count),
  ]));
};

const createCategoryStartFlags = (
  categoryStartTimes: Map<EventCategoryId, Date>,
  eventId: EventId,
  source: uuid
): GreenFlagRecord[] => {
  const groupedStartFlags: { categoryIds: EventCategoryId[]; time: Date }[] = [];
  Array.from(categoryStartTimes.entries())
    .sort((left, right) => left[1].getTime() - right[1].getTime())
    .forEach(([categoryId, startTime]) => {
      const matchingStartFlag = groupedStartFlags.find((flag) => Math.abs(startTime.getTime() - flag.time.getTime()) <= 1000);
      if (matchingStartFlag) {
        matchingStartFlag.categoryIds.push(categoryId);
        return;
      }

      groupedStartFlags.push({
        categoryIds: [categoryId],
        time: startTime,
      });
    });

  return groupedStartFlags.map((flag) => {
    const categoryIds = [...flag.categoryIds].sort();
    return createGreenFlagEvent({
      categoryIds,
      eventId,
      flagValue: 'course',
      id: createTimeRecordId(`apical-green-flag:${eventId}:${flag.time.toISOString()}:${categoryIds.join(',')}`),
      indicatesRaceStart: true,
      source,
      time: flag.time,
    });
  });
};

const compareImportedRecords = (left: TimeRecord, right: TimeRecord): number => {
  const leftTime = left.time?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const rightTime = right.time?.getTime() ?? Number.MAX_SAFE_INTEGER;
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  const leftIsCrossing = (left.recordType & RECORD_TX_CROSSING) > 0;
  const rightIsCrossing = (right.recordType & RECORD_TX_CROSSING) > 0;
  if (leftIsCrossing !== rightIsCrossing) {
    return leftIsCrossing ? 1 : -1;
  }

  return left.id.toString().localeCompare(right.id.toString());
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

    const timeRecordSeed = [
      'apical-crossing',
      eventId,
      lap.Id,
      lap.RaceNumber,
      lap.LapNumber,
      txNo,
      calculatedRecordTime.toISOString(),
    ].join(':');
    const timeRecord: Pick<ChipCrossingData, 'id' | 'recordType' | 'chipCode' | 'time' | 'eventId'> = {
      chipCode: txNo,
      eventId: eventId,
      id: createTimeRecordId(timeRecordSeed),
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
  const teamName = entrant.TeamDisplayName || entrant.TeamNameDisplay || '';

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
  const categoryStartTimes = getCategoryStartTimeMap(data, eventId, eventStartTime, timeZone);
  records.push(...createCategoryStartFlags(categoryStartTimes, eventId, source));

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
        records.push(record as ChipCrossingData);
      });
      if (entrant.team) {
        teams.push(entrant.team);
      }

      participants.push(...entrant.participants);
    });
  });

  const categories = Array.from(categoriesMap.values());
  records.sort(compareImportedRecords);
  records.forEach((record, index) => {
    (record as TimeRecord & { sequence: number }).sequence = index + 1;
  });

  return {
    categories,
    eventStartTime,
    participants,
    records,
    teams,
  } as RaceState;
};

