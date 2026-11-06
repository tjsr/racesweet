// @vitest-environment jsdom
import React, { act } from "react";

import { type Root, createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EventCatalogState } from "../../catalog/eventCatalog.js";
import { createSeedEventCatalogLedger } from "../../ledger/createSeedEventCatalogLedger.js";
import type { EventCatalogLedger } from "../../ledger/eventCatalogLedger.js";
import type { ManualCrossingCommand } from "../../model/manualCrossing.js";
import type { ManualCrossingOutboxState } from "../../persistence/manualCrossingOutboxPersistence.js";
import { EventCatalogService } from "../../service/eventCatalogService.js";
import { createManualTimingOutbox } from "../../service/manualTimingRuntime.js";
import { ManualTimingPanel } from "./ManualTimingPanel.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const click = (label: string): void => {
  const button: HTMLButtonElement | undefined = [
    ...document.querySelectorAll<HTMLButtonElement>("button"),
  ].find(
    (candidate: HTMLButtonElement): boolean =>
      candidate.textContent?.trim() === label,
  );
  if (!button) throw new Error(`Missing button ${label}`);
  button.click();
};
const input = (label: string): HTMLInputElement => {
  const element: HTMLLabelElement | undefined = [
    ...document.querySelectorAll<HTMLLabelElement>("label"),
  ].find(
    (candidate: HTMLLabelElement): boolean =>
      candidate.textContent?.startsWith(label) === true,
  );
  return document.getElementById(element!.htmlFor) as HTMLInputElement;
};
const enter = (label: string, value: string): void => {
  const field: HTMLInputElement = input(label);
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
};

describe("Manual Timing operator workflow", (): void => {
  let root: Root;
  let container: HTMLDivElement;
  afterEach(async (): Promise<void> => {
    if (root) await act(async (): Promise<void> => root.unmount());
    container?.remove();
    vi.unstubAllGlobals();
  });
  it("uses the same durable workflow in Quick Entry, confirms speech, submits, corrects and reverses with API acknowledgements", async (): Promise<void> => {
    let ledger: EventCatalogLedger = createSeedEventCatalogLedger();
    const onPersistedLedger = vi.fn(async (): Promise<void> => undefined);
    const service: EventCatalogService = await EventCatalogService.create(
      {
        load: async (): Promise<EventCatalogLedger> => ledger,
        save: async (next: EventCatalogLedger): Promise<void> => {
          ledger = next;
        },
      },
      { onPersistedLedger },
    );
    const event = service.catalog.events[0]!;
    const session = service.catalog.sessions.find((candidate): boolean => candidate.kind === 'race')!;
    const entrant = service.catalog.entrants[0]!;
    await service.updateEntrant(entrant.id, { identifiers: [{ fromTime: undefined, toTime: undefined, txNo: '1001' } as NonNullable<typeof entrant.identifiers>[number]] });
    let saved: ManualCrossingOutboxState = { items: [], quarantined: [] };
    const submitted: ManualCrossingCommand[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit): Promise<Response> => {
        const command: ManualCrossingCommand = JSON.parse(
          init.body as string,
        ) as ManualCrossingCommand;
        submitted.push(command);
        return new Response(
          JSON.stringify({
            crossingId: command.crossingId,
            mutationId: command.mutationId,
            status: "accepted",
          }),
        );
      }),
    );
    let update: React.Dispatch<
      React.SetStateAction<EventCatalogState>
    > = (): void => undefined;
    const outbox = createManualTimingOutbox(
      service,
      {
        load: async (): Promise<ManualCrossingOutboxState> => saved,
        save: async (state: ManualCrossingOutboxState): Promise<void> => {
          saved = structuredClone(state);
        },
      },
      (catalog: EventCatalogState): void => update(catalog),
    );
    await outbox.initialize();
    const Harness = (): React.ReactElement => {
      const [catalog, setCatalog] = React.useState<EventCatalogState>(
        service.catalog,
      );
      update = setCatalog;
      return (
        <ManualTimingPanel
          catalog={catalog}
          eventId={event.id}
          sessionId={session.id}
          checkpoints={[{ label: "Finish", lineNumber: 1, progress: 1 }]}
          outbox={outbox}
          speech={{
            available: true,
            listen: async (): Promise<string> => "one two three",
            stop: (): void => undefined,
          }}
        />
      );
    };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async (): Promise<void> => root.render(<Harness />));
    await act(async (): Promise<void> => click("Quick Entry"));
    await act(async (): Promise<void> => click("Speak identifier"));
    expect(document.body.textContent).toContain("Proposed identifier: 123");
    expect(
      (
        document.querySelector(
          "button.MuiButton-contained",
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await act(async (): Promise<void> => click("Confirm spoken identifier"));
    await act(async (): Promise<void> => {
      enter("Event-local date", "2026-06-12");
      enter("Event-local time", "12:00:00.000");
    });
    await act(async (): Promise<void> => click("Submit / Next"));
    expect(submitted).toHaveLength(1);
    expect(saved.items[0]).toMatchObject({ status: "needs-attention" });
    expect(service.catalog.manualCrossings?.[0]).toMatchObject({
      entryMethod: "voice",
      identifierValue: "123",
      status: "needs-attention",
    });
    expect(input("Manual identifier").value).toBe("");
    expect(onPersistedLedger).toHaveBeenCalled();
    await act(async (): Promise<void> => {
      const field: HTMLInputElement = input('Resolve manual entrant');
      field.focus();
      field.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
    });
    const option: HTMLElement = document.querySelector<HTMLElement>('[role="option"]')!;
    expect(option).toBeTruthy();
    await act(async (): Promise<void> => option.click());
    await act(async (): Promise<void> => click('Reconcile crossing'));
    expect(submitted[1]?.action).toBe('reconcile');
    expect(service.catalog.manualCrossings?.[0]).toMatchObject({ entrantId: entrant.id, status: 'scored' });
    expect(service.getImportedRaceState(event.id, session.id)?.records).toContainEqual(expect.objectContaining({ id: submitted[0]?.crossingId, isManuallyExcluded: false }));
    await act(async (): Promise<void> => click("Correct crossing"));
    await act(async (): Promise<void> =>
      enter("Event-local time", "12:00:01.000"),
    );
    await act(async (): Promise<void> => click("Save correction / Next"));
    expect(submitted[2]?.action).toBe("correct");
    await act(async (): Promise<void> =>
      enter("Reversal reason", "False trigger"),
    );
    await act(async (): Promise<void> => click("Reverse crossing"));
    expect(service.catalog.manualCrossings?.[0]?.reversed).toBe(true);
    expect(submitted[3]?.action).toBe("reverse");
    expect(
      ledger.mutations.filter((mutation): boolean =>
        mutation.type.startsWith("manual-crossing"),
      ),
    ).toHaveLength(4);
    await act(async (): Promise<void> => click("Close Quick Entry"));
    await act(async (): Promise<void> => click('Manual Time Entry'));
    await act(async (): Promise<void> => {
      click('1');
      click('0');
      click('0');
      click('1');
    });
    // Each keypad key is an ordinary controlled update; enter the complete value after batching clicks.
    await act(async (): Promise<void> => enter('Manual identifier', '1001'));
    await act(async (): Promise<void> => {
      enter('Event-local date', '2026-06-12');
      enter('Event-local time', '12:00:02.000');
    });
    await act(async (): Promise<void> => click('Submit / Next'));
    expect(submitted[4]?.crossing).toMatchObject({ entrantId: entrant.id, status: 'scored' });
  });
});
