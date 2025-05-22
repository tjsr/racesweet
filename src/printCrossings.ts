import type { ChipCrossingData, PlateCrossingData, TimeEvent } from "./model/chipcrossing.ts";
import type { EventCategory, EventCategoryId } from "./model/eventcategory.ts";
import type { EventParticipant, EventParticipantId } from "./model/eventparticipant.ts";
import { createEntrantForUnmatchedChipCode, findEntrantByChipCode, findEntrantByPlateNumber, getParticipantNumber, readParticipantsXlsx } from "./controllers/participant.ts";
import { findCategoryById, getCategoryList, loadCategoriesFromFile } from "./controllers/category.ts";

import Table from "cli-table3";
import { formatRFC3339 } from "date-fns";
import { parseFile } from "./parsers/outreach.ts";
import path from "path";

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

const filterToCrossingsBetween = (data: TimeEvent[], start: Date, end: Date): TimeEvent[] => {
  return data.filter((crossing) => {
    if (crossing.time === undefined) {
      return false;
    }
    const crossingTime = crossing.time.getTime();
    return crossingTime >= start.getTime() && crossingTime <= end.getTime();
  });
};

const compareTimes = (a: Date | undefined, b: Date | undefined): number => {
  if (a === undefined && b === undefined) {
    return 0;
  }
  if (a === undefined) {
    return 1;
  }
  if (b === undefined) {
    return -1;
  }
  return a.getTime() - b.getTime();
};

const compareCrossingsByTime = (
  a: TimeEvent,
  b: TimeEvent
): number => compareTimes(a.time, b.time);

const getTimeEventIdentifier = (evt: TimeEvent): string => {
  if (Object.prototype.hasOwnProperty.call(evt, 'chipCode')) {
    const crossing = evt as ChipCrossingData;
    return `${crossing.chipCode}`;
  };
  return '';
};

const assignEntrantToChipCrossing = (entrants: Map<EventParticipantId, EventParticipant>, crossing: ChipCrossingData): void => {
  if (crossing.time === undefined) {
    console.error(`Crossing for chip ${crossing.chipCode} has no time`);
    return;
  }
  let entrant = findEntrantByChipCode(entrants, crossing.chipCode);
  if (!entrant) {
    const categories = getCategoryList();
    entrant = createEntrantForUnmatchedChipCode(categories, crossing.chipCode);
    entrants.set(entrant.id, entrant);
  }

  crossing.participant = entrant?.id;
};

const assignEntrantToPlateCrossing = (entrants: Map<EventParticipantId, EventParticipant>, crossing: PlateCrossingData): void => {
  if (crossing.time === undefined) {
    console.error(`Crossing for plate ${crossing.plateNumber} has no time`);
    return;
  }
  const entrant = findEntrantByPlateNumber(entrants, crossing.plateNumber);
  crossing.participant = entrant?.id;
};

const assignEntrantToTime = (entrants: Map<EventParticipantId, EventParticipant>, evt: TimeEvent): void => {
  if (Object.prototype.hasOwnProperty.call(evt, 'chipCode')) {
    const crossing = evt as ChipCrossingData;
    assignEntrantToChipCrossing(entrants, crossing);
  } else if (Object.prototype.hasOwnProperty.call(evt, 'plateNumber')) {
    const crossing = evt as PlateCrossingData;
    const plateNumber = crossing.plateNumber;
    if (plateNumber === undefined) {
      console.error(`Crossing ${crossing.plateNumber} has no plate number`);
      return;
    }
    assignEntrantToPlateCrossing(entrants, crossing);
  } else {
    console.error(`Crossing ${evt.dataLine} has no chip code or plate number - not assigne`);
  }
};

const elapsedTimeMilliseconds = (start: Date, end: Date): number => {
  const startTime = start.getTime();
  const endTime = end.getTime();
  return endTime - startTime;
};

const millisecondsToTime = (milliseconds: number): string => {
  const seconds = Math.floor((milliseconds / 1000) % 60);
  const minutes = Math.floor((milliseconds / (1000 * 60)) % 60);
  const hours = Math.floor((milliseconds / (1000 * 60 * 60)) % 24);
  milliseconds = Math.floor(milliseconds % 1000);
  const formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
  return formattedTime;
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
  if (time.participant === undefined) {
    return;
  }
  const participantId = time.participant;
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
      participantLaps.sort(compareCrossingsByTime);
    }
  }
};

interface StartData {
  overallStart: Date | undefined;
  categories: Map<EventCategoryId, EventCategory>;
}

interface EntrantLap {
  timeEventId: TimeEvent['id'];
  lapStartedBy: EventParticipant['id'];
  elapsedTime: number;
  lapTime: number | undefined;
  lapNo: number | null;
  isExcluded: boolean;
  overallTrackPosition: number | undefined;
  positionInClass: number | undefined;
};

const calculateLapTimes = (laps: TimeEvent[], startTime: Date): EntrantLap[] => {
  const lapTimes: EntrantLap[] = [];
  let lapNo = 0;
  // let previousValidIndex = undefined;
  let lapStartedBy: EventParticipantId | null | undefined = undefined;
  let prevLapStartTime = startTime;
  laps.forEach((lap, index, _all) => {
    if (lap.time === undefined) {
      return;
    }
    const isValidLap = true;
    let isExcluded = false;
    if (isValidLap) {
      lapNo++;
      // previousValidIndex = index;
    } else {
      isExcluded = true;
    }

    const lapData: EntrantLap = {
      elapsedTime: elapsedTimeMilliseconds(startTime, lap.time),
      isExcluded: isExcluded,
      lapNo: lapNo,
      lapStartedBy: lapStartedBy!,
      lapTime: index === 0 ? undefined : elapsedTimeMilliseconds(prevLapStartTime, lap.time),
      overallTrackPosition: undefined,
      positionInClass: undefined,
      timeEventId: lap.id,
    };
    if (index === 0) {
      lapData.lapTime = lapData.elapsedTime;
    }
    lapStartedBy = lap.participant;

    lapTimes.push(lapData);
    if (isValidLap) {
      prevLapStartTime = lap.time;
    }

  });
  return lapTimes;
};

const convertTimesToLaps = (times: Map<EventParticipantId, TimeEvent[]>, eventStarts: StartData): Map<EventParticipantId, EntrantLap[]> => {
  const lapTimes: Map<EventParticipantId, EntrantLap[]> = new Map<EventParticipantId, EntrantLap[]>();
  for (const key of times.keys()) {
    const participantTimes = times.get(key);
    if (!participantTimes || participantTimes.length === 0) {
      console.error(`Participant ${key} has no laps`);
      continue;
    }
    const startTime = eventStarts.overallStart || participantTimes[0].time;
    if (!startTime) {
      console.error(`Participant ${key} has no start time - can't calculate first lap.`);
      continue;
    }
    const participantLaps = calculateLapTimes(times.get(key)!, startTime);
    lapTimes.set(key, participantLaps);
  }
  return lapTimes;
};

const cacheParticipantLaps = (
  time: TimeEvent[], eventStartTime: Date, eventEndTime: Date
): Map<EventParticipantId, EntrantLap[]> => {
  const times = new Map<EventParticipantId, TimeEvent[]>();
  time.forEach((crossing) => {
    if (crossing.participant === undefined) {
      return;
    }
    if (crossing.time === undefined) {
      console.error(`Crossing for ${getTimeEventIdentifier(crossing)} has no time`);
      return;
    }
    if (crossing.time.getTime() < eventStartTime.getTime()) {
      console.error(`Crossing for ${getTimeEventIdentifier(crossing)} is before event start time`);
      return;
    }
    if (crossing.time.getTime() > eventEndTime.getTime()) {
      console.error(`Crossing for ${getTimeEventIdentifier(crossing)} is after event end time`);
      return;
    }
    addCachedParticipantLap(times, crossing);
  });
  sortParticipantTimes(times);
  const laps: Map<EventParticipantId, EntrantLap[]> = convertTimesToLaps(
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

const crossingTableRow = (evt: TimeEvent): string[] => {
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
  const entrant = evt.participant ? entrants.get(evt.participant) : undefined;
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
    const cats = getCategoryList();
    const cat = findCategoryById(cats, entrant?.categoryId);
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

const categories = getCategoryList();
const loadedCategories = loadCategoriesFromFile(path.join(testdata_dir, 'categories.json'));
categories.push(...loadedCategories);

validTimes = filterToCrossingsBetween(validTimes, eventStartTime, eventEndTime);
console.log('Valid times:', validTimes.length);
const sortedTimeEvents = validTimes.sort(compareCrossingsByTime);
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

const rowData = sortedTimeEvents.map((crossing: TimeEvent) => {
  if (crossing.time === undefined) {
    console.error(`Crossing for ${getTimeEventIdentifier(crossing)} has no time`);
  }

  try {
    const row = crossingTableRow(crossing);
    return row;
  } catch (error) {
    console.error('Error creating row data', error);
  }
  return undefined;
});
// .filter((row) => row !== undefined) as string[];
const filteredData = rowData.filter((row) => row !== undefined);

filteredData.forEach((row) => {
  t.push(row);
});

console.log(t.toString());
