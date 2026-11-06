import React from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import {
  normalizeTimeZone,
  timeOfDayInputStringInTimeZone,
} from "../../app/utils/timeutils.js";
import {
  type EventCatalogCategory,
  type EventCatalogSession,
  type SessionStartSequenceItem,
  type SessionStartSequenceWaveItem,
  getSessionAssignedCategoryIds,
  getSessionStartSequence,
} from "../../catalog/eventCatalog.js";
import { CategoryListCard } from "../../controls/categoryListCard.js";
import { type EventCategoryId } from "../../model/eventcategory.js";
import { ReorderableAdminList } from "../admin/ReorderableAdminList.js";

interface SessionCategoriesPanelProps {
  categories: EventCatalogCategory[];
  eventTimeZone?: string;
  eventSessions: EventCatalogSession[];
  onRemoveCategoryFromSession: (
    categoryId: EventCategoryId,
  ) => void | Promise<void>;
  onSaveStartSequence: (
    startSequence: SessionStartSequenceItem[],
  ) => void | Promise<void>;
  selectedSession?: EventCatalogSession;
}

type StartWaveTimingMode = "offset" | "time-of-day";

const DEFAULT_START_WAVE_OFFSET_SECONDS = 60;

export const parseStartWaveOffsetSeconds = (
  value: string,
): number | undefined => {
  const trimmed: string = value.trim();
  if (/^\d+$/u.test(trimmed)) {
    const seconds: number = Number(trimmed);
    return Number.isSafeInteger(seconds) ? seconds : undefined;
  }
  const minuteSecondMatch: RegExpExecArray | null = /^(\d+):([0-5]\d)$/u.exec(
    trimmed,
  );
  if (minuteSecondMatch) {
    const minutes: number = Number(minuteSecondMatch[1]);
    const seconds: number = Number(minuteSecondMatch[2]);
    return Number.isSafeInteger(minutes) ? minutes * 60 + seconds : undefined;
  }
  const legacyHourMatch: RegExpExecArray | null =
    /^(\d+):([0-5]\d):([0-5]\d)$/u.exec(trimmed);
  if (legacyHourMatch) {
    const hours: number = Number(legacyHourMatch[1]);
    const minutes: number = Number(legacyHourMatch[2]);
    const seconds: number = Number(legacyHourMatch[3]);
    return Number.isSafeInteger(hours)
      ? hours * 3600 + minutes * 60 + seconds
      : undefined;
  }
  const isoDurationMatch: RegExpExecArray | null =
    /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/u.exec(trimmed);
  if (
    !isoDurationMatch ||
    (isoDurationMatch[1] === undefined &&
      isoDurationMatch[2] === undefined &&
      isoDurationMatch[3] === undefined)
  ) {
    return undefined;
  }
  const hours: number = Number(isoDurationMatch[1] || 0);
  const minutes: number = Number(isoDurationMatch[2] || 0);
  const seconds: number = Number(isoDurationMatch[3] || 0);
  const result: number = hours * 3600 + minutes * 60 + seconds;
  return Number.isSafeInteger(result) ? result : undefined;
};

export const formatStartWaveOffset = (seconds: number): string => {
  if (seconds < 60) return String(seconds);
  const minutes: number = Math.floor(seconds / 60);
  const remainingSeconds: number = seconds % 60;
  return remainingSeconds === 0
    ? String(seconds)
    : `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
};

const normalizeTimeOfDay = (value: string | undefined): string | undefined => {
  const match: RegExpMatchArray | null =
    value?.trim().match(/^(\d{2}):([0-5]\d)(?::([0-5]\d))?$/u) || null;
  if (!match || Number(match[1]) > 23) return undefined;
  return `${match[1]}:${match[2]}:${match[3] || "00"}`;
};

export const defaultStartWaveTimeOfDay = (
  session: EventCatalogSession | undefined,
  timeZone: string | undefined,
  offset: string | undefined,
): string => {
  const scheduledStart: Date = new Date(session?.scheduledStart || "");
  const offsetSeconds: number =
    parseStartWaveOffsetSeconds(offset || "") ||
    DEFAULT_START_WAVE_OFFSET_SECONDS;
  const minimumOffsetSeconds: number = Math.max(
    DEFAULT_START_WAVE_OFFSET_SECONDS,
    offsetSeconds,
  );
  const defaultStart: Date = Number.isNaN(scheduledStart.getTime())
    ? new Date()
    : new Date(scheduledStart.getTime() + minimumOffsetSeconds * 1000);
  return timeOfDayInputStringInTimeZone(defaultStart, timeZone).slice(0, 8);
};

const getTimingMode = (
  item: SessionStartSequenceWaveItem,
): StartWaveTimingMode =>
  item.timeOfDay === undefined ? "offset" : "time-of-day";

export const SessionCategoriesPanel = (
  props: SessionCategoriesPanelProps,
): React.ReactElement => {
  const categories: EventCatalogCategory[] = props.categories.filter(
    (category: EventCatalogCategory): boolean => !category.deleted,
  );
  const categoriesById: Map<string, EventCatalogCategory> = new Map(
    categories.map(
      (category: EventCatalogCategory): [string, EventCatalogCategory] => [
        category.id,
        category,
      ],
    ),
  );
  const persisted: SessionStartSequenceItem[] = getSessionStartSequence(
    props.selectedSession,
  ).filter(
    (item: SessionStartSequenceItem): boolean =>
      item.type === "start-wave" || categoriesById.has(item.categoryId),
  );
  const [draft, setDraft] = React.useState<
    SessionStartSequenceItem[] | undefined
  >(undefined);
  const [offsetDrafts, setOffsetDrafts] = React.useState<
    Record<string, string>
  >({});
  const sequence: SessionStartSequenceItem[] = draft || persisted;
  React.useEffect((): void => {
    setDraft(undefined);
    setOffsetDrafts({});
  }, [
    props.selectedSession?.id,
    props.selectedSession?.startSequence,
    props.selectedSession?.categoryIds,
  ]);
  const assigned: Set<string> = getSessionAssignedCategoryIds(
    categories,
    props.selectedSession?.id,
    props.eventSessions,
  );
  const save = (next: SessionStartSequenceItem[]): Promise<void> => {
    if (
      !next.every(
        (item: SessionStartSequenceItem, index: number): boolean =>
          item.type !== "start-wave" ||
          next
            .slice(index + 1)
            .some(
              (following: SessionStartSequenceItem): boolean =>
                following.type === "category",
            ),
      )
    ) {
      return Promise.reject(
        new Error("Every start wave must have a category after it."),
      );
    }
    const previous: SessionStartSequenceItem[] = sequence;
    setDraft(next);
    return Promise.resolve()
      .then((): void | Promise<void> => props.onSaveStartSequence(next))
      .catch((error: unknown): never => {
        setDraft(previous);
        throw error;
      });
  };
  const [error, setError] = React.useState<string>("");
  const [categoryPendingRemoval, setCategoryPendingRemoval] = React.useState<
    EventCatalogCategory | undefined
  >(undefined);
  const [removingCategory, setRemovingCategory] =
    React.useState<boolean>(false);
  const change = (next: SessionStartSequenceItem[]): void => {
    setError("");
    save(next).catch((failure: unknown): void =>
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to save start sequence.",
      ),
    );
  };
  const addWave = (index: number): void =>
    change([
      ...sequence.slice(0, index),
      {
        id: crypto.randomUUID(),
        offset: String(DEFAULT_START_WAVE_OFFSET_SECONDS),
        type: "start-wave",
      },
      ...sequence.slice(index),
    ]);
  const changeWave = (
    waveId: string,
    update: (
      item: SessionStartSequenceWaveItem,
    ) => SessionStartSequenceWaveItem,
  ): void =>
    change(
      sequence.map(
        (candidate: SessionStartSequenceItem): SessionStartSequenceItem =>
          candidate.type === "start-wave" && candidate.id === waveId
            ? update(candidate)
            : candidate,
      ),
    );
  const commitWaveOffset = (
    item: SessionStartSequenceWaveItem,
    enteredValue: string | undefined,
  ): void => {
    const draftValue: string =
      enteredValue ??
      offsetDrafts[item.id] ??
      formatStartWaveOffset(
        parseStartWaveOffsetSeconds(item.offset) ??
          DEFAULT_START_WAVE_OFFSET_SECONDS,
      );
    const offsetSeconds: number | undefined =
      parseStartWaveOffsetSeconds(draftValue);
    if (offsetSeconds === undefined) {
      setError("Enter the start-wave offset as seconds or minutes:seconds.");
      return;
    }
    setOffsetDrafts(
      (current: Record<string, string>): Record<string, string> => {
        const remaining: Record<string, string> = { ...current };
        delete remaining[item.id];
        return remaining;
      },
    );
    changeWave(
      item.id,
      (
        candidate: SessionStartSequenceWaveItem,
      ): SessionStartSequenceWaveItem => ({
        ...candidate,
        offset: formatStartWaveOffset(offsetSeconds),
      }),
    );
  };
  const setWaveTimingMode = (
    item: SessionStartSequenceWaveItem,
    mode: StartWaveTimingMode,
  ): void => {
    if (mode === getTimingMode(item)) return;
    if (mode === "time-of-day") {
      changeWave(
        item.id,
        (
          candidate: SessionStartSequenceWaveItem,
        ): SessionStartSequenceWaveItem => ({
          ...candidate,
          timeOfDay: defaultStartWaveTimeOfDay(
            props.selectedSession,
            props.eventTimeZone,
            candidate.offset,
          ),
        }),
      );
      return;
    }
    changeWave(
      item.id,
      (
        candidate: SessionStartSequenceWaveItem,
      ): SessionStartSequenceWaveItem => {
        const {
          timeOfDay: _timeOfDay,
          ...offsetWave
        }: SessionStartSequenceWaveItem = candidate;
        return offsetWave;
      },
    );
  };
  const confirmCategoryRemoval = (): void => {
    if (!categoryPendingRemoval) return;
    setRemovingCategory(true);
    Promise.resolve(
      props.onRemoveCategoryFromSession(categoryPendingRemoval.id),
    )
      .then((): void => {
        setCategoryPendingRemoval(undefined);
      })
      .catch((failure: unknown): void => {
        setError(
          failure instanceof Error
            ? failure.message
            : "Unable to remove category from session.",
        );
      })
      .finally((): void => setRemovingCategory(false));
  };
  const renderItem = (
    item: SessionStartSequenceItem,
    index: number,
  ): React.ReactNode => {
    if (item.type === "start-wave") {
      const timingMode: StartWaveTimingMode = getTimingMode(item);
      const storedOffsetSeconds: number =
        parseStartWaveOffsetSeconds(item.offset) ??
        DEFAULT_START_WAVE_OFFSET_SECONDS;
      const timeOfDay: string =
        normalizeTimeOfDay(item.timeOfDay) ||
        defaultStartWaveTimeOfDay(
          props.selectedSession,
          props.eventTimeZone,
          item.offset,
        );
      const eventTimeZone: string = normalizeTimeZone(props.eventTimeZone);
      return (
        <Stack className="session-start-wave" spacing={1}>
          <Typography>Start wave</Typography>
          <ToggleButtonGroup
            aria-label="Start wave timing type"
            exclusive
            size="small"
            value={timingMode}
            onChange={(
              _event: React.MouseEvent<HTMLElement>,
              value: StartWaveTimingMode | null,
            ): void => {
              if (value) setWaveTimingMode(item, value);
            }}
          >
            <ToggleButton value="offset">Offset</ToggleButton>
            <ToggleButton value="time-of-day">Time of day</ToggleButton>
          </ToggleButtonGroup>
          {timingMode === "offset" ? (
            <TextField
              helperText="Seconds or minutes:seconds"
              label="Offset after scratch"
              slotProps={{ htmlInput: { "aria-label": "Start wave offset" } }}
              value={
                offsetDrafts[item.id] ??
                formatStartWaveOffset(storedOffsetSeconds)
              }
              onBlur={(event: React.FocusEvent<HTMLInputElement>): void => {
                if (
                  parseStartWaveOffsetSeconds(event.currentTarget.value) ===
                  undefined
                )
                  commitWaveOffset(item, event.currentTarget.value);
              }}
              onChange={(event: React.ChangeEvent<HTMLInputElement>): void => {
                const nextOffset: string = event.target.value;
                setOffsetDrafts(
                  (
                    current: Record<string, string>,
                  ): Record<string, string> => ({
                    ...current,
                    [item.id]: nextOffset,
                  }),
                );
                if (parseStartWaveOffsetSeconds(nextOffset) !== undefined)
                  commitWaveOffset(item, nextOffset);
              }}
            />
          ) : (
            <TextField
              helperText={`Event local time (${eventTimeZone})`}
              label="Start time"
              type="time"
              value={timeOfDay}
              slotProps={{
                htmlInput: { "aria-label": "Start wave time of day", step: 1 },
              }}
              onChange={(event: React.ChangeEvent<HTMLInputElement>): void => {
                const nextTimeOfDay: string | undefined = normalizeTimeOfDay(
                  event.target.value,
                );
                if (nextTimeOfDay)
                  changeWave(
                    item.id,
                    (
                      candidate: SessionStartSequenceWaveItem,
                    ): SessionStartSequenceWaveItem => ({
                      ...candidate,
                      timeOfDay: nextTimeOfDay,
                    }),
                  );
              }}
            />
          )}
          <Button
            aria-label="Delete start wave"
            onClick={(): void =>
              change(
                sequence.filter(
                  (candidate: SessionStartSequenceItem): boolean =>
                    candidate !== item,
                ),
              )
            }
          >
            Delete start wave
          </Button>
        </Stack>
      );
    }
    const category: EventCatalogCategory | undefined = categoriesById.get(
      item.categoryId,
    );
    if (!category) return null;
    return (
      <Stack spacing={1}>
        <Button
          aria-label={`Add start wave before ${category.name}`}
          onClick={(): void => addWave(index)}
        >
          Add start wave
        </Button>
        <CategoryListCard
          actionColor="error"
          actionSize="small"
          actionTitle={`Remove ${category.name} from session`}
          actionVariant="outlined"
          category={category}
          isSelected={assigned.has(category.id)}
          actionLabel="Remove"
          actionAriaLabel={`Remove ${category.name} from session`}
          onActionClick={(): void => setCategoryPendingRemoval(category)}
        />
      </Stack>
    );
  };
  return (
    <section className="events-panel">
      <h2>Session Categories</h2>
      {props.selectedSession ? (
        <>
          <div
            aria-label="Scratch start wave"
            className="session-start-wave scratch-start-wave"
          >
            <strong>Scratch</strong>
            <span>First start wave</span>
          </div>
          <ReorderableAdminList
            items={sequence}
            label="Categories for selected session"
            onReorder={save}
            getId={(item: SessionStartSequenceItem): string =>
              item.type === "category"
                ? `category:${item.categoryId}`
                : `wave:${item.id}`
            }
            getLabel={(item: SessionStartSequenceItem): string =>
              item.type === "category"
                ? categoriesById.get(item.categoryId)?.name || "Category"
                : "Start wave"
            }
            renderItem={renderItem}
          />
          {sequence.length === 0 && (
            <p>No categories are currently assigned to this session.</p>
          )}
          {error && <p role="alert">{error}</p>}
          <Dialog
            aria-labelledby="remove-session-category-title"
            open={Boolean(categoryPendingRemoval)}
          >
            <DialogTitle id="remove-session-category-title">
              Remove category from session?
            </DialogTitle>
            <DialogContent>
              Removing {categoryPendingRemoval?.name || "this category"} removes
              it from this session only. It does not delete the category.
            </DialogContent>
            <DialogActions>
              <Button
                disabled={removingCategory}
                onClick={(): void => setCategoryPendingRemoval(undefined)}
              >
                Cancel
              </Button>
              <Button
                aria-label="Confirm removal from session"
                color="error"
                disabled={removingCategory}
                onClick={confirmCategoryRemoval}
                variant="contained"
              >
                Remove
              </Button>
            </DialogActions>
          </Dialog>
        </>
      ) : (
        <p>Select a session to view assigned categories.</p>
      )}
    </section>
  );
};
