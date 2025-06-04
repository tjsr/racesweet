import type { PMTKEventData, PMTKLookupEventCategory, PMTKParticipantsQueryResult, PMTKProcessedEventData } from "../model/PMTKConversionTypes.ts";
import { assignParticipantNumber, assignTransponder } from './participant.ts';
import { createIdHash, humanDate } from '../utils.ts';
import type {
  tChipTimes,
  tEventRidersResults,
  tEventRidersResults_Ignoring,
  tEvents,
  tEventsCategories,
  tEventsTeams
} from '../model/pmtkTableTypes.ts';

import type { EventCategory } from '../model/eventcategory.ts';
import type { EventParticipant } from '../model/eventparticipant.ts';
import type { GreenFlagRecord } from '../model/flag.ts';
import type { OutreachChipCrossingData } from '../parsers/outreach.ts';
import type { PMTKRiderResultTypes } from "../model/PMTKConversionTypes.ts";
import type { PlateCrossingData } from '../model/platecrossing.ts';
import { accessQueryUsingConnection } from './access.ts';
import type adodb from 'node-adodb';
import { compareByTime } from './timerecord.ts';
import { createGreenFlagEvent } from './flag.ts';
import { formatRFC3339 } from 'date-fns';
import type { uuidv5 as uuid5type } from '../model/types.ts';

export const findCategoryByCode = (
  CategoryCode: string,
  categories: PMTKLookupEventCategory[]
): PMTKLookupEventCategory | undefined => categories.find(cat => cat.CategoryCode === CategoryCode);

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
): Promise<tEventsTeams[]> => accessQueryUsingConnection(
  conn,
  "SELECT * FROM tEventsTeams AS ET WHERE ET.EventID=?;",
  [eventId]
);

export const retrieveEventCategories = (
  conn: adodb.open,
  eventId: number
): Promise<tEventsCategories[]> => accessQueryUsingConnection(
  conn,
  "SELECT * FROM tEventsCategories AS EC WHERE EC.EventID=?;",
  [eventId]
);

export const retrieveChipTimesForDates = (
  conn: adodb.open,
  eventDates: Set<string>
): Promise<tChipTimes[]> => {
  const dateValues = [...eventDates.values()].join(', ');
  return accessQueryUsingConnection<tChipTimes>(
    conn,
    `SELECT * FROM tChipTimes AS CT WHERE CT.ChipTime IN (${dateValues});`,
    []
  );
};

export const retrieveParticipants = (
  conn: adodb.open,
  eventId: number
): Promise<PMTKParticipantsQueryResult[]> => accessQueryUsingConnection<PMTKParticipantsQueryResult>(
  conn,
  "SELECT DISTINCT ER.ID AS RiderID, ER.EventRaceNo AS PlateNumber, ER.TagNo AS TagNo, ER.CategoryCode AS CategoryCode, " +
  "ER.TeamID AS TeamID, StrConv(R.FirstName, 3) AS FirstName, StrConv(R.Surname, 1) As Surname \n" +
  "FROM tEventsRiders AS ER \n" +
  "LEFT JOIN tRiders R ON R.ID = ER.RiderID \n" +
  "WHERE ER.EventID =?;",
  [eventId]
);

const mapDatesFromResultTypes = (results: PMTKRiderResultTypes[]): string[] => {
  const dates = results.map((result: PMTKRiderResultTypes): string|undefined => {
    const datePart = result.CrossLineAtDT.toString().split('T')[0]; // Extract the date part from the datetime string
    try {
      const dateValue = new Date(datePart); // Create a Date object from the date string
      const formattedDate = humanDate(dateValue);
      return formattedDate;
      // eventDates.add(formattedDate);
    } catch (error) {
      console.error('Error parsing date from CrossLineAtDT:', result.CrossLineAtDT, error);
    }
    return undefined;
  }).filter((date: string|undefined): date is string => date !== undefined); // Filter out any error values

  return dates;
};

const retrieveEventRiderResults = (
  conn: adodb.open,
  eventId: number
): Promise<PMTKRiderResultTypes[]> => accessQueryUsingConnection<PMTKRiderResultTypes>(
  conn,
  "SELECT ERR.ID, ERR.EventID, ERR.EventRaceNo, ERR.TagNo, ERR.CrossLineAtDT, ERR.CrossLineAt, ERR.TotalRideTime, ERR.SplitTime, ERR.PosNo, NULL AS ReasonText, FALSE AS IsIgnoring FROM tEventRidersResults AS ERR WHERE ERR.EventID=?\n" +
    "UNION \n" +
    "SELECT ERRI.ID, ERRI.EventID, ERRI.EventRaceNo, ERRI.TagNo, ERRI.CrossLineAtDT, ERRI.CrossLineAt, ERRI.TotalRideTime, ERRI.SplitTime, ERRI.PosNo, ERRI.ReasonText, TRUE AS IsIgnoring FROM tEventRidersResults_Ignoring AS ERRI WHERE ERRI.EventID=?;",
  [eventId, eventId]
);

export const getPMTKEventData = async (conn: adodb.open, eventId: number): Promise<PMTKEventData> => {
  return retrieveEventRiderResults(
    conn,
    eventId
  ).then(async (results: PMTKRiderResultTypes[]) => {
    const eventDatesArr: string[] = mapDatesFromResultTypes(results);
    const eventDates: Set<string> = new Set(eventDatesArr); // Just take unique date values.

    const chipTimes = await retrieveChipTimesForDates(conn, eventDates);
    const participants = await retrieveParticipants(conn, eventId);
    const teams = await retrieveEventTeams(conn, eventId);
    const categories = await retrieveEventCategories(conn, eventId);

    const event = await retrieveEvent(conn, eventId);

    const data: PMTKEventData = {
      categories: categories,
      chipTimes: chipTimes,
      event: event!,
      participants: participants,
      results: results,
      teams: teams,
    };
    return data;
  });
};

const mapCategoryToPMTKLookupEventCategory = (pmcat: tEventsCategories, start: Date): PMTKLookupEventCategory => {
  if (pmcat.TimingAdjustSecs && !isNaN(Number(pmcat.TimingAdjustSecs))) {
    start.setSeconds(start.getSeconds() + Number(pmcat.TimingAdjustSecs));
  }
  const ec: PMTKLookupEventCategory = {
    CategoryCode: pmcat.CategoryCode,
    id: pmcat.ID,
    name: pmcat.CategoryDesc,
    startTime: formatRFC3339(start),
  };
  return ec;
};

export const getEvent = async (
  conn: adodb.open,
  eventId: number,
  source: uuid5type
): Promise<PMTKProcessedEventData> => getPMTKEventData(conn, eventId).then((data: PMTKEventData) => {
  const start = new Date(data.event.StartTime ? data.event.StartTime : data.event.EventDate);
  const categories: PMTKLookupEventCategory[] = data.categories.map((pmcat) => mapCategoryToPMTKLookupEventCategory(pmcat, start));

  const startOffsets = new Set<string>();
  categories.forEach((cat: EventCategory) => {
    if (cat.startTime) {
      startOffsets.add(cat.startTime);
    }
  });

  const categoryStarts: GreenFlagRecord[] = [...startOffsets.values()].map((startTime): GreenFlagRecord => createGreenFlagEvent({
    categoryIds: categories.filter((cat) => cat.startTime === startTime).map((cat) => cat.id),
    time: new Date(startTime),
  }));

  // , source: uuid5type): OutreachChipCrossingData
  const crossings = data.chipTimes.map((ct: tChipTimes) => {
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

  const processedCrossings = data.results.map(
    (pmtkResult: tEventRidersResults | tEventRidersResults_Ignoring, index: number, all: unknown[]) => {
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
          if (!crossing.hexChipCode) {
            delete crossing.hexChipCode;
          }
          crossing.id = createIdHash(source, crossing as OutreachChipCrossingData);
          return crossing as OutreachChipCrossingData;
        } else {
          const passing: Partial<PlateCrossingData> = {
            isExcluded: pmtkResult.IsIgnoring || undefined,
            plateNumber: pmtkResult.EventRaceNo,
            source: source,
            time: crossingDate,
            timeString: formatRFC3339(crossingDate, { fractionDigits: 3 }),
          };
          passing.id = createIdHash(source, passing as PlateCrossingData);
          return passing as PlateCrossingData;
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
  const participants = data.participants.map((participant: PMTKParticipantsQueryResult): EventParticipant => {
    const categoryByCode = findCategoryByCode(participant.CategoryCode, categories);
    
    const p: EventParticipant = {
      categoryId: categoryByCode?.id,
      firstname: participant.FirstName,
      surname: participant.Surname,
    } as EventParticipant;
    const id = participant.ID?.toString() ?? createIdHash(source, p);
    p.id = id;

    if (participant.EventRaceNo) {
      assignParticipantNumber(p, participant.EventRaceNo);
    }

    if (participant.TagNo) {
      assignTransponder(p, participant.TagNo);
    }
    return p;
  });

  const records = [...crossings, ...categoryStarts.values(), ...processedCrossings].filter(p => p !== undefined).sort(compareByTime);
  const result: PMTKProcessedEventData = {
    categories: categories,
    participants: participants,
    records: records,
    // results: data.results,
    teams: data.teams,
  };

  return result;
});

