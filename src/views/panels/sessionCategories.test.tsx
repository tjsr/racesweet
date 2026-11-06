// @vitest-environment jsdom

import React, { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type EventCatalogSession,
  type EventCatalogState,
  type SessionStartSequenceItem,
} from "../../catalog/eventCatalog.js";
import { createSeedEventCatalogLedger } from "../../ledger/createSeedEventCatalogLedger.js";
import { type EventCatalogLedger } from "../../ledger/eventCatalogLedger.js";
import { type EventCatalogPersistence } from "../../persistence/eventCatalogPersistence.js";
import { EventCatalogService } from "../../service/eventCatalogService.js";
import {
  SessionCategoriesPanel,
  defaultStartWaveTimeOfDay,
  formatStartWaveOffset,
  parseStartWaveOffsetSeconds,
} from "./sessionCategories.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("SessionCategoriesPanel", (): void => {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;
  afterEach((): void => {
    act((): void => root?.unmount());
    container?.remove();
  });

  it("accepts start-wave offsets in seconds or minutes:seconds and derives a later event-local time of day", (): void => {
    expect(parseStartWaveOffsetSeconds("60")).toBe(60);
    expect(parseStartWaveOffsetSeconds("1:30")).toBe(90);
    expect(parseStartWaveOffsetSeconds("PT1M")).toBe(60);
    expect(parseStartWaveOffsetSeconds("1:60")).toBeUndefined();
    expect(formatStartWaveOffset(60)).toBe("60");
    expect(formatStartWaveOffset(90)).toBe("1:30");
    expect(
      defaultStartWaveTimeOfDay(
        {
          categoryIds: [],
          eventId: "event",
          id: "session",
          kind: "race",
          name: "Race",
          scheduledStart: "2026-05-29T00:00:00.000Z",
          status: "scheduled",
        },
        "Australia/Sydney",
        "60",
      ),
    ).toBe("10:01:00");
  });

  it("inserts, edits and reorders start waves through one persisted catalog callback and restores failed changes", async (): Promise<void> => {
    let saved: EventCatalogLedger = createSeedEventCatalogLedger();
    const persistence: EventCatalogPersistence = {
      load: (): Promise<EventCatalogLedger> => Promise.resolve(saved),
      save: (ledger: EventCatalogLedger): Promise<void> => {
        saved = ledger;
        return Promise.resolve();
      },
    };
    const callback = vi
      .fn<(_ledger: EventCatalogLedger) => Promise<void>>()
      .mockResolvedValue(undefined);
    const service: EventCatalogService = await EventCatalogService.create(
      persistence,
      { onPersistedLedger: callback },
    );
    const session: EventCatalogSession = service.catalog.sessions[0]!;
    const categoryIds: string[] = service.catalog.categories.map(
      (category): string => category.id,
    );
    await service.updateSession(session.id, { categoryIds });
    callback.mockClear();
    const Harness = (): React.ReactElement => {
      const [catalog, setCatalog] = React.useState<EventCatalogState>(
        service.catalog,
      );
      return (
        <SessionCategoriesPanel
          categories={catalog.categories}
          eventSessions={catalog.sessions}
          eventTimeZone="Australia/Sydney"
          onRemoveCategoryFromSession={vi.fn()}
          onSaveStartSequence={(
            sequence: SessionStartSequenceItem[],
          ): Promise<void> =>
            service
              .updateSession(session.id, { startSequence: sequence })
              .then((next: EventCatalogState): void => setCatalog(next))
          }
          selectedSession={catalog.sessions.find(
            (candidate: EventCatalogSession): boolean =>
              candidate.id === session.id,
          )}
        />
      );
    };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async (): Promise<void> => root?.render(<Harness />));
    expect(container.textContent).toContain("Scratch");
    const secondCategoryName: string = service.catalog.categories[1]!.name;
    const add: HTMLButtonElement = container.querySelector(
      `button[aria-label="Add start wave before ${secondCategoryName}"]`,
    )!;
    await act(async (): Promise<void> => add.click());
    const sequence: SessionStartSequenceItem[] = service.catalog.sessions.find(
      (candidate: EventCatalogSession): boolean => candidate.id === session.id,
    )!.startSequence!;
    expect(sequence).toEqual([
      { categoryId: categoryIds[0], type: "category" },
      expect.objectContaining({ offset: "60", type: "start-wave" }),
      { categoryId: categoryIds[1], type: "category" },
    ]);
    expect(callback).toHaveBeenCalledTimes(1);
    const offset: HTMLInputElement = container.querySelector(
      'input[aria-label="Start wave offset"]',
    )!;
    await act(async (): Promise<void> => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(offset, "1:30");
      offset.dispatchEvent(new Event("input", { bubbles: true }));
      offset.dispatchEvent(new Event("blur", { bubbles: true }));
    });
    expect(
      service.catalog.sessions.find(
        (candidate: EventCatalogSession): boolean =>
          candidate.id === session.id,
      )?.startSequence,
    ).toEqual([
      expect.any(Object),
      expect.objectContaining({ offset: "1:30" }),
      expect.any(Object),
    ]);
    const timeOfDayButton: HTMLButtonElement = container.querySelector(
      'button[value="time-of-day"]',
    )!;
    await act(async (): Promise<void> => timeOfDayButton.click());
    const startTime: HTMLInputElement = container.querySelector(
      'input[aria-label="Start wave time of day"]',
    )!;
    expect(startTime.value).toBe(
      defaultStartWaveTimeOfDay(session, "Australia/Sydney", "1:30"),
    );
    expect(container.textContent).toContain(
      "Event local time (Australia/Sydney)",
    );
    expect(
      service.catalog.sessions.find(
        (candidate: EventCatalogSession): boolean =>
          candidate.id === session.id,
      )?.startSequence,
    ).toEqual([
      expect.any(Object),
      expect.objectContaining({ offset: "1:30", timeOfDay: startTime.value }),
      expect.any(Object),
    ]);
    const move: HTMLButtonElement = container.querySelector(
      'button[aria-label="Move Start wave up"]',
    )!;
    await act(async (): Promise<void> => move.click());
    expect(
      service.catalog.sessions.find(
        (candidate: EventCatalogSession): boolean =>
          candidate.id === session.id,
      )?.startSequence?.[0]?.type,
    ).toBe("start-wave");
    expect(callback).toHaveBeenCalledTimes(4);
    const reopened: EventCatalogService =
      await EventCatalogService.create(persistence);
    expect(
      reopened.catalog.sessions.find(
        (candidate: EventCatalogSession): boolean =>
          candidate.id === session.id,
      )?.startSequence,
    ).toEqual(
      service.catalog.sessions.find(
        (candidate: EventCatalogSession): boolean =>
          candidate.id === session.id,
      )?.startSequence,
    );
  });

  it("uses a compact destructive remove button and requires confirmation", async (): Promise<void> => {
    const ledger: EventCatalogLedger = createSeedEventCatalogLedger();
    const persistence: EventCatalogPersistence = {
      load: (): Promise<EventCatalogLedger> => Promise.resolve(ledger),
      save: (): Promise<void> => Promise.resolve(),
    };
    const service: EventCatalogService =
      await EventCatalogService.create(persistence);
    const session: EventCatalogSession = service.catalog.sessions[0]!;
    const category = service.catalog.categories[0]!;
    await service.updateSession(session.id, { categoryIds: [category.id] });
    const remove: ReturnType<typeof vi.fn<(categoryId: string) => void>> =
      vi.fn<(categoryId: string) => void>();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async (): Promise<void> =>
      root?.render(
        <SessionCategoriesPanel
          categories={service.catalog.categories}
          eventSessions={service.catalog.sessions}
          onRemoveCategoryFromSession={remove}
          onSaveStartSequence={vi.fn()}
          selectedSession={service.catalog.sessions.find(
            (candidate: EventCatalogSession): boolean =>
              candidate.id === session.id,
          )}
        />,
      ),
    );
    const removeButton: HTMLButtonElement = container.querySelector(
      `button[aria-label="Remove ${category.name} from session"]`,
    )!;
    expect(removeButton.textContent).toBe("Remove");
    expect(removeButton.className).toContain("MuiButton-colorError");
    expect(removeButton.getAttribute("aria-label")).toBe(
      `Remove ${category.name} from session`,
    );
    await act(async (): Promise<void> => removeButton.click());
    expect(remove).not.toHaveBeenCalled();
    const dialog: HTMLElement = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Remove category from session?");
    const confirm: HTMLButtonElement = dialog.querySelector(
      'button[aria-label="Confirm removal from session"]',
    )!;
    await act(async (): Promise<void> => confirm.click());
    expect(remove).toHaveBeenCalledWith(category.id);
  });
});
