import type { EventCategory, EventCategoryId } from "./model/eventcategory.ts";
import type { EventParticipant, EventParticipantId } from "./model/eventparticipant.ts";
import type { FlagRecord, GreenFlagRecord } from "./model/flag.ts";
import type { ParticipantPassingRecord, PassingRecordId, TimeRecord } from "./model/timerecord.ts";
import { addTimeRecord, compareByTime, filterToEventsBetween, getTimeRecordIdentifier, isRecordAfterStart } from "./controllers/timerecord.ts";
import { assignParticpantsToCrossings, getParticipantNumber, readParticipantsXlsx } from "./controllers/participant.ts";
import { createGreenFlagEvent, getEventStartFlagForCategory, getFlagEvents, isFlagRecord, isGreenFlag } from "./controllers/flag.ts";
import { elapsedTimeMilliseconds, millisecondsToTime } from "./app/utils/timeutils.ts";
import { findCategoryById, getCategoryList, loadCategoriesFromFile } from "./controllers/category.ts";

import type { Cell } from 'cli-table3';
import Table from "cli-table3";
import colors from 'colors';
import { findSessionStart } from "./controllers/session.ts";
import { formatRFC3339 } from "date-fns";
import { parseFile } from "./parsers/outreach.ts";
import path from "path";

colors.enable();

const warn = (message?: string, ...optionalParams: unknown[]): void => {
  console.warn(`Warning: ${message}`, optionalParams);
};

const testdata_dir = path.resolve(path.join('.', 'src', 'testdata'));

const dataFile = '192.168.1.119 2025-03-03.txt';
const MINIMUM_LAP_TIME_SECONDS = 300; // 5 minutes in milliseconds

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


const columns = ['Antenna', 'Chip Code', 'Time', 'Number', 'Entrant', 'Category', 'LapNo', 'Elapsed Time', 'Lap Time'];
const t = new Table({
  head: columns,
});

const noTimeRows = (event: TimeRecord, _idx: number, _arr: TimeRecord[]): boolean => {
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

const getElapsedTimeForCategory = (cat: EventCategory, time: Date): string | undefined => {
  if (cat.startTime === undefined) {
    return undefined;
  }
  const duration = elapsedTimeMilliseconds(new Date(cat.startTime), time);
  const formattedTime = millisecondsToTime(duration);
  return formattedTime;
};

// const addCachedParticipantLap = (laps: Map<EventParticipantId, ParticipantPassingRecord[]>, record: ParticipantPassingRecord): void => {
//   const participantId = record?.participantId;
//   if (!participantId) {
//     return;
//   }

//   if (!laps.has(participantId)) {
//     laps.set(participantId, []);
//   }
//   const participantLaps = laps.get(participantId)!;
//   participantLaps.push(record);
// };

// const sortParticipantTimes = (laps: Map<EventParticipantId, ParticipantPassingRecord[]>) => {
//   for (const key of laps.keys()) {
//     const participantLaps = laps.get(key);
//     if (!participantLaps || participantLaps.length === 0) {
//       console.error(`Participant ${key} has no laps`);
//     }
//     if (participantLaps && participantLaps.length > 0) {
//       participantLaps.sort(compareByTime);
//     }
//   }
// };

const getElapsedTimeStart = (
  eventFlagEvents: FlagRecord[],
  categoryId: EventCategoryId
): Date | undefined => {
  const startTime: FlagRecord | undefined = findSessionStart(eventFlagEvents, categoryId);
  if (!startTime || startTime.time === undefined) {
    console.debug(`Tried to calculate elapsed time for category ${categoryId} with no start time`);
    return undefined;
  }
  return startTime.time;
};

export const calculateCategoryElapsedTime = ( 
  lap: TimeRecord,
  eventFlagEvents: FlagRecord[],
  categoryId: EventCategoryId
  // categoryList: Map<EventCategoryId, EventCategory>
): number | undefined => {  
  if (lap.time === undefined) {
    console.debug(`Tried to calculate elapsed time for @${lap.id} with no event time`);
    return undefined;
  }

  const startTime: Date | undefined = getElapsedTimeStart(eventFlagEvents, categoryId);
  if (!startTime) {
    return;
  }

  const elapsed: number = elapsedTimeMilliseconds(startTime, lap.time);
  return elapsed;
};

const validTimeAfterLastLap = (
  passing: ParticipantPassingRecord,
  prevPassing: ParticipantPassingRecord|undefined
): number | undefined => {
  if (!prevPassing || prevPassing.time === undefined) {
    return undefined;
  }
  if (!passing?.time) {
    if (passing) {
      warn(`Lap ${passing.id} has no time`);
    } else {
      warn(validTimeAfterLastLap.name, 'lap is undefined');
    }
    return undefined;
  }

  let lapTime: number | undefined;

  if (prevPassing?.time && passing.time?.getTime() > prevPassing.time.getTime()){
    lapTime = elapsedTimeMilliseconds(prevPassing.time, passing.time);
  } else {
    lapTime = undefined;
  }
  return lapTime;
};

// const getParticipantStartEvent = (
//   times: FlagRecord[],
//   participantId: EventParticipantId,
//   participantList: Map<EventParticipantId, EventParticipant>
// ): TimeRecord | undefined => {
//   const participant: EventParticipant | undefined = participantList.get(participantId);
//   if (!participant) {
//     throw new ParticipantNotFoundError(`Participant ${participantId} not found`);
//   }

//   const startTime: TimeRecord|undefined = findSessionStart(times, participant.categoryId);
//   return startTime;
// };

// const calculateLapTimes = (participantLaps: ParticipantPassingRecord[], participantList: Map<EventParticipantId, EventParticipant>, partcicipantStartRecord: StartRecord): EntrantLap[] => {
//   const lapTimes: EntrantLap[] = [];
//   let lapNo = 0;
//   // let previousValidIndex = undefined;
//   // let lapStartedBy: EventParticipantId | null | undefined = undefined;
//   // let prevLapStartTime = startTime;
//   let prevLap: ParticipantPassingRecord | undefined = undefined;

//   participantLaps.forEach((passing: ParticipantPassingRecord, _index, _all) => {
//     const participant = passing.participantId ? participantList.get(passing.participantId) : undefined;
//     if (!participant) {
//       console.error(`Participant ${passing.participantId} not found`);
//       return;
//     }

//     const completedLap = calculateLapForTimeRecord(passing, prevLap, partcicipantStartRecord, lapNo);
//     // if (index === 0) {
//     //   lapData.lapTime = lapData.elapsedTime;
//     // }
//     // lapStartedBy = lap.participant;

//     if (!completedLap?.isExcluded) {
//       lapTimes.push(completedLap!);
//       // prevLapStartTime = time.time!;
//       prevLap = passing;
//       lapNo++;
//     }
//     // if (completedLap?.lapStart) {
//     //   const lapStart: EntrantLap | FlagEvent = completedLap.lapStart;
//     //   if (time.time) {
        
//     //   }
//     //   prevLap = completedLap?.lapStart;
//     // }
//   });
//   return lapTimes;
// };

// const convertParticipantTimesToLaps = (
//   passings: Map<EventParticipantId, ParticipantPassingRecord[]>,
//   participantsMap: Map<EventParticipantId, EventParticipant>,
//   participantStartRecord: StartRecord
// ): Map<EventParticipantId, EntrantLap[]> => {
//   const lapTimes: Map<EventParticipantId, EntrantLap[]> = new Map<EventParticipantId, EntrantLap[]>();
//   for (const key of passings.keys()) {
//     const participantTimes = passings.get(key);
//     if (!participantTimes || participantTimes.length === 0) {
//       console.error(`Participant ${key} has no laps`);
//       continue;
//     }
//     const startTime = participantStartRecord?.time;
//     if (!startTime) {
//       console.error(`Participant ${key} has no start time - can't calculate first lap.`);
//       continue;
//     }

//     // times.entries().filter(([_, v]) => isFlagEvent(v));
//     // let timeValues = times.values().toArray().filter((t: TimeRecord) => isFlagEvent(t));
    
//     // const categoryStart = findSessionStart(eventFlagEvents, participant.categoryId);
//     // if (!categoryStart || categoryStart.time === undefined) {
//     //   return;
//     // }

//     const participantLaps = calculateLapTimes(passings.get(key)!, participantsMap, participantStartRecord);
//     lapTimes.set(key, participantLaps);
//   }
//   return lapTimes;
// };

export const getPassingsForParticipant = (
  participantId: EventParticipantId,
  allPassingRecords: ParticipantPassingRecord[]
): ParticipantPassingRecord[] =>
  allPassingRecords.filter((record) => record.participantId === participantId && record.time !== undefined).sort(compareByTime);

// const addParticipantCrossings = (
//   allPassingRecords: ParticipantPassingRecord[],
//   participantTimes: Map<EventParticipantId, ParticipantPassingRecord[]>
// ): void => {
//   allPassingRecords.forEach((passingRecord) => {
//     if (passingRecord.participantId === undefined) {
//       return;
//     }
//     // if (isFlagEvent(passingRecord)) {
//     //   // Should not get here if record does not have a participantId, but checking for safety.
//     //   console.warn('Flag event found with participantId, but not a crossing event:', passingRecord);
//     //   return;
//     // }
//     if (passingRecord.time === undefined) {
//       console.error(`Crossing for ${getTimeRecordIdentifier(passingRecord)} has no time`);
//       return;
//     }
//     if (passingRecord.time.getTime() < eventStartTime.getTime()) {
//       console.error(`Crossing for ${getTimeRecordIdentifier(passingRecord)} is before event start time`);
//       return;
//     }
//     if (passingRecord.time.getTime() > eventEndTime.getTime()) {
//       console.error(`Crossing for ${getTimeRecordIdentifier(passingRecord)} is after event end time`);
//       return;
//     }
//     addCachedParticipantLap(participantTimes, passingRecord);
//   });
// };

const setCategoryStartForPassings = (
  id: PassingRecordId | undefined,
  passings: ParticipantPassingRecord[]
): void => {
  passings.forEach((passing) => {
    passing.participantStartRecordId = id;
  });
};

const calculateParticipantLapTimes = (
  participantCategoryStartFlag: GreenFlagRecord | undefined | null,
  passings: ParticipantPassingRecord[],
  participant: EventParticipant,
  minimumLapTimeMilliseconds: number = MINIMUM_LAP_TIME_SECONDS * 1000 // 1 minute in milliseconds
): void => {
  const identifier = '#' + getParticipantNumber(participant);
  if (!(passings?.length > 0)) {
    console.error(`No passings to calculate lap times for ${identifier}`);
    return;
  }
  if (!participantCategoryStartFlag) {
    console.error(calculateParticipantLapTimes.name, `Participant ${identifier} category (${participant.categoryId}) start flag is undefined`);
    return;
  }
    
  if (!participantCategoryStartFlag.time) {
    console.error(calculateParticipantLapTimes.name, `Participant ${identifier} category (${participant.categoryId}) start flag has no time`);
    return;
  }

  let prevPassing: ParticipantPassingRecord | undefined = undefined;
  let onLapNumber = 0;
  passings.forEach((passing) => {
    if (passing.time === undefined) {
      console.error(calculateParticipantLapTimes.name, `Passing for ${getTimeRecordIdentifier(passing)} has no time`);
      return;
    }
    if (!isRecordAfterStart(passing, participantCategoryStartFlag)) {
      passing.lapNo = undefined;
      passing.lapTime = undefined;
      return;
    }
    let lapTime: number | undefined | null;
    if (prevPassing) {
      // if (passing.time.getTime() < prevPassing.time!.getTime()) {
      //   console.error(`Passing for ${getTimeRecordIdentifier(passing)} is before previous passing @${getTimeRecordIdentifier(prevPassing)}`);
      //   passing.lapNo = undefined;
      //   passing.lapTime = undefined;
      //   return;
      // }
      passing.startingLapRecordId = prevPassing.id;
      lapTime = validTimeAfterLastLap(passing, prevPassing);
    } else {
      passing.startingLapRecordId = participantCategoryStartFlag?.id || null;
      lapTime = passing.elapsedTime;
    }
    if ((lapTime || 0) > minimumLapTimeMilliseconds) {
      onLapNumber++;
      prevPassing = passing;
      passing.isValid = true;
      passing.isExcluded = false;
    } else {
      passing.isExcluded = true;
      passing.isValid = false;
    }
    //  else {
    //   passing.startingLapRecordId = participantCategoryStartFlag?.id || null;
    //   // passing.lapStart = prevPassing?.id || participantCategoryStartFlag?.id || null;
    // }
    passing.lapNo = onLapNumber;
    passing.lapTime = lapTime;
  });
};

const calculateParticipantElapsedTimes = (
  participantCategoryStartFlag: GreenFlagRecord | undefined | null,
  passings: ParticipantPassingRecord[]
): void => {
  // const identifier = getTimeRecordIdentifier(participant);
  if (!participantCategoryStartFlag) {
    console.error(calculateParticipantElapsedTimes.name, `Participant category start flag is undefined.`);
    return;
  } else if (!participantCategoryStartFlag.time) {
    console.error(calculateParticipantElapsedTimes.name, `Participant category start flag has no time.`);
    return;
  }
  passings.forEach((passing) => {
    if (passing.time === undefined) {
      console.error(`Passing for ${getTimeRecordIdentifier(passing)} has no time`);
      return;
    }
    if (isRecordAfterStart(passing, participantCategoryStartFlag)) {
      const elapsed: number = elapsedTimeMilliseconds(participantCategoryStartFlag.time!, passing.time);
      passing.elapsedTime = elapsed;
    }
  });
};

const processParticipantLaps = (
  allTimeRecords: TimeRecord[],
  eventParticipants: Map<EventParticipantId, EventParticipant>,
  // eventCategories: Map<EventCategoryId, EventCategory>,
  _eventStartTime: Date, _eventEndTime: Date
): Map<EventParticipantId, ParticipantPassingRecord[]> => {
  const participantTimesMap = new Map<EventParticipantId, ParticipantPassingRecord[]>();
  const eventFlags: FlagRecord[] = getFlagEvents(allTimeRecords);
  
  // addParticipantCrossings(allTimeRecords, participantTimesMap);
  // sortParticipantTimes(participantTimesMap);

  eventParticipants.forEach((participant, participantId) => {
    const passings = getPassingsForParticipant(participantId, allTimeRecords);
    if (!participant.categoryId) {
      console.error(`Participant ${participantId} has no category ID`);
      return;
    }
    const participantCategoryStartFlag: GreenFlagRecord | null = getEventStartFlagForCategory(participant.categoryId, eventFlags);
    setCategoryStartForPassings(participantCategoryStartFlag?.id, passings);
    calculateParticipantElapsedTimes(participantCategoryStartFlag, passings);
    calculateParticipantLapTimes(participantCategoryStartFlag, passings, participant, MINIMUM_LAP_TIME_SECONDS * 1000);
    participantTimesMap.set(participantId, passings);
  });

  // const laps: Map<EventParticipantId, EntrantLap[]> = convertParticipantTimesToLaps(
  //   participantTimesMap,
  //   eventParticipants,
  //   categoryStartRecord
  // );

  return participantTimesMap;
};

const getLapTimeCell = (crossing: ParticipantPassingRecord): string => {
  if (crossing.lapTime === undefined) {
    return '--:--:--.---';
  };
  const str = millisecondsToTime(crossing.lapTime!);

  if (crossing.isValid === false || crossing.isExcluded === true) {
    return str.red;
  }

  return str;
};

const crossingTableRow = (passing: ParticipantPassingRecord, categoryList: EventCategory[]): Cell[] => {
  const ant = ''; // (crossing as unknown as any).antenna ?? '';

  const timeString = tableTimeString(passing.time);
  const identifier: string = getTimeRecordIdentifier(passing);
  const entrant = passing.participantId ? entrants.get(passing.participantId) : undefined;
  let plateNumber: string | number | undefined = undefined;
  let entrantName: string | undefined = undefined;
  let lapNo: string = '';
  let elapsedTime = '--:--:--.---';
  let lapTime = '';
  if (entrant) {
    plateNumber = getParticipantNumber(entrant);
    entrantName = `${entrant.firstname} ${entrant.surname}`;
    const entrantLaps: ParticipantPassingRecord[]|undefined = processedLaps.get(entrant.id);
    if (entrantLaps) {
      // const lap = entrantLaps.find((l) => l.timeRecordId === evt.id);
      lapNo = passing.isValid ? passing?.lapNo?.toString() || '' : '';
      elapsedTime = passing?.elapsedTime ? millisecondsToTime(passing.elapsedTime) : '--:--:--.---';
      lapTime = getLapTimeCell(passing);
    }
  }
  if (!plateNumber) {
    return [
      ant, identifier, timeString,
      { colSpan: columns.length - 3, content: 'Unknown transponder', hAlign: 'center' },
    ];
  }
  const plateNumberString: string = plateNumber?.toString() || '';

  if (!entrantName) {
    entrantName = '';
  }

  let categoryName = 'No category';
  if (entrant?.categoryId) {
    const cat = findCategoryById(categoryList, entrant?.categoryId);
    if (cat) {
      elapsedTime = getElapsedTimeForCategory(cat, passing.time!) || elapsedTime || '00:00:00.000';
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
const eventStartTime = new Date('2025-03-03T19:01:20');
const eventEndTime = new Date('2025-03-03T20:00:00');


const startFlagA = createGreenFlagEvent({
  categoryIds: ['1'],
  time: new Date('2025-03-03T19:02:42+11:00'),
});
const startFlagB = createGreenFlagEvent({
  categoryIds: ['2'],
  time: new Date('2025-03-03T19:03:02+11:00'),
});
const startFlagC = createGreenFlagEvent({
  categoryIds: ['3'],
  time: new Date('2025-03-03T19:03:22+11:00'),
});

addTimeRecord(validTimes, startFlagA);
addTimeRecord(validTimes, startFlagB);
addTimeRecord(validTimes, startFlagC);

export const categories = getCategoryList();
const loadedCategories = loadCategoriesFromFile(path.join(testdata_dir, 'categories.json'));
categories.push(...loadedCategories);

validTimes = filterToEventsBetween(validTimes, eventStartTime, eventEndTime);
console.log('Valid times:', validTimes.length);
const startFlags = getFlagEvents(validTimes);
console.log('Event flags: ', startFlags.length);

const sortedTimeRecords = validTimes.sort(compareByTime);
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

assignParticpantsToCrossings(entrants, sortedTimeRecords);
const processedLaps: Map<EventParticipantId, ParticipantPassingRecord[]> = processParticipantLaps(sortedTimeRecords, entrants, eventStartTime, eventEndTime);

const categoryTextString = (selectedCategories: EventCategoryId[], categories:EventCategory[]): string => {
  if ((selectedCategories?.length || 0) === 0) {
    return 'All categories';
  }
  return selectedCategories.map((catId: EventCategoryId) => {
    const category = categories.find((search) => search.id?.toString() === catId);
    if (category) {
      return category.name;
    }
    return `&${catId}`;
  }).join(', ');
};

const useRFCTime = false;

const tableTimeString = (time: Date | undefined): string => {
  if (!time) {
    return 'Unknown time';
  }
  let timeString = !time ? 'Undefined time' : 'Invalid time';
  try {
    timeString = formatRFC3339(time!, { fractionDigits: 3 });
    if (!useRFCTime) {
      // Now re-format in a shorter format.
      timeString = timeString.replace(/(.*T)/, '').replace(/([Z+].*)$/, '');
    }
    return timeString;
  } catch (error) {
    console.error(`Error formatting time for green flag ${timeString}`);
    throw error;
  }
};

const flagTableRow = (record: FlagRecord, categoryList: EventCategory[]): Cell[] => {
  let timeString = tableTimeString(record.time);
  let flagText = 'Flag event';
  let categoryText = categoryTextString(record.categoryIds || [], categoryList);
  if (isGreenFlag(record)) {
    flagText = 'Green Flag'.bgGreen.white;
    timeString = timeString.bgGreen.white;
    categoryText = categoryText.bgGreen.white;
  }
  return [
    { colSpan: 2, content: flagText, hAlign: 'center' },
    timeString,
    { colSpan: columns.length - 3, content: categoryText, hAlign: 'center', wordWrap: true },
  ];
};

const outputTableRowData = sortedTimeRecords.map((record: TimeRecord) => {
  if (record.time === undefined) {
    console.error(`Crossing for ${getTimeRecordIdentifier(record)} has no time`);
  }

  try {
    const categoryList = getCategoryList();
    let row: Cell[];
    if (isFlagRecord(record)) {
      row = flagTableRow(record, categoryList);
    } else {
      row = crossingTableRow(record, categoryList);
    }
    return row;
  } catch (error) {
    console.error('Error creating row data', error);
  }
  return undefined;
});
// .filter((row) => row !== undefined) as string[];
const filteredData = outputTableRowData.filter((row) => row !== undefined);

filteredData.forEach((row: Cell[]) => {
  t.push(row);
});

console.log(t.toString());

const isAfter = (first: Date, second: Date): boolean => first && second && first.getTime() > second.getTime();

export const lapTimeAfterStart = (lap: TimeRecord, participantStartTime: Date): number | undefined => {
  if (!lap?.time || !isAfter(lap.time, participantStartTime)) {
    return undefined;
  }

  const lapTime = elapsedTimeMilliseconds(participantStartTime, lap.time);
  return lapTime;
};

