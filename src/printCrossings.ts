import type { EventCategory, EventCategoryId } from "./model/eventcategory.ts";
import type { EventParticipant, EventParticipantId } from "./model/eventparticipant.ts";
import { addFlagEvent, isFlagEvent } from "./controllers/flag.ts";
import { compareByTime, filterToEventsBetween, getTimeEventIdentifier } from "./controllers/timeevent.ts";
import { createEntrantForUnmatchedChipCode, findEntrantByChipCode, getParticipantNumber, readParticipantsXlsx } from "./controllers/participant.ts";
import { elapsedTimeMilliseconds, millisecondsToTime } from "./app/utils/timeutils.ts";
import { findCategoryById, getCategoryList, loadCategoriesFromFile } from "./controllers/category.ts";

import type { ChipCrossingData } from "./model/chipcrossing.ts";
import type { EntrantLap } from "./model/lap.ts";
import type { FlagEvent } from "./model/flag.ts";
import { NoUnknownEntrantCategoryError } from "./model/eventcategory.ts";
import Table from "cli-table3";
import type { TimeEvent } from "./model/timeevent.ts";
import { assignEntrantToTime } from "./controllers/crossing.ts";
import { formatRFC3339 } from "date-fns";
import { parseFile } from "./parsers/outreach.ts";
import path from "path";

const warn = (message?: string, ...optionalParams: unknown[]): void => {
  console.warn(`Warning: ${message}`, optionalParams);
};

const testdata_dir = path.resolve(path.join('.', 'src', 'testdata'));

const dataFile = '192.168.1.119 2025-03-03.txt';
let filePath = path.join(testdata_dir, dataFile);
if (filePath.startsWith('\\')) {
  filePath = filePath.replace(/^\\/, '');
}
// const filePath = path.format({
//   base: '192.168.1.119 2025-03-03.txt',
//   dir: testdata_dir,
// });
const eventDate = new Date('2025-03-03T00:00:00Z');
console.log(filePath);
const data = await parseFile(filePath, eventDate);

const t = new Table({
  head: ['Antenna', 'Chip Code', 'Time', 'Number', 'Entrant', 'Category', 'LapNo', 'Elapsed Time', 'Lap Time'],
});

const noTimeRows = (event: TimeEvent, _idx: number, _arr: TimeEvent[]): boolean => {
  if (event.time === undefined) {
    return true;
  }
  try {
    event.time?.getTime();
  } catch (_error: unknown) {
    return true;
  }
  return false;
};

export const validateCategoriesToCreate = (
  categories: EventCategory[]|undefined,
  createUnknownEntrants: boolean
): void => {
  const len = categories?.length || 0;
  if (createUnknownEntrants && !len) {
    throw new NoUnknownEntrantCategoryError('No categories available to create unknown entrants');
  }
};

export const assignEntrantToChipCrossing = (
  entrants: Map<EventParticipantId, EventParticipant>,
  crossing: ChipCrossingData,
  createUnknownEntrants: boolean = false,
  categoryList: EventCategory[]|undefined
): void => {
  validateCategoriesToCreate(categories, createUnknownEntrants);
  if (crossing.time === undefined) {
    console.error(`Crossing for chip ${crossing.chipCode} has no time`);
    return;
  }
  let entrant = findEntrantByChipCode(entrants, crossing.chipCode);
  if (!entrant && createUnknownEntrants) {
    assert (categoryList !== undefined, 'Categories list must be passed when creating unnown entrants to create unknown entrants');
    entrant = createEntrantForUnmatchedChipCode(categoryList!, crossing.chipCode);
    entrants.set(entrant.id, entrant);
  }

  crossing.participantId = entrant?.id;
};

const getElapsedTimeForCategory = (cat: EventCategory, time: Date): string | undefined => {
  if (cat.startTime === undefined) {
    return undefined;
  }
  const duration = elapsedTimeMilliseconds(new Date(cat.startTime), time);
  const formattedTime = millisecondsToTime(duration);
  return formattedTime;
};

const addCachedParticipantLap = (laps: Map<EventParticipantId, TimeEvent[]>, time: TimeEvent): void => {
  if (time.participantId === undefined) {
    return;
  }
  const participantId = time.participantId;
  if (!participantId) {
    return;
  }

  if (participantId && !laps.has(participantId)) {
    laps.set(participantId, []);
  }
  const participantLaps = laps.get(participantId)!;
  participantLaps.push(time);
};

const sortParticipantTimes = (laps: Map<EventParticipantId, TimeEvent[]>) => {
  for (const key of laps.keys()) {
    const participantLaps = laps.get(key);
    if (!participantLaps || participantLaps.length === 0) {
      console.error(`Participant ${key} has no laps`);
    }
    if (participantLaps && participantLaps.length > 0) {
      participantLaps.sort(compareByTime);
    }
  }
};

const calculateCategoryElapsedTime = (
  lap: TimeEvent,
  eventFlagEvents: FlagEvent[],
  categoryId: EventCategoryId
  // categoryList: Map<EventCategoryId, EventCategory>
): number | undefined => {  
  const startTime: FlagEvent|undefined = findSessionStart(eventFlagEvents, categoryId);
  if (!startTime || startTime.time === undefined) {
    console.debug(`Tried to calculate elapsed time for @${lap.id} with no start time`);
    return undefined;
  }
  if (lap.time === undefined) {
    console.debug(`Tried to calculate elapsed time for @${lap.id} with no event time`);
    return undefined;
  }

  const elapsed: number = elapsedTimeMilliseconds(startTime.time, lap.time);
  return elapsed;
};

// const calculateCategoryElapsedTime

const isAfterStart = (
  lap: TimeEvent,
  eventOrCategoryStartEvent: TimeEvent
): boolean => {
  if (!lap || lap.time === undefined) {
    return false;
  }
  if (!eventOrCategoryStartEvent || eventOrCategoryStartEvent.time === undefined) {
    return false;
  }
  if (lap.time.getTime() < eventOrCategoryStartEvent.time.getTime()) {
    return false;
  }
  return true;
};

const validTimeAfterLastLap = (
  lap: TimeEvent,
  prevCrossing: TimeEvent|undefined
): number | undefined => {
  if (!prevCrossing || prevCrossing.time === undefined) {
    return undefined;
  }
  if (!lap?.time) {
    if (lap) {
      warn(`Lap ${lap.id} has no time`);
    } else {
      warn(validTimeAfterLastLap.name, 'lap is undefined');
    }
    return undefined;
  }

  let lapTime: number | undefined;

  if (prevCrossing?.time && lap.time?.getTime() > prevCrossing.time.getTime()){
    lapTime = elapsedTimeMilliseconds(prevCrossing.time, lap.time);
  } else {
    lapTime = undefined;
  }
  return lapTime;
};

class IllegalTimeEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalTimeEventError';
  }
}

const calculateLapForTimeEvent = (
  lap: TimeEvent,
  prevCrossing: TimeEvent|undefined,
  eventOrCategoryStartEvent: TimeEvent,
  onLapNumber: number
): EntrantLap | undefined => {
  if (lap.time === undefined) {
    throw new IllegalTimeEventError(`Tried to calculate lap time for @${lap.id} with no event time`);
  }
  if (eventOrCategoryStartEvent.time === undefined) {
    throw new IllegalTimeEventError(`Tried to calculate lap time for @${lap.id} with no start time`);
  }

  let lapNo = onLapNumber;
  let lapTime: number | undefined;
  let lapStart: TimeEvent;
  const elapsedTime: number | null | undefined = lapTimeAfterStart(lap, eventOrCategoryStartEvent); 
  if (lapNo == 0) {
    lapTime = elapsedTime;
    lapStart = eventOrCategoryStartEvent;
  } else {
    lapTime = validTimeAfterLastLap(lap, prevCrossing);
    lapStart = prevCrossing || eventOrCategoryStartEvent;
  }

  const minimumLapTime = 60000; // 1 minute

  const isValidLap = lapTime && lapTime > minimumLapTime;
  let isExcluded = false;
  if (isValidLap) {
    lapNo++;
  } else {
    isExcluded = true;
  }

  const lapData: EntrantLap = {
    elapsedTime: elapsedTime || null,
    isExcluded: isExcluded,
    lapNo: lapNo,
    lapStart: lapStart.id,
    lapStartedBy: (prevCrossing?.participantId || lap.participantId)!,
    lapTime: lapTime,
    overallTrackPosition: undefined,
    positionInClass: undefined,
    timeEventId: lap.id,
  };

  return lapData;
};

class ParticipantNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParticipantNotFoundError';
  }
}

const getParticipantStartEvent = (
  times: FlagEvent[],
  participantId: EventParticipantId,
  participantList: Map<EventParticipantId, EventParticipant>
): TimeEvent | undefined => {
  const participant: EventParticipant | undefined = participantList.get(participantId);
  if (!participant) {
    throw new ParticipantNotFoundError(`Participant ${participantId} not found`);
  }

  const startTime: TimeEvent|undefined = findSessionStart(times, participant.categoryId);
  return startTime;
};

const calculateLapTimes = (participantLaps: TimeEvent[], participantList: Map<EventParticipantId, EventParticipant>, startEvent: FlagEvent): EntrantLap[] => {
  const lapTimes: EntrantLap[] = [];
  let lapNo = 0;
  // let previousValidIndex = undefined;
  // let lapStartedBy: EventParticipantId | null | undefined = undefined;
  // let prevLapStartTime = startTime;
  let prevLap: TimeEvent | undefined = undefined;

  participantLaps.forEach((time: TimeEvent, _index, _all) => {
    const participant = time.participantId ? participantList.get(time.participantId) : undefined;
    if (!participant) {
      console.error(`Participant ${time.participantId} not found`);
      return;
    }

    const completedLap = calculateLapForTimeEvent(time, prevLap, startEvent, lapNo);
    // if (index === 0) {
    //   lapData.lapTime = lapData.elapsedTime;
    // }
    // lapStartedBy = lap.participant;

    if (!completedLap?.isExcluded) {
      lapTimes.push(completedLap!);
      // prevLapStartTime = time.time!;
      prevLap = time;
      lapNo++;
    }
    // if (completedLap?.lapStart) {
    //   const lapStart: EntrantLap | FlagEvent = completedLap.lapStart;
    //   if (time.time) {
        
    //   }
    //   prevLap = completedLap?.lapStart;
    // }
  });
  return lapTimes;
};

const convertParticipantTimesToLaps = (times: Map<EventParticipantId, TimeEvent[]>, participantsMap: Map<EventParticipantId, EventParticipant>, eventStartFlag: FlagEvent): Map<EventParticipantId, EntrantLap[]> => {
  const lapTimes: Map<EventParticipantId, EntrantLap[]> = new Map<EventParticipantId, EntrantLap[]>();
  for (const key of times.keys()) {
    const participantTimes = times.get(key);
    if (!participantTimes || participantTimes.length === 0) {
      console.error(`Participant ${key} has no laps`);
      continue;
    }
    const startTime = eventStarts.overallStart || participantTimes[0].time;
    if (!eventStartFlag) {
      console.error(`Participant ${key} has no start time - can't calculate first lap.`);
      continue;
    }

    times.entries().filter(([_, v]) => isFlagEvent(v));
    // let timeValues = times.values().toArray().filter((t: TimeEvent) => isFlagEvent(t));
    
    const categoryStart = findSessionStart(eventFlagEvents, participant.categoryId);
    if (!categoryStart || categoryStart.time === undefined) {
      return;
    }


    const participantLaps = calculateLapTimes(times.get(key)!, participantsMap, startTime);
    lapTimes.set(key, participantLaps);
  }
  return lapTimes;
};

const cacheParticipantLaps = (
  allTimeEvents: TimeEvent[], eventStartTime: Date, eventEndTime: Date
): Map<EventParticipantId, EntrantLap[]> => {
  const participantTimes = new Map<EventParticipantId, TimeEvent[]>();
  allTimeEvents.forEach((timeEvent) => {
    if (timeEvent.participantId === undefined) {
      if (isFlagEvent(timeEvent)) {
        addFlagEvent(participantTimes, timeEvent);
      } else {
        return;
      }
    }
    if (timeEvent.time === undefined) {
      console.error(`Crossing for ${getTimeEventIdentifier(timeEvent)} has no time`);
      return;
    }
    if (timeEvent.time.getTime() < eventStartTime.getTime()) {
      console.error(`Crossing for ${getTimeEventIdentifier(timeEvent)} is before event start time`);
      return;
    }
    if (timeEvent.time.getTime() > eventEndTime.getTime()) {
      console.error(`Crossing for ${getTimeEventIdentifier(timeEvent)} is after event end time`);
      return;
    }
    addCachedParticipantLap(participantTimes, timeEvent);
  });
  sortParticipantTimes(times);
  const laps: Map<EventParticipantId, EntrantLap[]> = convertParticipantTimesToLaps(
    times,
    { categories: new Map<EventCategoryId, EventCategory>(), overallStart: eventStartTime }
  );

  return laps;
};

const assignParticpantsToCrossings = (participants: Map<EventParticipantId, EventParticipant>, crossings: TimeEvent[]): void => {
  crossings.forEach((crossing: TimeEvent) => {
    assignEntrantToTime(participants, crossing);
  });
};

const crossingTableRow = (evt: TimeEvent, categoryList: EventCategory[]): string[] => {
  const ant = ''; // (crossing as unknown as any).antenna ?? '';
  const time: Date = evt.time!;

  let timeString = !evt.time ? 'Undefined time' : 'Invalid time';
  try {
    timeString = formatRFC3339(time, { fractionDigits: 3 });
  } catch (error) {
    console.error(`Error formatting time ${timeString} (${evt.dataLine})`);
    throw error;
  }

  const identifier: string = getTimeEventIdentifier(evt);
  const entrant = evt.participantId ? entrants.get(evt.participantId) : undefined;
  let plateNumber: string | number | undefined = undefined;
  let entrantName: string | undefined = undefined;
  let lapNo: string = '';
  let elapsedTime = '--:--:--.---';
  let lapTime = '';
  if (entrant) {
    plateNumber = getParticipantNumber(entrant);
    entrantName = `${entrant.firstname} ${entrant.surname}`;
    const entrantLaps: EntrantLap[]|undefined = cachedLaps.get(entrant.id);
    if (entrantLaps) {
      const lap = entrantLaps.find((l) => l.timeEventId === evt.id);
      lapNo = lap?.lapNo?.toString() || '';
      elapsedTime = lap?.elapsedTime ? millisecondsToTime(lap.elapsedTime) : '--:--:--.---';
      lapTime = lap?.lapTime ? millisecondsToTime(lap.lapTime) : '--:--:--.---';
    }
  }
  const plateNumberString: string = plateNumber?.toString() || '';

  if (!entrantName) {
    entrantName = '';
  }

  let categoryName = 'No category';
  if (entrant?.categoryId) {
    const cat = findCategoryById(categoryList, entrant?.categoryId);
    if (cat) {
      elapsedTime = getElapsedTimeForCategory(cat, time) || elapsedTime || '00:00:00.000';
      if (cat.name) {
        categoryName = cat?.name;
      }

    }
  }

  return [
    ant,
    identifier,
    timeString,
    plateNumberString,
    entrantName,
    categoryName,
    lapNo,
    elapsedTime,
    lapTime,
  ];
};

// If you want to get the rows with no valid time, assign the result to a variable:
const rowsWithNoTime = data.filter(noTimeRows);
console.log('Rows with no time:', rowsWithNoTime.length);
let validTimes = data.filter((d) => !rowsWithNoTime.includes(d));
const eventStartTime = new Date('2025-03-03T18:00:00');
const eventEndTime = new Date('2025-03-03T20:00:00');

export const categories = getCategoryList();
const loadedCategories = loadCategoriesFromFile(path.join(testdata_dir, 'categories.json'));
categories.push(...loadedCategories);

validTimes = filterToEventsBetween(validTimes, eventStartTime, eventEndTime);
console.log('Valid times:', validTimes.length);
const sortedTimeEvents = validTimes.sort(compareByTime);
const entrantsList = await readParticipantsXlsx(path.join(testdata_dir, '2025-03-03-entries.xlsx'), { Category: 'Grade', RacePlate: 'RaceNo', Tx: 'ChipNum' }, categories);
const entrants: Map<EventParticipantId, EventParticipant> = new Map<EventParticipantId, EventParticipant>();
entrantsList.forEach((entrant) => {
  const id = entrant.id;
  if (id) {
    entrants.set(id, entrant);
  } else {
    console.error(`Entrant ${entrant.firstname} ${entrant.surname} has no ID`);
  }
});

assignParticpantsToCrossings(entrants, sortedTimeEvents);
const cachedLaps: Map<EventParticipantId, EntrantLap[]> = cacheParticipantLaps(sortedTimeEvents, eventStartTime, eventEndTime);

const outputTableRowData = sortedTimeEvents.map((crossing: TimeEvent) => {
  if (crossing.time === undefined) {
    console.error(`Crossing for ${getTimeEventIdentifier(crossing)} has no time`);
  }

  try {
    const categoryList = getCategoryList();
    const row = crossingTableRow(crossing, categoryList);
    return row;
  } catch (error) {
    console.error('Error creating row data', error);
  }
  return undefined;
});
// .filter((row) => row !== undefined) as string[];
const filteredData = outputTableRowData.filter((row) => row !== undefined);

filteredData.forEach((row) => {
  t.push(row);
});

console.log(t.toString());
const lapTimeAfterStart = (lap: TimeEvent, eventOrCategoryStartEvent: TimeEvent): number | undefined => {
  if (!eventOrCategoryStartEvent?.time || !lap?.time) {
    return undefined;
  }

  if (!isAfterStart(lap, eventOrCategoryStartEvent)) {
    return undefined;
  }
  const lapTime = elapsedTimeMilliseconds(eventOrCategoryStartEvent.time, lap.time);
  return lapTime;
};

