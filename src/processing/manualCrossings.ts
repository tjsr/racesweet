import { createTimeRecordSourceId } from "../model/ids.js";
import type { EffectiveManualCrossing } from "../model/manualCrossing.js";
import type { RaceState } from "../model/racestate.js";
import {
  type ParticipantPassingRecord,
  RECORD_TX_CROSSING,
  type TimeRecord,
} from "../model/timerecord.js";

const MANUAL_SOURCE_ID = createTimeRecordSourceId("manual-entry");

export const toManualCrossingRecord = (
  crossing: EffectiveManualCrossing,
  sequence: number,
): ParticipantPassingRecord => {
  const record: ParticipantPassingRecord & {
    chipCode?: number;
    plateNumber?: string;
  } = {
    entrantId: crossing.entrantId,
    eventId: crossing.eventId,
    id: crossing.crossingId,
    isManuallyExcluded:
      crossing.reversed || crossing.status === "needs-attention",
    lineNumber: crossing.lineNumber,
    loopNumber: crossing.loopNumber,
    participantId: crossing.participantId,
    recordType: RECORD_TX_CROSSING,
    sequence,
    sessionId: crossing.sessionId,
    source: MANUAL_SOURCE_ID,
    time: new Date(crossing.time),
  };
  if (
    crossing.identifierKind === "chip" ||
    crossing.identifierKind === "transmitter"
  ) {
    const chipCode: number = Number(crossing.identifierValue);
    if (Number.isSafeInteger(chipCode) && chipCode >= 0) {
      record.chipCode = chipCode;
    }
  }
  if (crossing.identifierKind === "plate") {
    record.plateNumber = crossing.identifierValue;
  }
  return record;
};

export const mergeManualCrossingsIntoRaceState = (
  raceState: Partial<RaceState>,
  crossings: EffectiveManualCrossing[],
): Partial<RaceState> => {
  if (crossings.length === 0) {
    return raceState;
  }
  const manualIds: Set<string> = new Set<string>(
    crossings.map(
      (crossing: EffectiveManualCrossing): string => crossing.crossingId,
    ),
  );
  const importedRecords: TimeRecord[] = (raceState.records || []).filter(
    (record: TimeRecord): boolean => !manualIds.has(record.id),
  );
  const nextSequence: number = importedRecords.reduce(
    (maximum: number, record: TimeRecord): number =>
      Math.max(
        maximum,
        (record as Partial<ParticipantPassingRecord>).sequence || 0,
      ),
    0,
  );
  return {
    ...raceState,
    records: [
      ...importedRecords,
      ...crossings.map(
        (
          crossing: EffectiveManualCrossing,
          index: number,
        ): ParticipantPassingRecord =>
          toManualCrossingRecord(crossing, nextSequence + index + 1),
      ),
    ],
    timeRecordSources: (raceState.timeRecordSources || []).some(
      (source): boolean => source.id === MANUAL_SOURCE_ID,
    )
      ? raceState.timeRecordSources
      : [
          ...(raceState.timeRecordSources || []),
          { id: MANUAL_SOURCE_ID, name: "Manual entry" },
        ],
  };
};
