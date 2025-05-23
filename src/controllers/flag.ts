import type { FlagEvent, GreenFlagEvent } from '../model/flag.ts';
import { v1 as uuid1, v5 as uuid5 } from 'uuid';

import type { TimeEvent } from "../model/timeevent.ts";

const FLAG_NAMESPACE = uuid5('flag', '00000000-0000-0000-0000-000000000000');

const createFlagEvent = <F extends FlagEvent>(event: Partial<F>): F => {
  const newEvent: Partial<F> = {
    ...event,
    id: event.id || uuid5(uuid1(), FLAG_NAMESPACE),
    source: event.source || 'flag',
    time: event.time || new Date(),
  };
  return newEvent as F;
};

export const createGreenFlagEvent = (event: Partial<GreenFlagEvent>): GreenFlagEvent => {
  const green: Partial<GreenFlagEvent> = {
    ...createFlagEvent(event),
    flagType: 'green',
    // flagValue: "course",
  };

  return green as GreenFlagEvent;
};
//   const newFlagEvent = createFlagEvent(event);
//   const flagEventId = newFlagEvent.id;
//   const flagEventSource = newFlagEvent.source;
//   const flagEventTime = newFlagEvent.time;

// };

export const addFlagEvent = async (event: TimeEvent): Promise<TimeEvent> => {
  // Assuming you have a function to save the event to a database or data store
  await saveFlagEventToDatabase(newFlagEvent);

  return newFlagEvent;
};
