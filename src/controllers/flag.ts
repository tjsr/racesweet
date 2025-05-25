import { EVENT_FLAG_DISPLAYED, type TimeEvent } from "../model/timeevent.ts";
import type { FlagEvent, GreenFlagEvent } from '../model/flag.ts';
import { v1 as uuid1, v5 as uuid5 } from 'uuid';

import type { EventParticipantId } from '../model/eventparticipant.ts';
import { getTimeEventIdentifier } from './timeevent.ts';

const FLAG_NAMESPACE = uuid5('flag', '00000000-0000-0000-0000-000000000000');
const EVENT_FLAG_GREEN = 

const createFlagEvent = <F extends FlagEvent>(event: Partial<F>): F => {
  const newEvent: Partial<F> = {
    ...event,
    eventType: (event.eventType || 0) & EVENT_FLAG_DISPLAYED,
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

export const isFlagEvent = (event: TimeEvent): event is FlagEvent => {
  return (event as FlagEvent).flagType !== undefined;
};


class InvalidParticipantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidParticipantError';
  }
}

export const addFlagEvent = (laps: Map<EventParticipantId, TimeEvent[]>, participantId: EventParticipantId, flagTime: FlagEvent): void => {
  if (!participantId) {
    throw new InvalidParticipantError(`Flag event for ${getTimeEventIdentifier(flagTime)} has no participant ID`);
  }
  if (!laps.has(participantId)) {
    laps.set(participantId, []);
  }
  const participantLaps = laps.get(participantId)!;
  participantLaps.push(flagTime);
};

