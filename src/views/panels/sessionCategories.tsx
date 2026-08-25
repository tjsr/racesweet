import React from "react";
import { Button, IconButton, SvgIcon, TextField } from "@mui/material";
import {
  type EventCatalogCategory,
  type EventCatalogSession,
  type SessionStartSequenceItem,
  getSessionAssignedCategoryIds,
  getSessionStartSequence,
} from "../../catalog/eventCatalog.js";
import { CategoryListCard } from "../../controls/categoryListCard.js";
import { type EventCategoryId } from "../../model/eventcategory.js";

interface SessionCategoriesPanelProps {
  categories: EventCatalogCategory[];
  eventSessions: EventCatalogSession[];
  onRemoveCategoryFromSession: (
    categoryId: EventCategoryId,
  ) => void | Promise<void>;
  onSaveStartSequence: (
    startSequence: SessionStartSequenceItem[],
  ) => void | Promise<void>;
  selectedSession?: EventCatalogSession;
}

const isActiveCategory = (category: EventCatalogCategory): boolean =>
  category.deleted !== true;
const isValidStartSequence = (sequence: SessionStartSequenceItem[]): boolean =>
  sequence.every(
    (item, index) =>
      item.type !== "start-wave" ||
      sequence
        .slice(index + 1)
        .some((nextItem) => nextItem.type === "category"),
  );

const createStartWave = (): SessionStartSequenceItem => ({
  id: `start-wave-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  offset: "00:00:00",
  type: "start-wave",
});

const moveSequenceItem = (
  sequence: SessionStartSequenceItem[],
  fromIndex: number,
  toIndex: number,
): SessionStartSequenceItem[] => {
  const nextSequence = [...sequence];
  const [movedItem] = nextSequence.splice(fromIndex, 1);
  if (!movedItem) return sequence;
  const adjustedTargetIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
  nextSequence.splice(adjustedTargetIndex, 0, movedItem);
  return nextSequence;
};

export const SessionCategoriesPanel = (
  props: SessionCategoriesPanelProps,
): React.ReactElement => {
  const activeCategories = props.categories.filter(isActiveCategory);
  const assignedCategoryIds = getSessionAssignedCategoryIds(
    activeCategories,
    props.selectedSession?.id,
    props.eventSessions,
  );
  const categoriesById = new Map<EventCategoryId, EventCatalogCategory>(
    activeCategories.map((category) => [category.id, category]),
  );
  const persistedSequence = getSessionStartSequence(
    props.selectedSession,
  ).filter(
    (item) => item.type === "start-wave" || categoriesById.has(item.categoryId),
  );
  const [optimisticSequence, setOptimisticSequence] = React.useState<
    SessionStartSequenceItem[] | undefined
  >(undefined);
  const sequence = optimisticSequence || persistedSequence;
  const draggedIndex = React.useRef<number | undefined>(undefined);
  const itemElements = React.useRef<Map<string, HTMLDivElement>>(new Map());
  const previousItemRects = React.useRef<Map<string, DOMRect>>(new Map());
  const animationFrames = React.useRef<Map<HTMLDivElement, number>>(new Map());
  const previewIndexRef = React.useRef<number | undefined>(undefined);
  const pendingPreviewIndex = React.useRef<number | undefined>(undefined);
  const previewTimeout = React.useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);
  const [dragPreviewIndex, setDragPreviewIndex] = React.useState<
    number | undefined
  >(undefined);
  const [visibleInsertIndex, setVisibleInsertIndex] = React.useState<
    number | undefined
  >(undefined);
  const displayedSequence =
    draggedIndex.current === undefined || dragPreviewIndex === undefined
      ? sequence
      : moveSequenceItem(sequence, draggedIndex.current, dragPreviewIndex);

  React.useEffect((): void => {
    setOptimisticSequence(undefined);
  }, [
    props.selectedSession?.categoryIds,
    props.selectedSession?.id,
    props.selectedSession?.startSequence,
  ]);

  React.useLayoutEffect((): void => {
    animationFrames.current.forEach((frame) => cancelAnimationFrame(frame));
    animationFrames.current.clear();
    const elements = Array.from(itemElements.current.entries()).filter(
      ([, element]) => element.isConnected,
    );
    elements.forEach(([, element]) => {
      element.style.transition = "none";
      element.style.transform = "";
    });
    const nextRects = new Map<string, DOMRect>();
    elements.forEach(([itemId, element]) => {
      const nextRect = element.getBoundingClientRect();
      const previousRect = previousItemRects.current.get(itemId);
      if (previousRect && draggedIndex.current !== undefined) {
        const offsetY = previousRect.top - nextRect.top;
        if (Math.abs(offsetY) > 0.5) {
          element.style.transition = "none";
          element.style.transform = `translateY(${offsetY}px)`;
          const frame = requestAnimationFrame(() => {
            if (!element.isConnected) return;
            element.style.transition = "transform 350ms ease";
            element.style.transform = "";
            animationFrames.current.delete(element);
          });
          animationFrames.current.set(element, frame);
        }
      }
      nextRects.set(itemId, nextRect);
    });
    previousItemRects.current = nextRects;
  }, [displayedSequence]);

  React.useEffect(
    (): (() => void) => () => {
      if (previewTimeout.current !== undefined) {
        clearTimeout(previewTimeout.current);
      }
      animationFrames.current.forEach((frame) => cancelAnimationFrame(frame));
    },
    [],
  );

  const saveSequence = (nextSequence: SessionStartSequenceItem[]): void => {
    if (isValidStartSequence(nextSequence)) {
      setOptimisticSequence(nextSequence);
      void props.onSaveStartSequence(nextSequence);
    }
  };
  const moveItem = (fromIndex: number, toIndex: number): void => {
    saveSequence(moveSequenceItem(sequence, fromIndex, toIndex));
  };
  const addWaveBefore = (index: number): void => {
    const nextSequence = [...sequence];
    nextSequence.splice(index, 0, createStartWave());
    saveSequence(nextSequence);
  };
  const handleDropAt = (targetIndex: number): void => {
    if (previewTimeout.current !== undefined) {
      clearTimeout(previewTimeout.current);
      previewTimeout.current = undefined;
    }
    pendingPreviewIndex.current = undefined;
    if (draggedIndex.current !== undefined) {
      moveItem(draggedIndex.current, previewIndexRef.current ?? targetIndex);
    }
    draggedIndex.current = undefined;
    previewIndexRef.current = undefined;
    setDragPreviewIndex(undefined);
  };
  const queuePreviewIndex = (targetIndex: number): void => {
    if (
      previewIndexRef.current === targetIndex ||
      pendingPreviewIndex.current === targetIndex
    )
      return;
    if (previewTimeout.current !== undefined) {
      clearTimeout(previewTimeout.current);
    }
    pendingPreviewIndex.current = targetIndex;
    previewTimeout.current = setTimeout(() => {
      previewIndexRef.current = targetIndex;
      pendingPreviewIndex.current = undefined;
      previewTimeout.current = undefined;
      setDragPreviewIndex(targetIndex);
    }, 110);
  };
  const handleDragOverAt = (
    event: React.DragEvent<HTMLDivElement>,
    targetIndex: number,
  ): void => {
    event.preventDefault();
    if (draggedIndex.current !== undefined) {
      queuePreviewIndex(targetIndex);
    }
  };
  const handleItemDragOver = (
    event: React.DragEvent<HTMLDivElement>,
    index: number,
  ): void => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const topThreshold = bounds.top + bounds.height * 0.35;
    const bottomThreshold = bounds.top + bounds.height * 0.65;
    event.preventDefault();
    if (event.clientY <= topThreshold) {
      handleDragOverAt(event, index);
    } else if (event.clientY >= bottomThreshold) {
      handleDragOverAt(event, index + 1);
    }
  };
  const handleItemDrop = (
    event: React.DragEvent<HTMLDivElement>,
    index: number,
  ): void => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const targetIndex =
      event.clientY < bounds.top + bounds.height / 2 ? index : index + 1;
    handleDropAt(targetIndex);
  };
  const endDragging = (): void => {
    if (previewTimeout.current !== undefined) {
      clearTimeout(previewTimeout.current);
      previewTimeout.current = undefined;
    }
    pendingPreviewIndex.current = undefined;
    draggedIndex.current = undefined;
    previewIndexRef.current = undefined;
    setDragPreviewIndex(undefined);
  };
  const startDragging = (
    event: React.DragEvent<HTMLDivElement>,
    index: number,
  ): void => {
    draggedIndex.current = index;
    previewIndexRef.current = index;
    pendingPreviewIndex.current = undefined;
    setDragPreviewIndex(index);
    event.dataTransfer?.setData("text/plain", String(index));
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      const transparentDragImage = document.createElement("canvas");
      transparentDragImage.height = 1;
      transparentDragImage.width = 1;
      event.dataTransfer.setDragImage(transparentDragImage, 0, 0);
    }
  };
  const handleCategoryHover = (
    event: React.MouseEvent<HTMLDivElement>,
    index: number,
  ): void => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const relativeY = event.clientY - bounds.top;
    const previousItem = displayedSequence[index - 1];
    const currentItem = displayedSequence[index];
    const nextItem = displayedSequence[index + 1];

    if (
      currentItem?.type === "category" &&
      previousItem?.type === "category" &&
      relativeY <= bounds.height * 0.3
    ) {
      setVisibleInsertIndex(index);
      return;
    }
    if (
      currentItem?.type === "category" &&
      nextItem?.type === "category" &&
      relativeY >= bounds.height * 0.7
    ) {
      setVisibleInsertIndex(index + 1);
      return;
    }

    setVisibleInsertIndex(undefined);
  };

  return (
    <section className="events-panel">
      <h2>Session Categories</h2>
      <div
        aria-label="Categories for selected session"
        className="events-list"
        onMouseLeave={() => setVisibleInsertIndex(undefined)}
        role="list"
      >
        {props.selectedSession ? (
          <>
            <div
              aria-label="Scratch start wave"
              className="session-start-wave scratch-start-wave"
              role="listitem"
            >
              <strong>Scratch</strong>
              <span>First start wave</span>
            </div>
            {sequence.length > 0 ? (
              displayedSequence.map((item, index) => {
                const previousItem = displayedSequence[index - 1];
                const canInsertWave =
                  item.type === "category" && previousItem?.type === "category";
                const dropZone = (
                  <div
                    className={`session-sequence-drop-zone${visibleInsertIndex === index ? " show-add-wave" : ""}`}
                    onMouseMove={() => setVisibleInsertIndex(index)}
                    onDragOver={(event: React.DragEvent<HTMLDivElement>) =>
                      handleDragOverAt(event, index)
                    }
                    onDrop={() => handleDropAt(index)}
                  >
                    {canInsertWave ? (
                      <Button
                        aria-label={`Add start wave before ${categoriesById.get(item.categoryId)?.name}`}
                        onClick={() => addWaveBefore(index)}
                        size="small"
                      >
                        Add start wave
                      </Button>
                    ) : null}
                  </div>
                );
                if (item.type === "start-wave")
                  return (
                    <React.Fragment key={item.id}>
                      {dropZone}
                      <div
                        className="session-start-wave"
                        draggable={true}
                        ref={(element: HTMLDivElement | null): void => {
                          if (element) {
                            itemElements.current.set(
                              `wave:${item.id}`,
                              element,
                            );
                          } else {
                            itemElements.current.delete(`wave:${item.id}`);
                          }
                        }}
                        onDragEnd={() => {
                          endDragging();
                        }}
                        onDragOver={(event: React.DragEvent<HTMLDivElement>) =>
                          handleItemDragOver(event, index)
                        }
                        onDragStart={(event: React.DragEvent<HTMLDivElement>) =>
                          startDragging(event, index)
                        }
                        onDrop={(event: React.DragEvent<HTMLDivElement>) =>
                          handleItemDrop(event, index)
                        }
                        role="listitem"
                      >
                        <span
                          aria-hidden="true"
                          className="session-sequence-drag-handle"
                        >
                          ⠿
                        </span>
                        <strong>Start wave</strong>
                        <TextField
                          slotProps={{
                            htmlInput: {
                              "aria-label": "Start wave offset",
                              step: 1,
                            },
                          }}
                          label="Offset after scratch"
                          onChange={(
                            event: React.ChangeEvent<HTMLInputElement>,
                          ) =>
                            saveSequence(
                              sequence.map((sequenceItem) =>
                                sequenceItem.type === "start-wave" &&
                                sequenceItem.id === item.id
                                  ? {
                                    ...sequenceItem,
                                    offset: event.target.value,
                                  }
                                  : sequenceItem,
                              ),
                            )
                          }
                          size="small"
                          type="time"
                          value={item.offset}
                        />
                        <IconButton
                          aria-label="Delete start wave"
                          onClick={() =>
                            saveSequence(
                              sequence.filter(
                                (sequenceItem) => sequenceItem !== item,
                              ),
                            )
                          }
                          size="small"
                        >
                          <span aria-hidden="true">×</span>
                        </IconButton>
                      </div>
                    </React.Fragment>
                  );
                const category = categoriesById.get(item.categoryId);
                if (!category) return null;
                return (
                  <React.Fragment key={category.id}>
                    {dropZone}
                    <div
                      className="session-category-sequence-item"
                      draggable={true}
                      ref={(element: HTMLDivElement | null): void => {
                        if (element) {
                          itemElements.current.set(
                            `category:${category.id}`,
                            element,
                          );
                        } else {
                          itemElements.current.delete(
                            `category:${category.id}`,
                          );
                        }
                      }}
                      onDragEnd={() => {
                        endDragging();
                      }}
                      onDragOver={(event: React.DragEvent<HTMLDivElement>) =>
                        handleItemDragOver(event, index)
                      }
                      onDragStart={(event: React.DragEvent<HTMLDivElement>) =>
                        startDragging(event, index)
                      }
                      onDrop={(event: React.DragEvent<HTMLDivElement>) =>
                        handleItemDrop(event, index)
                      }
                      onMouseMove={(event: React.MouseEvent<HTMLDivElement>) =>
                        handleCategoryHover(event, index)
                      }
                      role="listitem"
                    >
                      <span
                        aria-label={`Drag ${category.name} to reorder`}
                        className="session-category-drag-handle"
                        role="img"
                      >
                        <SvgIcon fontSize="small">
                          <path d="M11 18c0 1.1.9 2 2 2s2-.9 2-2-.9-2-2-2-2 .9-2 2zm0-6c0 1.1.9 2 2 2s2-.9 2-2-.9-2-2-2-2 .9-2 2zM5 18c0 1.1.9 2 2 2s2-.9 2-2-.9-2-2-2-2 .9-2 2zm0-6c0 1.1.9 2 2 2s2-.9 2-2-.9-2-2-2-2 .9-2 2zM11 6c0 1.1.9 2 2 2s2-.9 2-2-.9-2-2-2-2 .9-2 2zM5 6c0 1.1.9 2 2 2s2-.9 2-2-.9-2-2-2-2 .9-2 2z" />
                        </SvgIcon>
                      </span>
                      <CategoryListCard
                        actionAriaLabel={`Remove ${category.name} from session`}
                        actionIcon={
                          <SvgIcon fontSize="small">
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5-1-1h-5l-1 1H5v2h14V4z" />
                          </SvgIcon>
                        }
                        actionLabel="Remove from session"
                        category={category}
                        isSelected={assignedCategoryIds.has(category.id)}
                        onActionClick={() =>
                          props.onRemoveCategoryFromSession(category.id)
                        }
                      />
                    </div>
                  </React.Fragment>
                );
              })
            ) : (
              <p>No categories are currently assigned to this session.</p>
            )}
            {sequence.length > 0 ? (
              <div
                className="session-sequence-drop-zone"
                onDragOver={(event: React.DragEvent<HTMLDivElement>) =>
                  handleDragOverAt(event, displayedSequence.length)
                }
                onDrop={() => handleDropAt(displayedSequence.length)}
              />
            ) : null}
          </>
        ) : (
          <p>Select a session to view assigned categories.</p>
        )}
      </div>
    </section>
  );
};
