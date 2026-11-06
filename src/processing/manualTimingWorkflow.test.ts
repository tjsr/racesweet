import { describe, expect, it } from "vitest";

import { createSeedEventCatalogLedger } from "../ledger/createSeedEventCatalogLedger.js";
import { applyEventCatalogLedger } from "../ledger/eventCatalogLedger.js";
import { createEventEntrantId, createEventId, createSessionId } from '../model/ids.js';
import type { EventCatalogEntrant, EventCatalogState } from '../catalog/eventCatalog.js';
import type { ParticipantTransponder } from '../model/eventparticipant.js';
import {
  getManualTimingIdentities,
  getManualTimingInstants,
  parseSpokenTimingIdentifier,
  resolveManualTimingIdentifier,
} from "./manualTimingWorkflow.js";

describe("manual timing input resolution", (): void => {
  it('keeps duplicate identifiers ambiguous inside one session and excludes a matching person in another real event', (): void => {
    const catalog: EventCatalogState = applyEventCatalogLedger(createSeedEventCatalogLedger());
    const first: EventCatalogEntrant = catalog.entrants[0]!;
    const selectedSessionId: string = first.sessionIds![0]!;
    const otherEventId: string = createEventId('manual-identity-other-event');
    const otherSessionId: string = createSessionId('manual-identity-other-session');
    const firstId: string = first.id;
    const duplicateId: string = createEventEntrantId('manual-identity-duplicate');
    const outsiderId: string = createEventEntrantId('manual-identity-outsider');
    const transponder: ParticipantTransponder = { txNo: 42, fromTime: undefined, toTime: undefined };
    const identifiers: NonNullable<EventCatalogEntrant['identifiers']> = [transponder];
    catalog.entrants[0] = { ...first, identifiers };
    catalog.events.push({ ...catalog.events[0]!, entrantIds: [outsiderId], id: otherEventId, name: 'Other meeting', sessionIds: [otherSessionId] });
    catalog.sessions.push({ ...catalog.sessions[0]!, eventId: otherEventId, id: otherSessionId, name: 'Other race' });
    catalog.entrants.push(
      { ...first, id: duplicateId, identifiers, name: 'Another local person' },
      { ...first, eventId: otherEventId, id: outsiderId, identifiers, name: 'Same number in another meeting', sessionIds: [otherSessionId] },
    );
    expect(resolveManualTimingIdentifier(catalog, first.eventId, selectedSessionId, 'transmitter', ' 42 ')
      .map((identity): string => identity.entrantId).sort()).toEqual([firstId, duplicateId].sort());
    expect(resolveManualTimingIdentifier(catalog, otherEventId, otherSessionId, 'transmitter', '42')
      .map((identity): string => identity.entrantId)).toEqual([outsiderId]);
    expect(resolveManualTimingIdentifier(catalog, first.eventId, selectedSessionId, 'transmitter', '4')).toEqual([]);
  });

  it("matches exact normalized identifiers only inside the selected event and session", (): void => {
    const catalog = applyEventCatalogLedger(createSeedEventCatalogLedger());
    const entrant = catalog.entrants[0]!;
    const sessionId: string = entrant.sessionIds![0]!;
    entrant.identifiers = [
      {
        racePlate: " AB-12 ",
        fromTime: undefined,
        toTime: undefined,
      } as NonNullable<typeof entrant.identifiers>[number],
    ];
    expect(
      getManualTimingIdentities(catalog, entrant.eventId, sessionId),
    ).toHaveLength(1);
    expect(
      resolveManualTimingIdentifier(
        catalog,
        entrant.eventId,
        sessionId,
        "plate",
        "ab-12",
      ),
    ).toMatchObject([{ entrantId: entrant.id }]);
    expect(
      resolveManualTimingIdentifier(
        catalog,
        entrant.eventId,
        sessionId,
        "plate",
        "AB",
      ),
    ).toEqual([]);
    expect(
      resolveManualTimingIdentifier(
        catalog,
        "other-event",
        sessionId,
        "plate",
        "ab-12",
      ),
    ).toEqual([]);
    expect(
      resolveManualTimingIdentifier(
        catalog,
        entrant.eventId,
        "other-session",
        "plate",
        "ab-12",
      ),
    ).toEqual([]);
  });
  it("rejects DST gaps and enumerates repeated and non-hour local times", (): void => {
    expect(
      getManualTimingInstants("2026-10-04", "02:30:00", "Australia/Sydney"),
    ).toEqual([]);
    expect(
      getManualTimingInstants("2026-04-05", "02:30:00", "Australia/Sydney"),
    ).toEqual(["2026-04-04T15:30:00.000Z", "2026-04-04T16:30:00.000Z"]);
    expect(
      getManualTimingInstants("2026-06-01", "12:00:00.125", "Asia/Kathmandu"),
    ).toEqual(["2026-06-01T06:15:00.125Z"]);
    expect(getManualTimingInstants("invalid", "now", "UTC")).toEqual([]);
  });
  it("proposes spoken digits and explicit corrections without submitting them", (): void => {
    expect(parseSpokenTimingIdentifier("one two double three")).toBe("1233");
    expect(
      parseSpokenTimingIdentifier("four five correction six seven eight"),
    ).toBe("678");
    expect(parseSpokenTimingIdentifier("A one oh two")).toBe("A102");
    expect(parseSpokenTimingIdentifier("one hundred and twenty three")).toBe(
      "123",
    );
  });
});
