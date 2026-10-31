import { describe, expect, it } from "vitest";

import { createTimeRecordId } from "../model/ids.js";
import type { EffectiveManualCrossing } from "../model/manualCrossing.js";
import {
  type ParticipantPassingRecord,
  isPassingExcluded,
} from "../model/timerecord.js";
import {
  mergeManualCrossingsIntoRaceState,
  toManualCrossingRecord,
} from "./manualCrossings.js";

const crossing: EffectiveManualCrossing = {
  crossingId: createTimeRecordId("manual-processing-test"),
  eventId: "event-test",
  identifierKind: "transmitter",
  identifierValue: "123",
  lastMutationId: "mutation-test",
  lineNumber: 2,
  localDate: "2026-01-01",
  localTime: "12:00:00",
  reversed: false,
  sessionId: "session-test",
  status: "needs-attention",
  time: "2026-01-01T12:00:00.000Z",
  timeZone: "UTC",
};

describe("manual crossing projection", (): void => {
  it("marks unresolved and reversed crossings as excluded from scoring", (): void => {
    const unresolved: ParticipantPassingRecord = toManualCrossingRecord(
      crossing,
      1,
    );
    expect(isPassingExcluded(unresolved)).toBe(true);
    expect(
      toManualCrossingRecord({ ...crossing, status: "scored" }, 2)
        .isManuallyExcluded,
    ).toBe(false);
    expect(
      isPassingExcluded(
        toManualCrossingRecord(
          { ...crossing, reversed: true, status: "scored" },
          3,
        ),
      ),
    ).toBe(true);
  });

  it("replaces an old snapshot copy with one effective record and a manual source", (): void => {
    const oldRecord: ParticipantPassingRecord = toManualCrossingRecord(
      { ...crossing, status: "scored" },
      4,
    );
    const result = mergeManualCrossingsIntoRaceState({ records: [oldRecord] }, [
      crossing,
    ]);
    expect(result.records).toHaveLength(1);
    expect(
      (result.records?.[0] as ParticipantPassingRecord).isManuallyExcluded,
    ).toBe(true);
    expect(result.timeRecordSources).toEqual([
      expect.objectContaining({ name: "Manual entry" }),
    ]);
    expect(
      mergeManualCrossingsIntoRaceState(result, [crossing]).timeRecordSources,
    ).toHaveLength(1);
    expect(mergeManualCrossingsIntoRaceState({}, [])).toEqual({});
  });
});
