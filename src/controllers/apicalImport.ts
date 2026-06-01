import { v5 as uuidv5 } from 'uuid';
import type { ApicalEventListResponse, ApicalEventResponseEventData, ApicalLapByCategory } from '../model/apical.ts';
import type { RaceEvent } from '../model/raceevent.ts';
import type { EventId } from '../model/types.ts';
import type { RaceState } from '../model/racestate.ts';
import { getApicalEventList } from '../utils/apical/apicalEventList.ts';
import { convertDataToRaceState } from '../parsers/apical.ts';

const APICAL_EVENT_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

export interface ImportedEventData {
  event: RaceEvent;
  raceState: Partial<RaceState>;
}

export const apicalEventToRaceEvent = (event: ApicalEventResponseEventData): RaceEvent => ({
  apicalId: event.Id,
  companyName: event.CompanyName,
  date: event.EventDate,
  id: uuidv5(event.Id.toString(), APICAL_EVENT_NAMESPACE) as EventId,
  name: event.Name,
});

const getApicalEventDataUrl = (eventId: number): string =>
  `https://apicalracetiming.com.au/RaceResult/Lap/GetAllByCategoryForEvent?eventId=${eventId}&_=${Date.now()}`;

export const fetchApicalEventData = (eventId: number): Promise<ApicalLapByCategory> =>
  fetch(getApicalEventDataUrl(eventId))
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to fetch event data for event ${eventId}: ${response.statusText}`);
      }
      return response.json() as Promise<ApicalLapByCategory>;
    });

export const importAllApicalEvents = async (
  existingApicalIds: Set<number>
): Promise<ImportedEventData[]> => {
  const eventList: ApicalEventListResponse = await getApicalEventList();
  const newApicalEvents = eventList.filter((e) => !existingApicalIds.has(e.Id));

  const results: ImportedEventData[] = [];

  for (const apicalEvent of newApicalEvents) {
    const event = apicalEventToRaceEvent(apicalEvent);
    let raceState: Partial<RaceState> = {};

    try {
      const eventData = await fetchApicalEventData(apicalEvent.Id);
      raceState = convertDataToRaceState(event.id, new Date(apicalEvent.EventDate), eventData);
    } catch (err) {
      console.error(`Failed to fetch race data for event ${apicalEvent.Id} (${apicalEvent.Name}):`, err);
    }

    results.push({ event, raceState });
  }

  return results;
};
