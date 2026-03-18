import { EventTimeRecord, ParticipantPassingRecord } from "./timerecord.js";

export type AutomaticTimingIdentifiactionCrossing<Node extends string> =
  EventTimeRecord & ParticipantPassingRecord & {
    [K in Node]: number;
  };


