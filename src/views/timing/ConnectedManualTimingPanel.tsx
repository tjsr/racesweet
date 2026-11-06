import React from 'react';
import { Alert } from '@mui/material';
import type { EventCatalogState, EventTrackTimingLine } from '../../catalog/eventCatalog.js';
import type { ManualTimingOutboxConnection } from '../../model/manualCrossingOutbox.js';
import { ManualTimingPanel } from './ManualTimingPanel.js';

export const ConnectedManualTimingPanel = (props: {
  catalog: EventCatalogState;
  checkpoints: EventTrackTimingLine[];
  connection: ManualTimingOutboxConnection;
  eventId: string;
  sessionId: string;
}): React.ReactElement => props.connection.error
  ? <Alert severity="warning">{props.connection.error}</Alert>
  : props.connection.outbox ? <ManualTimingPanel catalog={props.catalog} checkpoints={props.checkpoints} eventId={props.eventId}
    outbox={props.connection.outbox} sessionId={props.sessionId} /> : <></>;
