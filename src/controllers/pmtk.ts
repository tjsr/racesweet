import type { PMTKLookupEventCategory, PMTKRiderResultTypes, tChipTimes, tEventRidersResults, tEventRidersResults_Ignoring, tEvents, tEventsRiders, tRiders } from '../model/pmtkTypes.ts';
import { assignParticipantNumber, assignTransponder } from './participant.ts';
import { createIdHash, humanDate } from '../utils.ts';

import type { EventCategory } from '../model/eventcategory.ts';
import type { EventParticipant } from '../model/eventparticipant.ts';
import type { GreenFlagRecord } from '../model/flag.ts';
import type { OutreachChipCrossingData } from '../parsers/outreach.ts';
import type { PlateCrossingData } from '../model/platecrossing.ts';
import { accessQueryUsingConnection } from './access.ts';
import type adodb from 'node-adodb';
import { compareByTime } from './timerecord.ts';
import { createGreenFlagEvent } from './flag.ts';
import { formatRFC3339 } from 'date-fns';
import type { uuidv5 as uuid5type } from '../model/types.ts';

export interface ParticipantsQueryResult {
  ID: tEventsRiders['ID'];
  EventRaceNo: tEventsRiders['EventRaceNo'];
  TagNo: tEventsRiders['TagNo'];
  CategoryCode: tEventsRiders['CategoryCode'];
  TeamID: tEventsRiders['TeamID'];
  FirstName: tRiders['FirstName'];
  Surname: tRiders['Surname'];
}

export const findCategoryByCode = (
  CategoryCode: string,
  categories: PMTKLookupEventCategory[]
): PMTKLookupEventCategory | undefined => categories.find(cat => cat.categoryCode === CategoryCode);

export const retrieveEvent = async (
  conn: adodb.open,
  eventId: number
): Promise<tEvents|undefined> => {
  return accessQueryUsingConnection<tEvents>(
    conn,
    "SELECT * FROM tEvents AS E WHERE E.ID=?;",
    [eventId]
  ).then((events: tEvents[]) => {
    if (events.length > 1) {
      throw new Error(`Multiple events found for ID ${eventId}. Expected only one event.`);
    }
    return events.length == 1 ? events[0] : undefined;
  });
};

export const retrieveEventTeams = (
  conn: adodb.open,
  eventId: number
): Promise<unknown[]> => accessQueryUsingConnection(
  conn,
  "SELECT * FROM tEventsTeams AS ET WHERE ET.EventID=?;",
  [eventId]
);

export const retrieveEventCategories = (
  conn: adodb.open,
  eventId: number
): Promise<unknown[]> => accessQueryUsingConnection(
  conn,
  "SELECT * FROM tEventsCategories AS EC WHERE EC.EventID=?;",
  [eventId]
);

export const retrieveChipTimesForDates = (
  conn: adodb.open,
  eventDates: Set<string>
): Promise<tChipTimes[]> => accessQueryUsingConnection<tChipTimes>(
  conn,
  "SELECT * FROM tChipTimes AS CT WHERE CT.ChipTime IN ?;",
  [eventDates.entries().toArray()]
);

export const getPMTKEventData = async (conn: adodb.open, eventId: number): Promise<any> => {
  const eventDates: Set<string> = new Set();

  return accessQueryUsingConnection<PMTKRiderResultTypes>(
    conn,
    "SELECT ERR.ID, ERR.EventID, ERR.EventRaceNo, ERR.TagNo, ERR.CrossLineAtDT, ERR.CrossLineAt, ERR.TotalRideTime, ERR.SplitTime, ERR.PosNo, NULL AS ReasonText, FALSE AS IsIgnoring FROM tEventRidersResults AS ERR WHERE ERR.EventID=?\n" +
    "UNION \n" +
    "SELECT ERRI.ID, ERRI.EventID, ERRI.EventRaceNo, ERRI.TagNo, ERRI.CrossLineAtDT, ERRI.CrossLineAt, ERRI.TotalRideTime, ERRI.SplitTime, ERRI.PosNo, ERRI.ReasonText, TRUE AS IsIgnoring FROM tEventRidersResults_Ignoring AS ERRI WHERE ERRI.EventID=?;",
    [eventId, eventId]
  ).then(async (results) => {
    (results as PMTKRiderResultTypes[]).forEach((result: PMTKRiderResultTypes) => {
      const datePart = result.CrossLineAtDT.toString().split('T')[0]; // Extract the date part from the datetime string
      try {
        const dateValue = new Date(datePart); // Create a Date object from the date string
        const formattedDate = humanDate(dateValue);
        eventDates.add(formattedDate);
      } catch (error) {
        console.error(accessQueryUsingConnection.name, `Error parsing date from CrossLineAtDT: ${result.CrossLineAtDT}`, error);
      }
    });

    const chipTimes = await retrieveChipTimesForDates(conn, eventDates);
    const participants = await accessQueryUsingConnection<ParticipantsQueryResult>(conn, "SELECT DISTINCT ER.ID AS RiderID, ER.EventRaceNo AS PlateNumber, ER.TagNo AS TagNo, ER.CategoryCode AS CategoryCode, ER.TeamID AS TeamID, StrConv(R.FirstName, 3) AS FirstName, StrConv(R.Surname, 1) FROM tEventsRiders AS ER LEFT JOIN tRiders R ON R.ID=ER.RiderID WHERE ER.EventID=?;", [eventId]);
    const teams = await retrieveEventTeams(conn, eventId);
    const categories = await retrieveEventCategories(conn, eventId);

    const event = await retrieveEvent(conn, eventId);

    const data = {
      categories: categories,
      chipTimes: chipTimes,
      event: event,
      participants: participants,
      results: results,
      teams: teams,
    };
    return data;
  });
};

export const getEvent = async (conn: adodb.open, eventId: number, source: uuid5type): Promise<unknown> => getPMTKEventData(conn, eventId).then((data) => {
  const categories: PMTKLookupEventCategory[] = data.categories.map((pmcat: any) => {
    const start = new Date(data.event.StartTime ? data.event.StartTime : data.event.EventDate);
    if (pmcat.TimingAdjustSecs && !isNaN(Number(pmcat.TimingAdjustSecs))) {
      start.setSeconds(start.getSeconds() + Number(pmcat.TimingAdjustSecs));
    }
    const ec: PMTKLookupEventCategory = {
      categoryCode: pmcat.CategoryCode,
      id: pmcat.ID,
      name: pmcat.CategoryDesc,
      startTime: formatRFC3339(start),
    };
    return ec;
  });

  const startOffsets = new Set<string>();
  categories.forEach((cat: EventCategory) => {
    if (cat.startTime) {
      startOffsets.add(cat.startTime);
    }
  });

  const categoryStarts: GreenFlagRecord[] = startOffsets.values().toArray().map((startTime): GreenFlagRecord => createGreenFlagEvent({
    categoryIds: categories.filter((cat) => cat.startTime === startTime).map((cat) => cat.id),
    time: new Date(startTime),
  }));

  const crossings = data.chipTimes.map((ct: tChipTimes, source: uuid5type): OutreachChipCrossingData => {
    const time = new Date(ct.ChipTime);
    time.setMilliseconds(ct.Milliseconds);

    const outreachCrossing: Partial<OutreachChipCrossingData> = {
      antenna: ct.AntennaNo,
      chipCode: parseInt(ct.ChipCode),
      hexChipCode: undefined,
      source: source,
      time: time,
      timeString: formatRFC3339(time, { fractionDigits: 3 }),
    };
    const crossingId = createIdHash(source, outreachCrossing as OutreachChipCrossingData);
    outreachCrossing.id = crossingId;

    return outreachCrossing as OutreachChipCrossingData;
  });

  const processedCrossings = data.results.map((pmtkResult: tEventRidersResults | tEventRidersResults_Ignoring, index: number, all: unknown[]) => {
    const matchedRecord = crossings.find((crossing: OutreachChipCrossingData) => {
      if (!crossing.time) {
        return;
      }
      const secondsCrossingTime: Date = new Date(crossing.time || crossing.timeString);
      secondsCrossingTime.setMilliseconds(0);

      if (pmtkResult.CrossLineAtDT === secondsCrossingTime && pmtkResult.TagNo === crossing.chipCode) {
        // Found a matching crossing
        return true;
      }
    });

    if (matchedRecord) {
      // Remove this from the results map.
      all.splice(index);
      matchedRecord.isExcluded = pmtkResult.IsIgnoring;
      console.debug('Removed Result data from array because a matching crossing was found', pmtkResult, matchedRecord);
    } else {
      const crossingDate = new Date(pmtkResult.CrossLineAtDT);
      // If it's a chip crossing return as ChipCrossingData, but if no Chip, make it a manual passing
      if (pmtkResult.TagNo) {

        const crossing: Partial<OutreachChipCrossingData> = {
          chipCode: pmtkResult.TagNo,
          hexChipCode: undefined,
          isExcluded: pmtkResult.IsIgnoring || undefined,
          source: source,
          time: crossingDate,
          timeString: formatRFC3339(crossingDate, { fractionDigits: 3 }),
        };
        crossing.id = createIdHash(source, crossing as OutreachChipCrossingData);
        return crossing;
      } else {
        const passing: Partial<PlateCrossingData> = {
          isExcluded: pmtkResult.IsIgnoring || undefined,
          plateNumber: pmtkResult.EventRaceNo,
          source: source,
          time: crossingDate,
          timeString: formatRFC3339(crossingDate, { fractionDigits: 3 }),
        };
        passing.id = createIdHash(source, passing as PlateCrossingData);
        return passing;
      }
    }
  });
  // if (pmtkResult.IsIgnoring) {
  //   const pmIgn = pmtkResult as tEventRidersResults_Ignoring;
  //   const comparableTime = (new Date(pmIgn.CrossLineAtDT)).setMilliseconds(0);
  // } else {
  //   return (crossing.time.getTime() === crossingTime.getTime() &&
  //     crossing.chipCode === result.TagNo &&
  //     crossing.antenna === result.AntennaNo);
  // }
  // result.TagNo && crossing.chipCode === result.TagNo && crossing.antenna === result.AntennaNo) ||
  const participants = data.participants.map((participant: ParticipantsQueryResult) => {
    const categoryByCode = findCategoryByCode(participant.CategoryCode, categories);

    const p: EventParticipant = {
      categoryId: categoryByCode?.id,
      firstname: participant.FirstName,
      id: participant.ID.toString(),
      surname: participant.Surname,
    } as EventParticipant;

    if (participant.EventRaceNo) {
      assignParticipantNumber(p, participant.EventRaceNo);
    }

    if (participant.TagNo) {
      assignTransponder(p, participant.TagNo);
    }
  });

  const records = [...crossings, ...categoryStarts.values(), ...processedCrossings].sort(compareByTime);

  return {
    categories: categories,
    participants: participants,
    records: records,
    // results: data.results,
    teams: data.teams,
  };
});

