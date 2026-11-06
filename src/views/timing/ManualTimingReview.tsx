import React from 'react';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import type { EffectiveManualCrossing } from '../../model/manualCrossing.js';
import type { ManualCrossingOutboxItem } from '../../model/manualCrossingOutbox.js';

interface ManualTimingReviewProps {
  busy: boolean;
  canReconcile: boolean;
  eventId: string;
  items: ManualCrossingOutboxItem[];
  onAction: (record: EffectiveManualCrossing, action: 'reverse' | 'reconcile') => void;
  onEdit: (record: EffectiveManualCrossing) => void;
  records: EffectiveManualCrossing[];
  sessionId: string;
}

const CrossingReview = (props: Pick<ManualTimingReviewProps, 'busy' | 'canReconcile' | 'onAction' | 'onEdit'> & {
  record: EffectiveManualCrossing;
}): React.ReactElement => <Box sx={{ borderColor: 'divider', borderTop: 1, pt: 1 }}>
  <Typography>{props.record.identifierValue} / {props.record.reversed ? 'reversed' : props.record.status} / {props.record.localDate} {props.record.localTime}</Typography>
  <Typography variant="caption">Crossing ID: {props.record.crossingId} / Entrant ID: {props.record.entrantId || 'Unresolved'} / Participant ID: {props.record.participantId || 'Unresolved'}</Typography>
  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
    <Button disabled={props.record.reversed || props.busy} onClick={(): void => props.onEdit(props.record)}>Correct crossing</Button>
    <Button disabled={props.record.reversed || props.busy} onClick={(): void => props.onAction(props.record, 'reverse')}>Reverse crossing</Button>
    {props.record.status === 'needs-attention' && <Button disabled={props.record.reversed || props.busy || !props.canReconcile}
      onClick={(): void => props.onAction(props.record, 'reconcile')}>Reconcile crossing</Button>}
  </Stack>
</Box>;

export const ManualTimingReview = (props: ManualTimingReviewProps): React.ReactElement => <Stack spacing={1}>
  {props.items.filter((item: ManualCrossingOutboxItem): boolean => item.command.crossing.eventId === props.eventId && item.command.crossing.sessionId === props.sessionId)
    .map((item: ManualCrossingOutboxItem): React.ReactElement => <Alert key={item.command.mutationId} severity={item.status === 'rejected' ? 'error' : 'info'}>
      {item.command.crossing.identifierValue}: {item.status} / Crossing ID: {item.command.crossingId}{item.lastError ? ` / ${item.lastError}` : ''}
    </Alert>)}
  {props.records.map((record: EffectiveManualCrossing): React.ReactElement => <CrossingReview busy={props.busy} canReconcile={props.canReconcile}
    key={record.crossingId} onAction={props.onAction} onEdit={props.onEdit} record={record} />)}
</Stack>;
