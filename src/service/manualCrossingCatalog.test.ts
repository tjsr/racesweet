import { type Mock, describe, expect, it, vi } from "vitest";

import {
  dateStringInTimeZone,
  getSystemTimeZone,
  tableTimeStringInTimeZone,
} from "../app/utils/timeutils.js";
import { createSeedEventCatalogLedger } from "../ledger/createSeedEventCatalogLedger.js";
import type { EventCatalogLedger } from "../ledger/eventCatalogLedger.js";
import { createTimeRecordId } from "../model/ids.js";
import type { ManualCrossingInput } from "../model/manualCrossing.js";
import type { ParticipantPassingRecord } from "../model/timerecord.js";
import type { EventCatalogPersistence } from "../persistence/eventCatalogPersistence.js";
import { EventCatalogService } from "./eventCatalogService.js";

const createFixture = (): {
  getSavedLedger: () => EventCatalogLedger;
  onPersistedLedger: Mock<(ledger: EventCatalogLedger) => Promise<void>>;
  persistence: EventCatalogPersistence;
} => {
  let savedLedger: EventCatalogLedger = createSeedEventCatalogLedger();
  const onPersistedLedger: Mock<(ledger: EventCatalogLedger) => Promise<void>> =
    vi.fn(async (_ledger: EventCatalogLedger): Promise<void> => undefined);
  const persistence: EventCatalogPersistence = {
    load: vi.fn(async (): Promise<EventCatalogLedger> => savedLedger),
    save: vi.fn(async (ledger: EventCatalogLedger): Promise<void> => {
      savedLedger = ledger;
    }),
  };
  return {
    getSavedLedger: (): EventCatalogLedger => savedLedger,
    onPersistedLedger,
    persistence,
  };
};

const createInput = (service: EventCatalogService): ManualCrossingInput => {
  const event = service.catalog.events.find(
    (candidate) =>
      candidate.sessionIds.length > 0 && candidate.entrantIds.length > 0,
  )!;
  const session = service.catalog.sessions.find(
    (candidate) => candidate.eventId === event.id,
  )!;
  const instant: Date = new Date("2026-01-01T12:00:01.000Z");
  const timeZone: string = event.timeZone || getSystemTimeZone();
  return {
    entrantId: event.entrantIds[0],
    eventId: event.id,
    identifierKind: "transmitter",
    identifierValue: "1001",
    lineNumber: 1,
    localDate: dateStringInTimeZone(instant, timeZone),
    localTime: tableTimeStringInTimeZone(instant, timeZone),
    sessionId: session.id,
    status: "scored",
    time: instant.toISOString(),
    timeZone,
  };
};

describe("manual crossing catalog flow", (): void => {
  it("records, corrects, reverses, reloads, and retains an immutable audit trail", async (): Promise<void> => {
    const fixture = createFixture();
    const service: EventCatalogService = await EventCatalogService.create(
      fixture.persistence,
      {
        onPersistedLedger: fixture.onPersistedLedger,
      },
    );
    const input: ManualCrossingInput = createInput(service);
    const crossingId: string = createTimeRecordId("manual-catalog-flow");

    await service.recordManualCrossing(input, {
      crossingId,
      mutationId: "manual-catalog-flow-mutation",
    });
    expect(service.catalog.manualCrossings).toContainEqual(
      expect.objectContaining({ crossingId, reversed: false }),
    );
    expect(
      service.getImportedRaceState(input.eventId, input.sessionId)?.records,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: crossingId, isManuallyExcluded: false }),
      ]),
    );
    expect(fixture.onPersistedLedger).toHaveBeenCalledOnce();

    await service.correctManualCrossing(crossingId, {
      ...input,
      time: "2026-01-01T12:00:02.000Z",
      localTime: tableTimeStringInTimeZone(
        new Date("2026-01-01T12:00:02.000Z"),
        input.timeZone,
      ),
    });
    let effectiveRecord: ParticipantPassingRecord = service
      .getImportedRaceState(input.eventId, input.sessionId)
      ?.records?.find(
        (record): boolean => record.id === crossingId,
      ) as ParticipantPassingRecord;
    expect(effectiveRecord.time?.toISOString()).toBe(
      "2026-01-01T12:00:02.000Z",
    );

    await service.reverseManualCrossing(crossingId, "False trigger");
    effectiveRecord = service
      .getImportedRaceState(input.eventId, input.sessionId)
      ?.records?.find(
        (record): boolean => record.id === crossingId,
      ) as ParticipantPassingRecord;
    expect(effectiveRecord.isManuallyExcluded).toBe(true);
    expect(service.catalog.manualCrossings?.[0]?.reversalReason).toBe(
      "False trigger",
    );
    expect(
      fixture
        .getSavedLedger()
        .mutations.filter((mutation): boolean =>
          mutation.type.startsWith("manual-crossing-"),
        ),
    ).toHaveLength(3);
    expect(fixture.onPersistedLedger).toHaveBeenCalledTimes(3);

    const reloaded: EventCatalogService = await EventCatalogService.create(
      fixture.persistence,
    );
    expect(reloaded.catalog.manualCrossings).toEqual(
      service.catalog.manualCrossings,
    );
    expect(
      reloaded
        .getImportedRaceState(input.eventId, input.sessionId)
        ?.records?.filter((record): boolean => record.id === crossingId),
    ).toHaveLength(1);
  });

  it("keeps unknown transmitters unscored until reconciliation and rejects duplicates", async (): Promise<void> => {
    const fixture = createFixture();
    const service: EventCatalogService = await EventCatalogService.create(
      fixture.persistence,
    );
    const known: ManualCrossingInput = createInput(service);
    const unknown: ManualCrossingInput = {
      ...known,
      entrantId: undefined,
      identifierValue: "UNKNOWN-92",
      status: "needs-attention",
    };
    const crossingId: string = createTimeRecordId("unknown-manual-crossing");
    await service.recordManualCrossing(unknown, { crossingId });
    expect(
      (
        service
          .getImportedRaceState(known.eventId, known.sessionId)
          ?.records?.find(
            (record): boolean => record.id === crossingId,
          ) as ParticipantPassingRecord
      ).isManuallyExcluded,
    ).toBe(true);
    await expect(service.recordManualCrossing(unknown)).rejects.toThrow(
      /duplicates/,
    );

    await service.reconcileManualCrossing(crossingId, known.entrantId!);
    expect(
      (
        service
          .getImportedRaceState(known.eventId, known.sessionId)
          ?.records?.find(
            (record): boolean => record.id === crossingId,
          ) as ParticipantPassingRecord
      ).isManuallyExcluded,
    ).toBe(false);
    expect(service.catalog.manualCrossings?.[0]?.status).toBe("scored");
  });

  it("preserves manual records across a refreshed imported snapshot without duplicates", async (): Promise<void> => {
    const fixture = createFixture();
    const service: EventCatalogService = await EventCatalogService.create(
      fixture.persistence,
    );
    const input: ManualCrossingInput = createInput(service);
    const crossingId: string = createTimeRecordId("manual-reimport-crossing");
    await service.recordManualCrossing(input, { crossingId });
    const beforeRefresh = service.getImportedRaceState(
      input.eventId,
      input.sessionId,
    )!;

    await service.updateImportedRaceState(
      input.eventId,
      input.sessionId,
      beforeRefresh,
    );

    expect(
      service
        .getImportedRaceState(input.eventId, input.sessionId)
        ?.records?.filter((record): boolean => record.id === crossingId),
    ).toHaveLength(1);
  });

  it("rolls back a failed write and rejects a crossing from an unrelated session", async (): Promise<void> => {
    const fixture = createFixture();
    const service: EventCatalogService = await EventCatalogService.create(
      fixture.persistence,
    );
    const input: ManualCrossingInput = createInput(service);
    await expect(
      service.recordManualCrossing({ ...input, localTime: "03:00:00" }),
    ).rejects.toThrow(/does not match/);
    await expect(
      service.recordManualCrossing({ ...input, timeZone: "Invalid/Zone" }),
    ).rejects.toThrow(/timezone/);
    await expect(
      service.recordManualCrossing({ ...input, participantId: "not-in-event" }),
    ).rejects.toThrow(/participant is not assigned/);
    const otherSession = service.catalog.sessions.find(
      (candidate) => candidate.eventId !== input.eventId,
    );
    if (otherSession) {
      await expect(
        service.recordManualCrossing({ ...input, sessionId: otherSession.id }),
      ).rejects.toThrow(/belong together/);
    }
    vi.mocked(fixture.persistence.save).mockRejectedValueOnce(
      new Error("disk unavailable"),
    );
    await expect(service.recordManualCrossing(input)).rejects.toThrow(
      "disk unavailable",
    );
    expect(service.catalog.manualCrossings).toEqual([]);
    expect(
      fixture
        .getSavedLedger()
        .mutations.some(
          (mutation): boolean => mutation.type === "manual-crossing-recorded",
        ),
    ).toBe(false);
  });
});
