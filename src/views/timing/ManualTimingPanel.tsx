import React from "react";

import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import {
  dateStringInTimeZone,
  tableTimeStringInTimeZone,
} from "../../app/utils/timeutils.js";
import type {
  EventCatalogState,
  EventTrackTimingLine,
} from "../../catalog/eventCatalog.js";
import { createMutationId, createTimeRecordId } from "../../model/ids.js";
import type {
  EffectiveManualCrossing,
  ManualCrossingCommand,
  ManualCrossingIdentifierKind,
  ManualCrossingInput,
} from "../../model/manualCrossing.js";
import type { ManualCrossingOutboxController, ManualCrossingOutboxItem, ManualCrossingOutboxState } from "../../model/manualCrossingOutbox.js";
import {
  type ManualTimingIdentity,
  getManualTimingIdentities,
  getManualTimingInstants,
  parseSpokenTimingIdentifier,
  resolveManualTimingIdentifier,
} from "../../processing/manualTimingWorkflow.js";
import {
  type TimingSpeechAdapter,
  createTimingSpeechAdapter,
} from "./manualTimingSpeech.js";
import { ManualTimingKeypad } from './ManualTimingKeypad.js';
import { ManualTimingReview } from './ManualTimingReview.js';

export interface ManualTimingPanelProps {
  catalog: EventCatalogState;
  eventId: string;
  sessionId: string;
  checkpoints: EventTrackTimingLine[];
  outbox: ManualCrossingOutboxController;
  speech?: TimingSpeechAdapter;
}

export const ManualTimingPanel = (
  props: ManualTimingPanelProps,
): React.ReactElement => {
  const event = props.catalog.events.find(
    (candidate): boolean => candidate.id === props.eventId,
  );
  const session = props.catalog.sessions.find(
    (candidate): boolean =>
      candidate.id === props.sessionId && candidate.eventId === props.eventId,
  );
  const timeZone: string =
    event?.timeZone || new Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [expanded, setExpanded] = React.useState<boolean>(false);
  const [quick, setQuick] = React.useState<boolean>(false);
  const [identifier, setIdentifier] = React.useState<string>("");
  const [kind, setKind] =
    React.useState<ManualCrossingIdentifierKind>("transmitter");
  const [method, setMethod] = React.useState<"keyboard" | "keypad" | "voice">(
    "keyboard",
  );
  const [alphabetic, setAlphabetic] = React.useState<boolean>(false);
  const [date, setDate] = React.useState<string>(
    dateStringInTimeZone(new Date(), timeZone),
  );
  const [time, setTime] = React.useState<string>(
    tableTimeStringInTimeZone(new Date(), timeZone),
  );
  const [chosenInstant, setChosenInstant] = React.useState<string>("");
  const [line, setLine] = React.useState<number>(
    props.checkpoints[0]?.lineNumber || 0,
  );
  const [loop, setLoop] = React.useState<string>("");
  const [selectedIdentity, setSelectedIdentity] =
    React.useState<ManualTimingIdentity | null>(null);
  const [editing, setEditing] = React.useState<
    EffectiveManualCrossing | undefined
  >(undefined);
  const [reason, setReason] = React.useState<string>("");
  const [operatorLabel, setOperatorLabel] = React.useState<string>("");
  const [speechProposal, setSpeechProposal] = React.useState<string>("");
  const [error, setError] = React.useState<string>("");
  const [busy, setBusy] = React.useState<boolean>(false);
  const [items, setItems] = React.useState<ManualCrossingOutboxItem[]>(
    props.outbox.snapshot.items,
  );
  const speech: TimingSpeechAdapter = React.useMemo(
    (): TimingSpeechAdapter => props.speech || createTimingSpeechAdapter(),
    [props.speech],
  );
  const identities: ManualTimingIdentity[] = getManualTimingIdentities(
    props.catalog,
    props.eventId,
    props.sessionId,
  );
  const matches: ManualTimingIdentity[] = resolveManualTimingIdentifier(
    props.catalog,
    props.eventId,
    props.sessionId,
    kind,
    identifier,
  );
  const resolved: ManualTimingIdentity | undefined =
    selectedIdentity || (matches.length === 1 ? matches[0] : undefined);
  const instants: string[] = React.useMemo(
    (): string[] => getManualTimingInstants(date, time, timeZone),
    [date, time, timeZone],
  );
  const records: EffectiveManualCrossing[] = (
    props.catalog.manualCrossings || []
  ).filter(
    (crossing: EffectiveManualCrossing): boolean =>
      crossing.eventId === props.eventId &&
      crossing.sessionId === props.sessionId,
  );

  React.useEffect((): (() => void) => {
    const unsubscribe: () => void = props.outbox.subscribe((state: ManualCrossingOutboxState): void => setItems(state.items));
    return (): void => {
      unsubscribe();
      speech.stop();
    };
  }, [props.outbox, speech]);
  React.useEffect((): void => {
    setSelectedIdentity(null);
    setEditing(undefined);
    setIdentifier("");
    setLine(props.checkpoints[0]?.lineNumber || 0);
  }, [props.eventId, props.sessionId]);

  const run = (operation: () => Promise<void>): void => {
    setBusy(true);
    setError("");
    Promise.resolve()
      .then(operation)
      .catch((failure: Error): void => setError(failure.message))
      .finally((): void => {
        setBusy(false);
        setItems(props.outbox.snapshot.items);
      });
  };
  const next = (): void => {
    setIdentifier("");
    setSelectedIdentity(null);
    setEditing(undefined);
    setChosenInstant("");
    const now: Date = new Date();
    setDate(dateStringInTimeZone(now, timeZone));
    setTime(tableTimeStringInTimeZone(now, timeZone));
  };
  const submit = (): void =>
    run(async (): Promise<void> => {
      const instant: string | undefined =
        instants.length === 1
          ? instants[0]
          : instants.find((value: string): boolean => value === chosenInstant);
      if (!event || !session)
        throw new Error("Select an event and session in Timing.");
      if (
        !props.checkpoints.some(
          (checkpoint: EventTrackTimingLine): boolean =>
            checkpoint.lineNumber === line,
        )
      )
        throw new Error("Configure and select a checkpoint before recording.");
      if (!instant)
        throw new Error(
          instants.length > 1
            ? "Choose the earlier or later time for this daylight-saving overlap."
            : "This local time does not exist or is invalid.",
        );
      if (!identifier.trim()) throw new Error("Enter an identifier.");
      if (matches.length > 1 && !selectedIdentity)
        throw new Error("Multiple people match. Select the intended entrant.");
      if (!resolved && kind !== "transmitter" && kind !== "chip")
        throw new Error("Select an eligible entrant for this identifier.");
      const crossing: ManualCrossingInput = {
        captureInstant: new Date().toISOString(),
        entrantId: resolved?.entrantId,
        entryMethod: method,
        eventId: props.eventId,
        identifierKind: kind,
        identifierValue: identifier,
        lineNumber: line,
        localDate: date,
        localTime: time,
        loopNumber: loop ? Number(loop) : undefined,
        operatorLabel: operatorLabel || undefined,
        participantId: resolved?.participantId,
        sessionId: props.sessionId,
        status: resolved ? "scored" : "needs-attention",
        time: instant,
        timeZone,
      };
      const duplicate: EffectiveManualCrossing | undefined = records.find(
        (record: EffectiveManualCrossing): boolean =>
          !record.reversed &&
          record.crossingId !== editing?.crossingId &&
          record.lineNumber === line &&
          record.loopNumber === crossing.loopNumber &&
          record.time === instant &&
          record.identifierKind === kind &&
          record.identifierValue.trim().toLocaleLowerCase() ===
            identifier.trim().toLocaleLowerCase(),
      );
      if (duplicate) {
        setEditing(duplicate);
        throw new Error(
          `Duplicate crossing ${duplicate.crossingId}. Review, correct, or reverse this record.`,
        );
      }
      await props.outbox.submit({
        action: editing ? "correct" : "record",
        crossing,
        crossingId: editing?.crossingId || createTimeRecordId(),
        mutationId: createMutationId(),
      });
      next();
    });
  const edit = (record: EffectiveManualCrossing): void => {
    setEditing(record);
    setIdentifier(record.identifierValue);
    setKind(record.identifierKind);
    setDate(record.localDate);
    setTime(record.localTime);
    setChosenInstant(record.time);
    setLine(record.lineNumber);
    setLoop(record.loopNumber?.toString() || "");
    setSelectedIdentity(
      identities.find(
        (identity: ManualTimingIdentity): boolean =>
          identity.entrantId === record.entrantId,
      ) || null,
    );
  };
  const actOnRecord = (
    record: EffectiveManualCrossing,
    action: "reverse" | "reconcile",
  ): void =>
    run((): Promise<void> => {
      if (action === "reconcile" && !resolved)
        return Promise.reject(
          new Error("Select an eligible entrant in the entry form first."),
        );
      const {
        crossingId,
        lastMutationId: _lastMutationId,
        reversed: _reversed,
        reversalReason: _reversalReason,
        ...original
      } = record;
      const command: ManualCrossingCommand = {
        action,
        crossing:
          action === "reconcile"
            ? {
              ...original,
              entrantId: resolved?.entrantId,
              participantId: resolved?.participantId,
              status: "scored",
            }
            : original,
        crossingId,
        mutationId: createMutationId(),
        reason,
      };
      return props.outbox.submit(command);
    });
  const listen = (): void => {
    setError("");
    speech
      .listen()
      .then((transcript: string): void =>
        setSpeechProposal(parseSpokenTimingIdentifier(transcript)),
      )
      .catch((failure: Error): void => setError(failure.message));
  };
  const fields: React.ReactElement = (
    <Stack spacing={2} sx={{ minWidth: 0, p: 2 }}>
      <Typography>
        {event?.name} / {session?.name} / {timeZone}
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {props.outbox.snapshot.quarantined.length > 0 && (
        <Alert severity="warning">
          {props.outbox.snapshot.quarantined.length} damaged outbox items were
          quarantined.
        </Alert>
      )}
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { sm: "repeat(2, minmax(0, 1fr))", xs: "1fr" },
        }}
      >
        <TextField
          select
          label="Manual checkpoint"
          value={line}
          onChange={(change: React.ChangeEvent<HTMLInputElement>): void =>
            setLine(Number(change.target.value))
          }
        >
          {props.checkpoints.map(
            (checkpoint: EventTrackTimingLine): React.ReactElement => (
              <MenuItem
                key={checkpoint.lineNumber}
                value={checkpoint.lineNumber}
              >
                {checkpoint.label || `Line ${checkpoint.lineNumber}`}
              </MenuItem>
            ),
          )}
        </TextField>
        <TextField
          label="Loop (optional)"
          type="number"
          value={loop}
          onChange={(change: React.ChangeEvent<HTMLInputElement>): void =>
            setLoop(change.target.value)
          }
        />
        <TextField
          select
          label="Identifier type"
          value={kind}
          onChange={(change: React.ChangeEvent<HTMLInputElement>): void => {
            setKind(change.target.value as ManualCrossingIdentifierKind);
            setSelectedIdentity(null);
          }}
        >
          {(
            [
              "transmitter",
              "entrant",
              "plate",
              "chip",
            ] as ManualCrossingIdentifierKind[]
          ).map((value: ManualCrossingIdentifierKind): React.ReactElement => (
            <MenuItem key={value} value={value}>
              {value}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Manual identifier"
          value={identifier}
          onChange={(change: React.ChangeEvent<HTMLInputElement>): void => {
            setIdentifier(change.target.value);
            setSelectedIdentity(null);
            setMethod("keyboard");
          }}
        />
        <TextField
          label="Event-local date"
          type="date"
          value={date}
          slotProps={{ inputLabel: { shrink: true } }}
          onChange={(change: React.ChangeEvent<HTMLInputElement>): void =>
            setDate(change.target.value)
          }
        />
        <TextField
          label="Event-local time"
          type="time"
          value={time}
          slotProps={{
            htmlInput: { step: "0.001" },
            inputLabel: { shrink: true },
          }}
          onChange={(change: React.ChangeEvent<HTMLInputElement>): void =>
            setTime(change.target.value)
          }
        />
      </Box>
      {instants.length > 1 && (
        <TextField
          select
          label="Daylight-saving time choice"
          value={chosenInstant}
          onChange={(change: React.ChangeEvent<HTMLInputElement>): void =>
            setChosenInstant(change.target.value)
          }
        >
          {instants.map(
            (instant: string, index: number): React.ReactElement => (
              <MenuItem key={instant} value={instant}>
                {index === 0 ? "Earlier" : "Later"}: {instant}
              </MenuItem>
            ),
          )}
        </TextField>
      )}
      <Autocomplete
        options={identities}
        value={selectedIdentity}
        getOptionLabel={(identity: ManualTimingIdentity): string =>
          `${identity.label} (${identity.entrantId})`
        }
        isOptionEqualToValue={(
          left: ManualTimingIdentity,
          right: ManualTimingIdentity,
        ): boolean =>
          left.entrantId === right.entrantId &&
          left.participantId === right.participantId
        }
        onChange={(
          _change: React.SyntheticEvent,
          identity: ManualTimingIdentity | null,
        ): void => setSelectedIdentity(identity)}
        renderInput={(params): React.ReactElement => (
          <TextField {...params} label="Resolve manual entrant" />
        )}
      />
      <Typography>
        {resolved
          ? `Resolved: ${resolved.label} / Entrant ID: ${resolved.entrantId}`
          : matches.length > 1
            ? "Ambiguous identifier — select an entrant."
            : "Unknown identifier — transmitter/chip will be retained unscored for review."}
      </Typography>
      <TextField
        label="Operator / device label (optional)"
        value={operatorLabel}
        onChange={(change: React.ChangeEvent<HTMLInputElement>): void =>
          setOperatorLabel(change.target.value)
        }
      />
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
        <Button onClick={(): void => setAlphabetic(!alphabetic)}>
          {alphabetic ? "Numeric keypad" : "Alphabetic keypad"}
        </Button>
        <Button onClick={listen}>Speak identifier</Button>
      </Stack>
      {!speech.available && (
        <Typography>
          Speech is unavailable in this browser. Keyboard and keypad are
          available.
        </Typography>
      )}
      {speechProposal && (
        <Alert severity="info">
          Proposed identifier: {speechProposal}{" "}
          <Button
            onClick={(): void => {
              setIdentifier(speechProposal);
              setSpeechProposal("");
              setMethod("voice");
            }}
          >
            Confirm spoken identifier
          </Button>
          <Button onClick={(): void => setSpeechProposal('')}>Discard spoken identifier</Button>
        </Alert>
      )}
      <ManualTimingKeypad alphabetic={alphabetic} onChange={(value: string): void => {
        setIdentifier(value); setMethod('keypad'); 
      }} value={identifier} />
      {editing && (
        <Alert severity="info">
          Editing crossing ID: {editing.crossingId}
          <Button onClick={next}>Cancel correction</Button>
        </Alert>
      )}
      <Button
        variant="contained"
        sx={{ minHeight: 48 }}
        disabled={
          busy ||
          !event ||
          !session ||
          props.checkpoints.length === 0 ||
          !!speechProposal
        }
        onClick={submit}
      >
        {editing ? "Save correction / Next" : "Submit / Next"}
      </Button>
      <Button
        onClick={(): void => run((): Promise<void> => props.outbox.retry())}
      >
        Retry queued entries
      </Button>
      <Typography variant="h6">Manual timing review</Typography>
      <TextField
        label="Reversal reason (optional)"
        value={reason}
        onChange={(change: React.ChangeEvent<HTMLInputElement>): void =>
          setReason(change.target.value)
        }
      />
      <ManualTimingReview busy={busy} canReconcile={!!resolved} eventId={props.eventId} items={items} onAction={actOnRecord}
        onEdit={edit} records={records} sessionId={props.sessionId} />
    </Stack>
  );
  return (
    <Box>
      <Stack direction="row" spacing={1}>
        <Button onClick={(): void => setExpanded(!expanded)}>
          Manual Time Entry
        </Button>
        <Button onClick={(): void => setQuick(true)}>Quick Entry</Button>
      </Stack>
      {expanded && !quick && fields}
      <Dialog fullScreen open={quick} onClose={(): void => setQuick(false)}>
        <DialogTitle>
          Manual Timing — Quick Entry
          <Button onClick={(): void => setQuick(false)}>
            Close Quick Entry
          </Button>
        </DialogTitle>
        <DialogContent>{fields}</DialogContent>
      </Dialog>
    </Box>
  );
};
