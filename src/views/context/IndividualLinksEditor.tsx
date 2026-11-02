import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import React from 'react';
import { type EventCatalogEntrant, type EventCatalogState, getEntrantsForEvent } from '../../catalog/eventCatalog.js';
import type { IndividualLink, IndividualLinkInput } from '../../model/individualLink.js';
import type { OfficialProfile } from '../../model/official.js';
import type { EventParticipantId } from '../../model/eventparticipant.js';
import type { EventId } from '../../model/raceevent.js';

export interface IndividualLinksEditorProps {
  catalog: EventCatalogState;
  eventId?: EventId;
  onLink: (input: IndividualLinkInput) => Promise<void>;
  onUnlink: (linkId: string) => Promise<void>;
  selected?: OfficialProfile;
}

interface LinkTarget {
  entrantId: string;
  label: string;
  participantId?: string;
  value: string;
}

const getLinkTargets = (catalog: EventCatalogState, eventId: EventId): LinkTarget[] =>
  getEntrantsForEvent(catalog, eventId).flatMap((entrant: EventCatalogEntrant): LinkTarget[] => {
    if (entrant.entrantType === 'rider') {
      return [{ entrantId: entrant.id, label: entrant.name, value: entrant.id }];
    }
    const participantIds: EventParticipantId[] = [...new Set<EventParticipantId>([
      ...entrant.memberParticipantIds, ...(entrant.teamMembers || []).map(
        (member: NonNullable<EventCatalogEntrant['teamMembers']>[number]): EventParticipantId => member.participantId),
    ])];
    return participantIds.map((participantId: EventParticipantId, index: number): LinkTarget => {
      const member = entrant.teamMembers?.find((candidate: NonNullable<EventCatalogEntrant['teamMembers']>[number]): boolean =>
        candidate.participantId === participantId);
      const name: string = member ? [member.firstName, member.lastName].filter(Boolean).join(' ') : `Member ${index + 1}`;
      return {
        entrantId: entrant.id, label: `${name} (${entrant.name})`, participantId,
        value: `${entrant.id}|${participantId}`,
      };
    });
  });

export const IndividualLinksEditor = (props: IndividualLinksEditorProps): React.ReactElement => {
  const [targetValue, setTargetValue] = React.useState<string>('');
  const [error, setError] = React.useState<string>('');
  const targets: LinkTarget[] = props.eventId ? getLinkTargets(props.catalog, props.eventId) : [];
  const links: IndividualLink[] = (props.catalog.individualLinks || []).filter((link: IndividualLink): boolean =>
    !link.removed && link.individualId === props.selected?.id);
  const target: LinkTarget | undefined = targets.find((candidate: LinkTarget): boolean => candidate.value === targetValue);
  const link = (): void => {
    if (!props.eventId || !props.selected || !target) return;
    props.onLink({ entrantId: target.entrantId, eventId: props.eventId,
      individualId: props.selected.id, participantId: target.participantId })
      .then((): void => {
        setTargetValue(''); setError(''); 
      })
      .catch((failure: Error): void => setError(failure.message));
  };
  return <Stack spacing={1}>
    <Typography variant="h6">Participant identity links</Typography>
    {error && <Alert severity="error">{error}</Alert>}
    <Typography variant="body2">Connect this individual to an entrant or named team member. Official duties remain separate.</Typography>
    <TextField select label="Entrant or team member" value={targetValue} disabled={!props.selected || props.selected.archived || !props.eventId}
      onChange={(event: React.ChangeEvent<HTMLInputElement>): void => setTargetValue(event.target.value)}>
      <MenuItem value="">Select a person</MenuItem>
      {targets.map((candidate: LinkTarget): React.ReactElement => {
        const linked: boolean = (props.catalog.individualLinks || []).some((item: IndividualLink): boolean =>
          !item.removed && item.entrantId === candidate.entrantId && item.participantId === candidate.participantId);
        return <MenuItem key={candidate.value} value={candidate.value} disabled={linked}>
          {candidate.label}{linked ? ' (already linked)' : ''}
        </MenuItem>;
      })}
    </TextField>
    <Button disabled={!target || !props.selected || props.selected.archived} onClick={link}>Link participant</Button>
    {links.map((item: IndividualLink): React.ReactElement =>
      <Stack key={item.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="body2">
          {item.displayName} · {props.catalog.events.find((event): boolean => event.id === item.eventId)?.name || 'Past event'}
        </Typography>
        <Button onClick={(): void => {
          props.onUnlink(item.id).then((): void => setError(''))
            .catch((failure: Error): void => setError(failure.message));
        }}>Unlink</Button>
      </Stack>)}
  </Stack>;
};
