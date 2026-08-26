// @vitest-environment jsdom

import { type Root, createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type EventCatalogCategory,
  type EventCatalogSession,
  type SessionStartSequenceItem,
} from "../../catalog/eventCatalog.js";
import { SessionCategoriesPanel } from "./sessionCategories.js";

const categories: EventCatalogCategory[] = [
  {
    code: "A",
    eventId: "event-1",
    id: "category-a",
    name: "Category A",
    teamRules: { teamCompositionRules: [] },
  },
  {
    code: "B",
    eventId: "event-1",
    id: "category-b",
    name: "Category B",
    teamRules: { teamCompositionRules: [] },
  },
];
const session: EventCatalogSession = {
  categoryIds: ["category-a", "category-b"],
  eventId: "event-1",
  id: "session-1",
  kind: "race",
  name: "Race",
  scheduledStart: "2026-08-24T09:00:00.000Z",
  status: "draft",
};

describe("SessionCategoriesPanel", () => {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach(() => {
    vi.useRealTimers();
    root?.unmount();
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it("adds, edits, and reorders start waves and categories while preserving a category after every wave", async () => {
    vi.useFakeTimers();
    const onSaveStartSequence =
      vi.fn<(sequence: SessionStartSequenceItem[]) => void>();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    flushSync(() =>
      root?.render(
        <SessionCategoriesPanel
          categories={categories}
          eventSessions={[session]}
          onRemoveCategoryFromSession={vi.fn()}
          onSaveStartSequence={onSaveStartSequence}
          selectedSession={session}
        />,
      ),
    );
    expect(container.textContent).toContain("Scratch");

    const addWaveButton = container.querySelector(
      'button[aria-label="Add start wave before Category B"]',
    ) as HTMLButtonElement;
    flushSync(() => addWaveButton.click());
    const addedSequence = onSaveStartSequence.mock.calls[0]![0];
    expect(addedSequence).toEqual([
      { categoryId: "category-a", type: "category" },
      expect.objectContaining({ offset: "00:00:00", type: "start-wave" }),
      { categoryId: "category-b", type: "category" },
    ]);

    const waveSession: EventCatalogSession = {
      ...session,
      startSequence: addedSequence,
    };
    flushSync(() =>
      root?.render(
        <SessionCategoriesPanel
          categories={categories}
          eventSessions={[waveSession]}
          onRemoveCategoryFromSession={vi.fn()}
          onSaveStartSequence={onSaveStartSequence}
          selectedSession={waveSession}
        />,
      ),
    );
    const offsetInput = container.querySelector(
      'input[aria-label="Start wave offset"]',
    ) as HTMLInputElement;
    flushSync(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(offsetInput, "00:01:30");
      offsetInput.dispatchEvent(new Event("input", { bubbles: true }));
      offsetInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onSaveStartSequence).toHaveBeenLastCalledWith([
      { categoryId: "category-a", type: "category" },
      expect.objectContaining({ offset: "00:01:30", type: "start-wave" }),
      { categoryId: "category-b", type: "category" },
    ]);

    const waveBlock = container.querySelector(
      ".session-start-wave:not(.scratch-start-wave)",
    ) as HTMLDivElement;
    const firstDropZone = container.querySelector(
      ".session-sequence-drop-zone",
    ) as HTMLDivElement;
    flushSync(() => {
      waveBlock.dispatchEvent(new Event("dragstart", { bubbles: true }));
      firstDropZone.dispatchEvent(new Event("dragover", { bubbles: true }));
    });
    flushSync(() => vi.advanceTimersByTime(110));
    const previewWaveBlock = container.querySelector(
      ".session-start-wave:not(.scratch-start-wave)",
    ) as HTMLDivElement;
    const previewCategoryCard = Array.from(
      container.querySelectorAll(".events-list-item"),
    ).find((card) =>
      card.textContent?.includes("Category A"),
    ) as HTMLDivElement;
    expect(
      previewWaveBlock.compareDocumentPosition(previewCategoryCard) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(onSaveStartSequence).toHaveBeenCalledTimes(2);
    flushSync(() => {
      firstDropZone.dispatchEvent(new Event("drop", { bubbles: true }));
    });
    expect(onSaveStartSequence).toHaveBeenLastCalledWith([
      expect.objectContaining({ type: "start-wave" }),
      { categoryId: "category-a", type: "category" },
      { categoryId: "category-b", type: "category" },
    ]);
    const persistedWaveBlock = container.querySelector(
      ".session-start-wave:not(.scratch-start-wave)",
    ) as HTMLDivElement;
    const persistedCategoryCard = Array.from(
      container.querySelectorAll(".events-list-item"),
    ).find((card) =>
      card.textContent?.includes("Category A"),
    ) as HTMLDivElement;
    expect(
      persistedWaveBlock.compareDocumentPosition(persistedCategoryCard) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    flushSync(() =>
      root?.render(
        <SessionCategoriesPanel
          categories={categories}
          eventSessions={[waveSession]}
          onRemoveCategoryFromSession={vi.fn()}
          onSaveStartSequence={onSaveStartSequence}
          selectedSession={waveSession}
        />,
      ),
    );
    const categoryCard = Array.from(
      container.querySelectorAll(".events-list-item"),
    ).find((card) => card.textContent?.includes("Category A"));
    const categoryBlock = categoryCard?.parentElement as HTMLDivElement;
    const dropZones = container.querySelectorAll(".session-sequence-drop-zone");
    const finalDropZone = dropZones[dropZones.length - 1] as HTMLDivElement;
    flushSync(() => {
      categoryBlock.dispatchEvent(new Event("dragstart", { bubbles: true }));
      finalDropZone.dispatchEvent(new Event("dragover", { bubbles: true }));
    });
    flushSync(() => vi.advanceTimersByTime(110));
    flushSync(() => {
      finalDropZone.dispatchEvent(new Event("drop", { bubbles: true }));
    });
    expect(onSaveStartSequence).toHaveBeenLastCalledWith([
      expect.objectContaining({ type: "start-wave" }),
      { categoryId: "category-b", type: "category" },
      { categoryId: "category-a", type: "category" },
    ]);

    const removeCategory = container.querySelector(
      'button[aria-label="Remove Category B from session"]',
    ) as HTMLButtonElement;
    removeCategory.click();
  });
});
