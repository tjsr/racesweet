import React from "react";

import {
  Alert,
  Button,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";

import { SelectTextField } from "../../controls/selectTextField.js";
import {
  REPLAY_PROTOCOL_VERSION,
  type ReplayCommand,
  type ReplayControlRequest,
  type ReplayEventName,
  type ReplayMode,
  type ReplayRecord,
  type ReplaySeekTarget,
  type ReplayState,
  isReplayRecord,
  isReplayState,
  isReplayTimestamp,
} from "../../model/eventReplay.js";

export interface EventReplayPanelProps {
  eventId?: string;
  mode: ReplayMode;
  onModeChange: (mode: ReplayMode) => void;
  onSpeedChange: (speed: number) => void;
  sessionId?: string;
  speed: number;
}
const createStreamId = (): string => globalThis.crypto.randomUUID();
const sendControl = (request: ReplayControlRequest): Promise<ReplayState> =>
  fetch("/api/v1/reports/replay/control", {
    body: JSON.stringify(request),
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    method: "POST",
  }).then((response: Response): Promise<ReplayState> =>
    response
      .json()
      .then((payload: { error?: string; state?: ReplayState }): ReplayState => {
        if (!response.ok || !isReplayState(payload.state))
          throw new Error(payload.error || "Replay control failed.");
        return payload.state;
      }),
  );

export const EventReplayPanel = (
  props: EventReplayPanelProps,
): React.ReactElement => {
  const binding: string = `${props.eventId || ""}|${props.sessionId || ""}|${props.mode}`;
  const [stream, setStream] = React.useState<{ binding: string; id: string }>(
    (): { binding: string; id: string } => ({ binding, id: createStreamId() }),
  );
  const [state, setState] = React.useState<ReplayState | undefined>();
  const [records, setRecords] = React.useState<ReplayRecord[]>([]);
  const [connection, setConnection] = React.useState<string>("Connecting");
  const [reconnectAttempt, setReconnectAttempt] = React.useState<number>(0);
  const [error, setError] = React.useState<string>("");
  const [seekMode, setSeekMode] = React.useState<"position" | "timestamp">(
    "position",
  );
  const [seekValue, setSeekValue] = React.useState<string>("0");
  const sourceRef: React.RefObject<EventSource | undefined> = React.useRef<
    EventSource | undefined
  >(undefined);
  const snapshotReady: React.RefObject<boolean> = React.useRef<boolean>(false);
  const previousSpeed: React.RefObject<number> = React.useRef<number>(
    props.speed,
  );
  const params: URLSearchParams = new URLSearchParams({
    eventId: props.eventId || "",
    mode: props.mode,
    speed: props.speed.toString(),
    streamId: stream.id,
  });
  if (props.sessionId) params.set("sessionId", props.sessionId);
  const streamPath: string = `/api/v1/reports/replay?${params.toString()}`;

  React.useEffect((): void => {
    if (binding !== stream.binding)
      setStream({ binding, id: createStreamId() });
  }, [binding, stream.binding]);
  React.useEffect((): (() => void) | undefined => {
    if (!props.eventId || binding !== stream.binding) return undefined;
    setRecords([]);
    setState(undefined);
    setError("");
    snapshotReady.current = false;
    if (typeof EventSource === "undefined") {
      setConnection("Streaming is unavailable in this environment.");
      return undefined;
    }
    const source: EventSource = new EventSource(streamPath, {
      withCredentials: true,
    });
    sourceRef.current = source;
    let disposed: boolean = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const handle = (
      name: ReplayEventName,
      event: MessageEvent<string>,
    ): void => {
      if (disposed) return;
      try {
        // Parsed SSE is an untrusted wire boundary and must be checked before use.
        const payload: Record<string, unknown> = JSON.parse(
          event.data,
        ) as Record<string, unknown>;
        if (name === "replay-error") {
          if (
            typeof payload.message !== "string" ||
            typeof payload.code !== "string"
          )
            throw new Error("Invalid replay error.");
          setError(payload.message);
          return;
        }
        const next: unknown = name === "replay-state" ? payload : payload.state;
        if (
          !isReplayState(next) ||
          next.streamId !== stream.id ||
          next.eventId !== props.eventId ||
          next.sessionId !== props.sessionId ||
          next.mode !== props.mode
        ) {
          throw new Error("Invalid replay state.");
        }
        if (name === "replay-connected") {
          if (payload.protocolVersion !== REPLAY_PROTOCOL_VERSION)
            throw new Error("Unsupported replay protocol.");
          setConnection("Connected");
        } else if (name === "replay-snapshot" || name === "replay-seek") {
          if (
            !Array.isArray(payload.records) ||
            !payload.records.every(isReplayRecord) ||
            payload.records.length !== next.position ||
            !payload.records.every(
              (record: ReplayRecord): boolean =>
                record.eventId === props.eventId &&
                (!props.sessionId || record.sessionId === props.sessionId),
            )
          ) {
            throw new Error("Invalid replay snapshot.");
          }
          setRecords(payload.records);
          snapshotReady.current = true;
          setError("");
        } else if (name === "replay-reset") {
          setRecords([]);
          snapshotReady.current = true;
        } else if (name === "race-update") {
          if (!snapshotReady.current || !isReplayRecord(payload.record))
            throw new Error("Replay update needs a fresh snapshot.");
          const record: ReplayRecord = payload.record;
          if (
            record.eventId !== props.eventId ||
            (props.sessionId && record.sessionId !== props.sessionId)
          )
            throw new Error("Replay update selection mismatch.");
          setRecords((current: ReplayRecord[]): ReplayRecord[] => [
            ...current.filter(
              (existing: ReplayRecord): boolean => existing.id !== record.id,
            ),
            record,
          ]);
        } else if (name === "replay-complete") {
          setConnection("Completed");
          source.close();
        }
        if (snapshotReady.current || name === "replay-connected")
          setState(next);
      } catch {
        snapshotReady.current = false;
        setError(
          "Invalid replay message. Waiting for an authoritative snapshot.",
        );
        source.close();
        if (!retryTimer)
          retryTimer = setTimeout(
            (): void =>
              setReconnectAttempt((attempt: number): number => attempt + 1),
            2000,
          );
      }
    };
    const names: ReplayEventName[] = [
      "replay-connected",
      "replay-snapshot",
      "replay-state",
      "race-update",
      "replay-seek",
      "replay-reset",
      "replay-complete",
      "replay-error",
    ];
    names.forEach((name: ReplayEventName): void =>
      source.addEventListener(name, (event: MessageEvent<string>): void =>
        handle(name, event),
      ),
    );
    source.onerror = (): void => {
      if (!disposed) {
        setConnection("Reconnecting");
        snapshotReady.current = false;
      }
    };
    return (): void => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      source.close();
      sourceRef.current = undefined;
    };
    // Speed is a command for an existing binding, not a resubscription.
  }, [
    binding,
    stream.id,
    stream.binding,
    props.eventId,
    props.sessionId,
    props.mode,
    reconnectAttempt,
  ]);

  const control = (
    command: ReplayCommand,
    target?: ReplaySeekTarget,
    speed?: number,
  ): void => {
    setError("");
    sendControl({ command, ...target, speed, streamId: stream.id })
      .then((next: ReplayState): void => {
        setState(next);
        if (next.status === "replaying" && sourceRef.current?.readyState === 2)
          setReconnectAttempt((attempt: number): number => attempt + 1);
      })
      .catch((failure: Error): void => setError(failure.message));
  };
  React.useEffect((): void => {
    if (
      previousSpeed.current !== props.speed &&
      props.mode === "replay" &&
      sourceRef.current
    )
      control("set-speed", undefined, props.speed);
    previousSpeed.current = props.speed;
  }, [props.speed]);
  const seek = (): void => {
    if (seekMode === "timestamp") {
      if (!isReplayTimestamp(seekValue)) {
        setError("Enter an ISO timestamp with Z or an explicit offset.");
        return;
      }
      control("seek", { timestamp: seekValue });
    } else {
      const position: number = Number(seekValue);
      if (
        !/^\d+$/u.test(seekValue) ||
        !Number.isInteger(position) ||
        position < 0 ||
        (state && position > state.recordCount)
      ) {
        setError(
          "Enter a whole position between zero and the total record count.",
        );
        return;
      }
      control("seek", { position });
    }
  };
  if (!props.eventId)
    return (
      <Typography>
        Select an event or session above to create a replay stream.
      </Typography>
    );
  return (
    <Stack className="events-panel" spacing={2}>
      <Typography component="h2" variant="h6">
        Event Replay
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <Typography aria-live="polite">
        {connection}
        {state
          ? ` / ${state.status} / ${state.emittedRecordCount} of ${state.recordCount} records / Position ${state.position}`
          : ""}
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
        <SelectTextField
          label="Replay mode"
          slotProps={{ select: { "aria-label": "Event Replay Mode" } }}
          value={props.mode}
          onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
            props.onModeChange(event.target.value as ReplayMode)
          }
        >
          <MenuItem value="replay">Replay recorded data</MenuItem>
          <MenuItem value="live">Live crossing stream</MenuItem>
        </SelectTextField>
        <SelectTextField
          label="Replay speed"
          slotProps={{ select: { "aria-label": "Event Replay Speed" } }}
          value={props.speed.toString()}
          onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
            props.onSpeedChange(Number(event.target.value))
          }
        >
          {[0.5, 1, 2, 4, 8].map((speed: number): React.ReactElement => (
            <MenuItem key={speed} value={speed.toString()}>
              {speed === 1 ? "Real time (1×)" : `${speed}×`}
            </MenuItem>
          ))}
        </SelectTextField>
        {props.mode === "replay" &&
          (["start", "pause", "resume", "reset"] as ReplayCommand[]).map(
            (command: ReplayCommand): React.ReactElement => (
              <Button key={command} onClick={(): void => control(command)}>
                {command[0].toUpperCase() + command.slice(1)}
              </Button>
            ),
          )}
        <Button
          onClick={(): void => setStream({ binding, id: createStreamId() })}
        >
          New stream
        </Button>
      </Stack>
      {props.mode === "replay" && (
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
          <TextField
            select
            label="Seek by"
            value={seekMode}
            onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
              setSeekMode(event.target.value as "position" | "timestamp")
            }
          >
            <MenuItem value="position">Position</MenuItem>
            <MenuItem value="timestamp">Timestamp</MenuItem>
          </TextField>
          <TextField
            label={seekMode === "position" ? "Seek position" : "Seek timestamp"}
            value={seekValue}
            onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
              setSeekValue(event.target.value)
            }
          />
          <Button onClick={seek}>Seek</Button>
        </Stack>
      )}
      <Typography
        component="code"
        aria-label="Event Replay Stream URL"
        sx={{ overflowWrap: "anywhere" }}
      >
        {streamPath}
      </Typography>
      <Table size="small" aria-label="Replay records">
        <TableHead>
          <TableRow>
            <TableCell>Timestamp</TableCell>
            <TableCell>Record ID</TableCell>
            <TableCell>Participant / entrant ID</TableCell>
            <TableCell>Line / loop</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {records.map((record: ReplayRecord): React.ReactElement => (
            <TableRow key={record.id}>
              <TableCell>{record.timestamp}</TableCell>
              <TableCell>{record.id}</TableCell>
              <TableCell>
                {record.participantId} / {record.entrantId}
              </TableCell>
              <TableCell>
                {record.lineNumber} / {record.loopNumber}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Stack>
  );
};
