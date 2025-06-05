import type { ParticipantPassingRecord, TimeRecord } from "../model/timerecord.ts";
import type { RaceStateLookup, Session } from "../model/racestate.ts";
import { categoryTextString, findCategoryById, getElapsedTimeForCategory } from "./category.ts";
import { isFlagRecord, isGreenFlag } from "./flag.ts";

import type { Cell } from "cli-table3";
import type { ChipCrossingData } from "../model/chipcrossing.ts";
import type { EventCategory } from "../model/eventcategory.ts";
import type { FlagRecord } from "../model/flag.ts";
import Table from "cli-table3";
import { getLapTimeCell } from "./laps.ts";
import { getParticipantNumber } from "./participant.ts";
import { getTimeRecordIdentifier } from "./timerecord.ts";
import { millisecondsToTime } from "../app/utils/timeutils.ts";
import { tableTimeString } from "../app/utils/timeutils.ts";

export const columns = ['Antenna', 'Chip Code', 'Time', 'Number', 'Entrant', 'Category', 'LapNo', 'Elapsed Time', 'Lap Time'];
let table: Table.Table;

export const getTable = (): Table.Table => {
  if (!table) {
    table = new Table({
      head: columns,
    });
  }
  return table;
};

export const crossingTableRow = (passing: ParticipantPassingRecord, categoryList: EventCategory[], rs: RaceStateLookup): Cell[] => {
  const ant = ''; // (crossing as unknown as any).antenna ?? '';

  const timeString = tableTimeString(passing.time);
  const identifier: string = getTimeRecordIdentifier(passing);
  const entrant = passing.participantId ? rs.getParticipantById(passing.participantId) : undefined;
  let plateNumber: string | number | undefined = undefined;
  let entrantName: string | undefined = undefined;
  let lapNo: string = '';
  let elapsedTime = '--:--:--.---';
  let lapTime = '';
  if (entrant) {
    plateNumber = getParticipantNumber(entrant);
    entrantName = `${entrant.firstname} ${entrant.surname}`;
    const entrantLaps: ParticipantPassingRecord[] | undefined |null = rs.getParticipantLaps(entrant.id);
    if (entrantLaps) {
      // const lap = entrantLaps.find((l) => l.timeRecordId === evt.id);
      lapNo = passing.isValid ? passing?.lapNo?.toString() || '' : '';
      elapsedTime = passing?.elapsedTime ? millisecondsToTime(passing.elapsedTime) : '--:--:--.---';
      lapTime = getLapTimeCell(passing);
    }
  }
  if (!plateNumber) {
    const txNo = (passing as ChipCrossingData).chipCode;
    const txCount = rs.countTransponderCrossings(txNo, passing.time);
    const content = `Unknown transponder ${getTimeRecordIdentifier(passing, true)} (${txCount})`;
    return [
      ant, identifier, timeString,
      { colSpan: columns.length - 3, content, hAlign: 'center' },
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

export const flagTableRow = (record: FlagRecord, categoryList: EventCategory[]): Cell[] => {
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

const createCliTableRows = (session: Session): Cell[][] => {
  const records: TimeRecord[] = session.records;

  const outputTableRowData = records.map((record: TimeRecord) => {
    if (record.time === undefined) {
      console.error(`Crossing for ${getTimeRecordIdentifier(record)} has no time`);
    }

    try {
      const categoryList = session.categories;
      let row: Cell[];
      if (isFlagRecord(record)) {
        row = flagTableRow(record, categoryList);
      } else {
        row = crossingTableRow(record, categoryList, session);
      }
      return row;
    } catch (error) {
      console.error('Error creating row data', error);
    }
    return undefined;
  });
  // .filter((row) => row !== undefined) as string[];
  const filteredData = outputTableRowData.filter((row) => row !== undefined);
  return filteredData as Cell[][];
};

export const getCliTable = (session: Session): Table.Table => {
  const t: Table.Table = getTable();
  const tableRows = createCliTableRows(session);

  tableRows.forEach((row: Cell[]) => {
    t.push(row);
  });
  return t;
};

