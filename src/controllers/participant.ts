import type { ChipCodeType, EventParticipantId } from "../model/eventparticipant.ts";
import { ColumnNotInSpreadsheetError, ParticipantSpreadsheetError } from "../model/errors.ts";
import type { EventCategory, EventCategoryId, EventParticipant, ParticipantIdentifier, TimeRecord } from "../model/index.ts";
import { compareByTime, getTimeRecordIdentifier, isCrossingRecord, isRecordAfterStart } from "./timerecord.ts";
import {
  findCategoryByName,
  findOrCreateCategory
} from "./category.ts";
import { v1 as randomUUID, v5 as uuidv5 } from 'uuid';

import { CategoryNotFoundError } from "../model/eventcategory.ts";
import type { EventId } from "../model/types.ts";
import type { GreenFlagRecord } from "../model/flag.ts";
import type { ParticipantPassingRecord } from "../model/timerecord.ts";
import type { PathLike } from "fs";
import type { WorkSheet } from 'xlsx';
import { assignEntrantToTime } from "./crossing.ts";
import { elapsedTimeMilliseconds } from "../app/utils/timeutils.ts";
import { validateStartFlag } from "../validators/startflag.ts";
import xlsx from 'xlsx';

const silent: string[] = ['addParticipantIdentifier'];

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
const isLogEnabled = (fn: Function): boolean => {
  if (typeof fn !== 'function') {
    return false;
  }
  if (silent.includes(fn.name)) {
    return false;
  }
  return true;
};

const baseDebug  = console.debug;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
console.debug = (message?: any, ...optionalParams: any[]): void => {
  if (typeof message === 'function') {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    if (!isLogEnabled(message as Function)) {
      return;
    }
    message = message.name;
  }
  
  baseDebug(message, ...optionalParams);
};

const addParticipantIdentifier = (
  participant: Partial<EventParticipant>,
  identifierType: string,
  value: unknown,
  fromTime?: Date | undefined,
  toTime?: Date | undefined
): boolean => {
  if (participant.identifiers === undefined) {
    participant.identifiers = [];
  }
  if (participant.identifiers.some((existingIdentifier: ParticipantIdentifier) => {
    if (identifierType in existingIdentifier) {
      const i = existingIdentifier as unknown as Record<string, unknown>;
      const identifier = i[identifierType];
      if (value === identifier) {
        return true; // Already assigned
      }
    }
    return false;
  })) {
    return false;
  }
  participant.identifiers.push({
    fromTime,
    [identifierType]: value,
    toTime,
  } as ParticipantIdentifier);
  console.debug(addParticipantIdentifier, identifierType, 'Added identifier to participant', participant.id, value, participant.firstname, participant.surname);
  return true;
};

export const assignParticipantNumber = (
  participant: Partial<EventParticipant>,
  plateNumber: string | number,
  fromTime?: Date | undefined,
  toTime?: Date | undefined
): boolean => addParticipantIdentifier(participant, 'racePlate', plateNumber, fromTime, toTime);

const removeIdentifier = (
  participant: EventParticipant,
  identifierType: string,
  value: unknown
): boolean => {
  const index = participant.identifiers.findIndex((identifier) => {
    if (identifierType in identifier) {
      const i = identifier as unknown as Record<string, unknown>;
      const identifierValue = i[identifierType];
      if (value === identifierValue) {
        return true;
      }
    }
    return false;
  });
  if (index !== -1) {
    participant.identifiers.splice(index, 1);
    return true;
  }
  return false;
};

export const removeParticipantNumber = (
  participant: EventParticipant,
  plateNumber: string | number
): boolean => 
  removeIdentifier(participant, 'racePlate', plateNumber);

const getParticipantIdentifier = (
  participant: EventParticipant,
  identifierType: string,
  lookupTime?: Date | undefined
): string | number | undefined => {
  let ids = participant.identifiers.filter((identifier) => identifierType in identifier);
  if (ids.length === 0) {
    return undefined;
  }
  ids = ids.filter((identifier) => {
    if (identifier.fromTime && lookupTime && identifier.fromTime < lookupTime) {
      return false;
    }
    if (identifier.toTime && lookupTime && identifier.toTime > lookupTime) {
      return false;
    }
    return true;
  });

  if (ids.length > 1) {
    throw new Error('Participant has multiple race plates assigned.');
  }
  const record = ids[0] as unknown as Record<string, unknown>;
  if (!record) {
    // const identifierList = participant.identifiers.map((identifier) => Object.keys(identifier));
    // console.warn(`Participant ${participant.id} has no ${identifierType} identifiers but had ${identifierList}`);
    return undefined;
  }
  return record[identifierType] as string | number;
};

export const getParticipantIdentifiers = (
  participant: EventParticipant,
  identifierType: string,
  lookupTime?: Date | undefined
): (string|number)[] => {
  // Object.keys(identifier).includes(identifierType)
  let ids = participant.identifiers?.filter(
    (identifier: ParticipantIdentifier) => Object.prototype.hasOwnProperty.call(identifier, identifierType)
  );
  if (ids.length === 0) {
    return [];
  }
  ids = ids.filter((identifier) => {
    if (identifier.fromTime && lookupTime && identifier.fromTime < lookupTime) {
      return false;
    }
    if (identifier.toTime && lookupTime && identifier.toTime > lookupTime) {
      return false;
    }
    return true;
  });

  return ids.map((identifier) => {
    const record = identifier as unknown as Record<string, unknown>;
    return record[identifierType] as string | number;
  });
};

export const getParticipantNumber = (participant: EventParticipant, lookupTime?: Date|undefined): string | number | undefined => 
  getParticipantIdentifier(participant, 'racePlate', lookupTime);

export const assignTransponder = (
  participant: Partial<EventParticipant>,
  txNo: string | number,
  fromTime?: Date | undefined,
  toTime?: Date | undefined
): boolean => addParticipantIdentifier(participant, 'txNo', txNo, fromTime, toTime);

export const removeTransponder = (
  participant: EventParticipant,
  txNo: string | number
): boolean => 
  removeIdentifier(participant, 'txNo', txNo);

export const getParticipantTransponders = (
  participant: EventParticipant,
  lookupTime?: Date | undefined
): (string|number)[] =>
  getParticipantIdentifiers(participant, 'txNo', lookupTime);

export const validateIdentifierType = (identifierType: string): void => {
  const validIdentifierTypes = ['txNo', 'racePlate'];
  if (!validIdentifierTypes.includes(identifierType)) {
    throw new Error(`Invalid identifier type: ${identifierType}. Valid types are: ${validIdentifierTypes.join(', ')}`);
  }
};

export const chipNumberInSeries = (series: number, chipCode: ChipCodeType): number | null => {
  const chipCodeNo = Number(chipCode);
  const numInSeries = chipCodeNo % series;
  const range = chipCodeNo - numInSeries;
  if (range === series) {
    return numInSeries;
  }
  return null;
};

export const getPlateNumberFromChipCode = (chipCode: ChipCodeType): string|undefined => {
  const plateNumber = chipNumberInSeries(200000, chipCode) ||
    chipNumberInSeries(100000, chipCode) ||
    chipNumberInSeries(1100000, chipCode);
  
  if (!plateNumber) {
    return undefined;
  }
  return plateNumber.toString();
};

const createEntrantWithChipCode = (
  categories: EventCategory[],
  chipCode: ChipCodeType,
  categoryName: string,
  categoryMustExist: boolean = false
): EventParticipant => {
  const plateNumber = getPlateNumberFromChipCode(chipCode);
  const entrantId = `entrant-${chipCode}`;
  const cat = categoryMustExist
    ? findCategoryByName(categories, categoryName)
    : findOrCreateCategory(categories, { name: categoryName });
  if (!cat) {
    throw new CategoryNotFoundError(`Category ${categoryName} not found to create new entrant for chip ${chipCode}.`);
  }
  const createdEntrant: EventParticipant = {
    categoryId: cat.id,
    currentResult: undefined,
    firstname: `Entrant ${chipCode}`,
    id: entrantId,
    identifiers: [],
    lastRecordTime: null,
    resultDuration: null,
    surname: `Surname ${chipCode}`,
  };
  assignTransponder(createdEntrant, chipCode);
  if (plateNumber) {
    assignParticipantNumber(createdEntrant, plateNumber);
  }
  return createdEntrant;
};

export const createEntrant = (
  categories: EventCategory[],
  categoryName: string,
  categoryMustExist: boolean = false
): Partial<EventParticipant> => {
  
  const entrantId = randomUUID();
  const cat = categoryMustExist
    ? findCategoryByName(categories, categoryName)
    : findOrCreateCategory(categories, { name: categoryName });
  if (!cat) {
    throw new CategoryNotFoundError(`Category ${categoryName} not found to create new entrant.`);
  }
  const createdEntrant: Partial<EventParticipant> = {
    categoryId: cat.id,
    currentResult: undefined,
    id: entrantId,
    identifiers: [],
    lastRecordTime: null,
    resultDuration: null,
  };
  return createdEntrant;
};

export const createEntrantForUnmatchedChipCode = (
  categories: EventCategory[],
  chipCode: ChipCodeType,
  assignPlateNumberAsChipCode: boolean = true,
  categoryName: string = 'Unknown Chip'
): EventParticipant => {
  const plateNumber = getPlateNumberFromChipCode(chipCode);
  const createdEntrant = createEntrantWithChipCode(categories, chipCode, categoryName);
  if (assignPlateNumberAsChipCode && plateNumber) {
    assignParticipantNumber(createdEntrant, plateNumber);
  }
  return createdEntrant;
};

interface SheetData {
  headers: Record<string, unknown>;
  data: Record<string, unknown>[];
}

export const readXlsxToJson = (filePath: PathLike): Promise<SheetData> => {
  let path = filePath.toString();
  let sheetName = undefined;
  if (filePath.toString().includes('')) {
    const workbookLocationParts = filePath.toString().split('!');
    sheetName = workbookLocationParts[workbookLocationParts.length - 1];
    path = workbookLocationParts[0];
  }
  const workbook = xlsx.readFile(path);
  const workingSheet: WorkSheet = workbook.Sheets[sheetName || 'Sheet1'] || workbook.Sheets[workbook.SheetNames[0]] || workbook.Sheets[0];
  const sheetJson: Record<string, unknown>[] = xlsx.utils.sheet_to_json(workingSheet, { header: "A" });
  const headers = sheetJson.shift() as Record<string, unknown>;

  sheetJson.forEach((row: unknown) => {
    Object.keys(headers).forEach((key) => {
      try {
        const mappedKey: unknown = headers[key];
        if (!mappedKey) {
          return;
        }
        const rowRecord = row as unknown as Record<string, unknown>;
        const mappedValue = rowRecord[key];
        if (mappedValue) {
          rowRecord[mappedKey as string] = mappedValue;
        }
      } catch (error) {
        const hk = headers ? headers[key] : 'Unknown header mapping';
        console.error(`Error mapping key ${key} to ${hk}:`, error);
      }
    });

    
    // const rowDataKeys = Object.keys(rowData);
    // const rowDataValues = Object.values(rowData);
    // console.log('Row', '>>>>', row);

    // console.debug('Row', '>>>>', row);
  });

  const result: SheetData = {
    data: sheetJson,
    headers: headers,
  };

  return Promise.resolve(result);
};

interface ImportMappings {
  [key: string]: string|number;
}

const findColumnNameForSheetColumn = (headers: Record<string, string|undefined>, possibleNames: string[]): string|undefined => {
  const checkNames = [...possibleNames];
  
  // , ...possibleNames.map((name) => name.toLowerCase())];
  for (const name of checkNames) {
    const foundName = Object.keys(headers).find((header) => {
      const headerValue = headers[header];
      if (headerValue && headerValue.toString().replaceAll(' ', '').toLowerCase() === name.replaceAll(' ', '').toLowerCase()) {
        return true;
      }
    });
    if (foundName) {
      return foundName;
    }
  }

  const possibleNamesString = possibleNames.map((name) => `"${name}"`).join(', ');
  const errMsg = `Entrant sheet to import does not have a searched for header, looked for columns named ${possibleNamesString}`;
  throw new ColumnNotInSpreadsheetError(errMsg);
};

class NoTransponderError extends ParticipantSpreadsheetError {
  constructor(message: string) {
    super(message);
    this.name = "NoTransponderError";
  }
}

class NoPlateNumberError extends ParticipantSpreadsheetError {
  constructor(message: string) {
    super(message);
    this.name = "NoPlateNumberError";
  }
}

const findMappedTransponder = (mappings: ImportMappings, headings: Record<string, string|undefined>, row: Record<string, unknown>): string|undefined => {
  const txNoProperty = mappings.Tx as string || mappings.Transponder as string || findColumnNameForSheetColumn(headings, ['Transponder', 'TxNo', 'Tx', 'Chip Code'])!;
  return row[txNoProperty] as string;
};

const findMappedRiderNumber = (mappings: ImportMappings, headings: Record<string, string|undefined>, row: Record<string, unknown>): string|undefined => {
  const riderNumberProperty = mappings.RacePlate as string || findColumnNameForSheetColumn(headings, ['Rider Number', 'Rider No'])!;
  return row[riderNumberProperty] as string;
};

const findMappedSurname = (mappings: ImportMappings, headings: Record<string, string|undefined>, row: Record<string, unknown>): string|undefined => {
  const surnameProperty = mappings.Surname as string || findColumnNameForSheetColumn(headings, ['Surname', 'Last Name', 'Last'])!;
  return row[surnameProperty] as string;
};

const findMappedFirstname = (mappings: ImportMappings, headings: Record<string, string|undefined>, row: Record<string, unknown>): string|undefined => {
  const firstnameProperty = mappings.Firstname as string || findColumnNameForSheetColumn(headings, ['Firstname', 'First Name', 'First', 'Given name'])!;
  return row[firstnameProperty] as string;
};

const processParticipantRow = (
  headers: Record<string, string|undefined>,
  mappings: ImportMappings,
  row: Record<string, unknown>,
  categorySheetHeader: string,
  categoryList: EventCategory[]
): EventParticipant => {
  const rowCategory = row[categorySheetHeader] as string;
  if (!rowCategory) {
    console.error(`Row does not have any category data.`);
  }
  const createUnknownCategories: boolean = true;

  const categoryName = row[categorySheetHeader] as string;

  const category: EventCategory | null = createUnknownCategories ? findOrCreateCategory(categoryList, { name: categoryName }) : findCategoryByName(categoryList, categoryName);
  if (!category) {
    const errMsg = `Category ${categoryName} specified in sheet does not match available category.`;

    console.error(errMsg);
    throw new CategoryNotFoundError(errMsg);
  }
  // let category: EventCategory | Partial<EventCategory>|null = findCategoryByName(categoryList, categoryName);
  // if (!category && !createUnknownCategories) {
  //   console.error(`Category ${categoryName} specified in sheet does not match available cagegory.`);
  // } else {
  //   category = createCategory({ name: categoryName });
  //   categoryList.push(category);
  // }

  const firstname = findMappedFirstname(mappings, headers, row);
  const surname = findMappedSurname(mappings, headers, row);

  const participant: Partial<EventParticipant> = {
    categoryId: category?.id,
    currentResult: undefined,
    firstname: firstname,
    id: randomUUID(),
    lastRecordTime: null,
    // identifiers: [],
    resultDuration: null,
    surname: surname,
  };
  const tx = findMappedTransponder(mappings, headers, row);
  if (tx) {
    addParticipantIdentifier(participant as EventParticipant, 'txNo', tx);
  } else {
    throw new NoTransponderError(`Transponder not found in row: ${JSON.stringify(row)}`);
  }

  const no = findMappedRiderNumber(mappings, headers, row);

  if (no) {
    addParticipantIdentifier(participant as EventParticipant, 'racePlate', no);
  } else {
    throw new NoPlateNumberError(`Plate number not found in row: ${JSON.stringify(row)}`);
  }

  return participant as EventParticipant;
};

export const readParticipantsXlsx = async (filePath: PathLike, mappings: ImportMappings, categoryList: EventCategory[]): Promise<EventParticipant[]> => {
  return readXlsxToJson(filePath).then((sheetData: SheetData) => {
    const participants: EventParticipant[] = [];
    const headers = sheetData.headers as Record<string, string|undefined>;
    const data: Record<string, unknown>[] = sheetData.data;

    const categorySheetHeader: string = findColumnNameForSheetColumn(headers, ['Category', 'Class', 'Category Name', 'Grade'])!;
    if (!categorySheetHeader) {
      throw new Error('Entrant sheet to import does not have a category header.');
    }

    data.forEach((row: Record<string, unknown>) => {
      const participant = processParticipantRow(headers, mappings, row, categorySheetHeader, categoryList);
      participants.push(participant as EventParticipant);
    });
    console.log(readParticipantsXlsx.name, `Finished reading ${participants.length} participants from input file ${filePath}.`);
    return participants;
  });
};
// const calculateLapForTimeRecord = (
//   passingRecord: ParticipantPassingRecord,
//   prevLap: EntrantLap|undefined,
//   participantStartRecord: StartRecord | undefined,
//   onLapNumber: number
// ): EntrantLap | undefined => {
//   if (passingRecord.time === undefined) {
//     throw new IllegalTimeRecordError(`Tried to calculate lap time for @${passingRecord.id} with no event time`);
//   }
//   let lapNo = onLapNumber;
//   let lapTime: number | undefined;
//   // let lapStart: TimeRecord;
//   const elapsedTime: number | null | undefined = participantStartRecord?.time === undefined ? undefined : lapTimeAfterStart(passingRecord, participantStartRecord.time);
//   if (lapNo == 0) {
//     lapTime = elapsedTime;
//     // lapStart = prevLap || eventOrCategoryStartEvent;
//   } else {
//     lapTime = validTimeAfterLastLap(passingRecord, prevPassing);
//     // lapStart = prevCrossing || eventOrCategoryStartEvent;
//   }
//   const minimumLapTime = 60000; // 1 minute
//   const isValidLap = lapTime && lapTime > minimumLapTime;
//   let isExcluded = false;
//   if (isValidLap) {
//     lapNo++;
//   } else {
//     isExcluded = true;
//   }
//   let lapStartRecordId = null;
//   if (prevLap) { // A lap has to be after the start record.
//     lapStartRecordId = prevLap.timeRecordId;
//   } else if (participantStartRecord?.time) {
//     if (isRecordAfterStart(passingRecord, participantStartRecord)) {
//       lapStartRecordId = participantStartRecord.id;
//     }
//   }
//   const lapData: EntrantLap = {
//     elapsedTime: elapsedTime || null,
//     isExcluded: isExcluded,
//     lapNo: lapNo,
//     lapStart: lapStartRecordId,
//     // lapStart: prevPassing?.id || passingRecord.id || null,
//     // lapStartedBy: (prevPassing?.participantId || passingRecord.participantId)!,
//     lapTime: lapTime,
//     overallTrackPosition: undefined,
//     positionInClass: undefined,
//     timeRecordId: passingRecord.id,
//   };
//   return lapData;
// };

export class ParticipantNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParticipantNotFoundError';
  }
}

export const assignParticpantsToCrossings = (participants: Map<EventParticipantId, EventParticipant>, crossings: TimeRecord[]): void => {
  crossings.forEach((crossing: TimeRecord) => {
    if (isCrossingRecord(crossing)) {
      assignEntrantToTime(participants, crossing);
    }
  });
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
): ParticipantPassingRecord[] => allPassingRecords.filter(
  (record) => record.participantId === participantId && record.time !== undefined
).sort(compareByTime);

export const calculateParticipantElapsedTimes = (
  participantCategoryStartFlag: GreenFlagRecord,
  passings: ParticipantPassingRecord[]
): void => {
  validateStartFlag(participantCategoryStartFlag);
  // const identifier = getTimeRecordIdentifier(participant);
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

export const createParticipantIdFromEventAndCategory = (
  eventId: EventId,
  categoryId: EventCategoryId,
  raceNumber: string
): EventParticipantId => uuidv5(`${eventId}-${categoryId}-${raceNumber}`, eventId);

