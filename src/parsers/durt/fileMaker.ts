import path from 'node:path';
import { TZDate } from '@date-fns/tz';
import { normalizeTimeZone } from '../../app/utils/timeutils.js';
import type { EventCategory } from '../../model/eventcategory.js';
import type { EventParticipant, ParticipantTransponder } from '../../model/eventparticipant.js';
import { createCategoryId, createEventEntrantId, createEventParticipantId, createTimeRecordId, createTimeRecordSourceId } from '../../model/ids.js';
import type { EventId, SessionId } from '../../model/raceevent.js';
import type { RaceState } from '../../model/racestate.js';
import { createGreenFlagEvent } from '../../processing/flag.js';
import { RECORD_TX_CROSSING, type ParticipantPassingRecord, type TimeRecord, type TimeRecordSource } from '../../model/timerecord.js';

export interface FileMakerColumn {
  name: string;
  type?: string;
}

export interface FileMakerTable {
  columns: FileMakerColumn[];
  name: string;
  values: Array<Record<string, string>>;
}

export interface DurtFileMakerImportOptions {
  eventId: EventId;
  sessionId: SessionId;
  sourceFilePath: string;
  timeZone?: string;
}

const TRANSPONDER_COLUMNS: string[] = ['transponder', 'transponderno', 'transpondernumber', 'tx', 'txno', 'txnum', 'txnumber'];
const FIRST_NAME_COLUMNS: string[] = ['firstname', 'givenname', 'riderfirstname'];
const LAST_NAME_COLUMNS: string[] = ['lastname', 'riderlastname', 'surname', 'familyname'];
const CATEGORY_COLUMNS: string[] = ['category', 'categoryentered', 'class', 'grade', 'ridercategory'];
const PLATE_COLUMNS: string[] = ['number', 'racenumber', 'ridernumber', 'riderracenumber', 'plate', 'platenumber'];
const DATE_COLUMNS: string[] = ['crossingdate', 'date', 'readdate', 'riderlapfinishdate'];
const TIME_COLUMNS: string[] = ['crossingtime', 'time', 'timeofday', 'readtime', 'riderlapfinishtime'];
const TIMESTAMP_COLUMNS: string[] = ['crossingtimestamp', 'datetime', 'timestamp', 'readtimestamp'];
const LINE_COLUMNS: string[] = ['line', 'lineno', 'linenumber'];
const LOOP_COLUMNS: string[] = ['loop', 'loopno', 'loopnumber'];
const CATEGORY_START_DATE_COLUMNS: string[] = ['categorystartdate'];
const CATEGORY_START_TIME_COLUMNS: string[] = ['categorystarttime'];
const LAP_TIME_COLUMNS: string[] = ['riderstimeforthislap'];

const normalizeColumnName = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const getValue = (row: Record<string, string>, columns: string[]): string | undefined => {
  const valueByColumn = new Map<string, string>();
  Object.entries(row).forEach(([key, value]: [string, string]) => valueByColumn.set(normalizeColumnName(key), value.trim()));
  return columns.map((column: string) => valueByColumn.get(column)).find((value: string | undefined) => !!value);
};

const getNumber = (row: Record<string, string>, columns: string[]): number | undefined => {
  const rawValue = getValue(row, columns);
  if (!rawValue) {
    return undefined;
  }
  const parsedValue = Number(rawValue.replace(/,/g, ''));
  return Number.isFinite(parsedValue) ? parsedValue : undefined;
};

const tableHasColumns = (table: FileMakerTable, columns: string[]): boolean => {
  const names = new Set<string>(table.columns.map((column: FileMakerColumn) => normalizeColumnName(column.name)));
  return columns.some((column: string) => names.has(column));
};

const isCrossingTable = (table: FileMakerTable): boolean => (
  (tableHasColumns(table, TRANSPONDER_COLUMNS) || tableHasColumns(table, PLATE_COLUMNS)) && (
    tableHasColumns(table, DATE_COLUMNS) || tableHasColumns(table, TIME_COLUMNS) || tableHasColumns(table, TIMESTAMP_COLUMNS)
  )
);

const isEntrantTable = (table: FileMakerTable): boolean => (
  tableHasColumns(table, TRANSPONDER_COLUMNS) && (
    tableHasColumns(table, FIRST_NAME_COLUMNS) || tableHasColumns(table, LAST_NAME_COLUMNS) || tableHasColumns(table, CATEGORY_COLUMNS)
  ) && !isCrossingTable(table)
);

const parseDateTime = (dateText: string | undefined, timeText: string | undefined, timeZone: string): Date | undefined => {
  const combinedText = `${dateText || ''} ${timeText || ''}`.trim();
  if (!combinedText) {
    return undefined;
  }
  const match = /^(?:(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\s+)?(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?\s*(am|pm)?$/i.exec(combinedText);
  if (!match) {
    const parsedTime = Date.parse(combinedText);
    return Number.isFinite(parsedTime) ? new Date(parsedTime) : undefined;
  }
  const day = Number(match[1] || 1);
  const month = Number(match[2] || 1);
  const rawYear = Number(match[3] || 1970);
  const year = rawYear < 100 ? rawYear + 2000 : rawYear;
  let hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] || 0);
  const millisecond = Number((match[7] || '0').padEnd(3, '0'));
  const meridiem = match[8]?.toLowerCase();
  if (meridiem === 'pm' && hour < 12) {
    hour += 12;
  }
  if (meridiem === 'am' && hour === 12) {
    hour = 0;
  }
  return new Date(new TZDate(year, month - 1, day, hour, minute, second, millisecond, normalizeTimeZone(timeZone)).getTime());
};

const createDurtCategory = (eventId: EventId, categoryName: string): EventCategory => ({
  code: categoryName,
  description: '',
  id: createCategoryId(`durt:${eventId}:category:${categoryName}`),
  name: categoryName,
});

export const convertDurtFileMakerTablesToRaceState = (
  tables: FileMakerTable[],
  options: DurtFileMakerImportOptions
): Partial<RaceState> => {
  const sourceId = createTimeRecordSourceId(`durt-filemaker:${options.sourceFilePath}`);
  const timeZone = options.timeZone || 'Australia/Sydney';
  const entrantTables = tables.filter(isEntrantTable);
  const crossingTables = tables.filter(isCrossingTable);
  const categoryByName = new Map<string, EventCategory>();
  const categoryStartTimes = new Map<string, Date>();
  const participantByPlate = new Map<string, EventParticipant>();
  const participantByTransponder = new Map<string, EventParticipant>();

  entrantTables.forEach((table: FileMakerTable) => table.values.forEach((row: Record<string, string>, rowIndex: number) => {
    const transponder = getValue(row, TRANSPONDER_COLUMNS);
    if (!transponder || participantByTransponder.has(transponder)) {
      return;
    }
    const firstName = getValue(row, FIRST_NAME_COLUMNS) || '';
    const lastName = getValue(row, LAST_NAME_COLUMNS) || '';
    const categoryName = getValue(row, CATEGORY_COLUMNS) || 'Uncategorised';
    let category = categoryByName.get(categoryName);
    if (!category) {
      category = createDurtCategory(options.eventId, categoryName);
      categoryByName.set(categoryName, category);
    }
    const plate = getValue(row, PLATE_COLUMNS);
    const identifier: ParticipantTransponder = { fromTime: undefined, toTime: undefined, txNo: /^\d+$/.test(transponder) ? Number(transponder) : transponder };
    const identifiers = plate ? [{ fromTime: undefined, racePlate: plate, toTime: undefined }, identifier] : [identifier];
    const participantId = createEventParticipantId(`durt:${options.sourceFilePath}:entrant:${table.name}:${rowIndex}:${transponder}`);
    participantByTransponder.set(transponder, {
      categoryId: category.id,
      currentResult: undefined,
      entrantId: createEventEntrantId(`durt:${options.sourceFilePath}:entrant:${table.name}:${rowIndex}:${transponder}`),
      firstname: firstName,
      id: participantId,
      identifiers,
      lastRecordTime: null,
      resultDuration: null,
      surname: lastName,
    });
    if (plate) {
      participantByPlate.set(plate, participantByTransponder.get(transponder)!);
    }
  }));

  const records: TimeRecord[] = [];
  crossingTables.forEach((table: FileMakerTable) => table.values.forEach((row: Record<string, string>, rowIndex: number) => {
    const transponder = getValue(row, TRANSPONDER_COLUMNS);
    const plate = getValue(row, PLATE_COLUMNS);
    if (!transponder && !plate) {
      return;
    }
    if (getValue(row, LAP_TIME_COLUMNS) === '00:00:00') {
      return;
    }
    const timestamp = getValue(row, TIMESTAMP_COLUMNS);
    const crossingTime = parseDateTime(timestamp || getValue(row, DATE_COLUMNS), timestamp ? undefined : getValue(row, TIME_COLUMNS), timeZone);
    if (!crossingTime) {
      return;
    }
    const categoryName = getValue(row, CATEGORY_COLUMNS);
    if (categoryName) {
      let category = categoryByName.get(categoryName);
      if (!category) {
        category = createDurtCategory(options.eventId, categoryName);
        categoryByName.set(categoryName, category);
      }
      const categoryStartTime = parseDateTime(getValue(row, CATEGORY_START_DATE_COLUMNS), getValue(row, CATEGORY_START_TIME_COLUMNS), timeZone);
      if (categoryStartTime && !categoryStartTimes.has(category.id)) {
        categoryStartTimes.set(category.id, categoryStartTime);
      }
    }
    const participant = (transponder ? participantByTransponder.get(transponder) : undefined) || (plate ? participantByPlate.get(plate) : undefined);
    const recordIdentifier = transponder || plate!;
    const participantTransponder = participant?.identifiers.find((identifier): identifier is ParticipantTransponder => 'txNo' in identifier);
    records.push({
      chipCode: participantTransponder?.txNo || (/^\d+$/.test(recordIdentifier) ? Number(recordIdentifier) : recordIdentifier),
      dataLine: JSON.stringify(row),
      eventId: options.eventId,
      id: createTimeRecordId(`durt:${options.sourceFilePath}:crossing:${table.name}:${rowIndex}`),
      lineNumber: getNumber(row, LINE_COLUMNS),
      loopNumber: getNumber(row, LOOP_COLUMNS),
      participantId: participant?.id,
      recordType: RECORD_TX_CROSSING,
      sequence: records.length + 1,
      sessionId: options.sessionId,
      source: sourceId,
      time: crossingTime,
    } as ParticipantPassingRecord & { chipCode: number | string });
  }));

  categoryStartTimes.forEach((startTime: Date, categoryId: string): void => {
    records.push(createGreenFlagEvent({
      categoryIds: [categoryId],
      eventId: options.eventId,
      id: createTimeRecordId(`durt:${options.sourceFilePath}:start:${categoryId}`),
      sequence: records.length + 1,
      sessionId: options.sessionId,
      source: sourceId,
      time: startTime,
    }));
  });

  const timeRecordSources: TimeRecordSource[] = [{
    description: 'DURT FileMaker database imported with fmp2json.',
    filePath: options.sourceFilePath,
    id: sourceId,
    name: path.basename(options.sourceFilePath),
    timezone: timeZone,
  }];
  return {
    categories: Array.from(categoryByName.values()),
    participants: Array.from(participantByTransponder.values()),
    records,
    teams: [],
    timeRecordSources,
  };
};
