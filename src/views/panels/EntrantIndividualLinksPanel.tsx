import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import React from 'react';
import type { EventCatalogEntrant, EventCatalogState } from '../../catalog/eventCatalog.js';
import type { IndividualLink, IndividualLinkInput } from '../../model/individualLink.js';
import type { EventParticipantId } from '../../model/eventparticipant.js';
import type { OfficialProfile } from '../../model/official.js';

interface LinkTarget {
  label: string;
  participantId?: EventParticipantId;
  value: string;
}

const getTargets = (entrant: EventCatalogEntrant): LinkTarget[] => {
  if (entrant.entrantType === 'rider') return [{ label: entrant.name, value: entrant.id }];
  const participantIds: EventParticipantId[] = [...new Set<EventParticipantId>([
    ...entrant.memberParticipantIds,
    ...(entrant.teamMembers || []).map((member: NonNullable<EventCatalogEntrant['teamMembers']>[number]): EventParticipantId =>
      member.participantId),
  ])];
  return participantIds.map((participantId: EventParticipantId, index: number): LinkTarget => {
    const member = entrant.teamMembers?.find((candidate: NonNullable<EventCatalogEntrant['teamMembers']>[number]): boolean =>
      candidate.participantId === participantId);
    return { label: member ? [member.firstName, member.lastName].filter(Boolean).join(' ').trim() : `Member ${index + 1}`,
      participantId, value: participantId };
  });
};

export const EntrantIndividualLinksPanel = ({ catalog, entrant, onLink, onUnlink }: {
  catalog: EventCatalogState;
  entrant: EventCatalogEntrant;
  onLink: (input: IndividualLinkInput) => Promise<void>;
  onUnlink: (linkId: string) => Promise<void>;
}): React.ReactElement => {
  const [targetValue, setTargetValue] = React.useState<string>('');
  const [individualId, setIndividualId] = React.useState<string>('');
  const [error, setError] = React.useState<string>('');
  const targets: LinkTarget[] = getTargets(entrant);
  const selectedTarget: LinkTarget | undefined = targets.find((target: LinkTarget): boolean => target.value === targetValue) || targets[0];
  const link: IndividualLink | undefined = (catalog.individualLinks || []).find((candidate: IndividualLink): boolean =>
    !candidate.removed && candidate.entrantId === entrant.id && candidate.participantId === selectedTarget?.participantId);
  const linkedProfile: OfficialProfile | undefined = catalog.officials?.find((profile: OfficialProfile): boolean =>
    profile.id === link?.individualId);
  const addLink = (): void => {
    if (!selectedTarget || !individualId) return;
    setError('');
    onLink({ entrantId: entrant.id, eventId: entrant.eventId, individualId,
      participantId: selectedTarget.participantId })
      .then((): void => setIndividualId(''))
      .catch((failure: Error): void => setError(failure.message));
  };
  const removeLink = (): void => {
    if (!link) return;
    setError('');
    onUnlink(link.id).catch((failure: Error): void => setError(failure.message));
  };
  return <Stack spacing={1} sx={{ p: 1 }}>
    <Typography variant="h6">Individual membership</Typography>
    {error && <Alert severity="error">{error}</Alert>}
    {entrant.entrantType === 'team' && <TextField select label="Team member" value={selectedTarget?.value || ''}
      onChange={(event: React.ChangeEvent<HTMLInputElement>): void => setTargetValue(event.target.value)}>
      {targets.map((target: LinkTarget): React.ReactElement =>
        <MenuItem key={target.value} value={target.value}>{target.label}</MenuItem>)}
    </TextField>}
    {selectedTarget && (link ? <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <Typography variant="body2">{selectedTarget.label} → {linkedProfile?.displayName || 'Unknown individual'}
        {linkedProfile?.archived ? ' (archived)' : ''}</Typography>
      <Button onClick={removeLink}>Unlink</Button>
    </Stack> : <Stack spacing={1}>
      <TextField select label="Link to individual" value={individualId} onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
        setIndividualId(event.target.value)}>
        <MenuItem value="">Select an individual</MenuItem>
        {(catalog.officials || []).filter((profile: OfficialProfile): boolean => !profile.archived)
          .map((profile: OfficialProfile): React.ReactElement =>
            <MenuItem key={profile.id} value={profile.id}>{profile.displayName}</MenuItem>)}
      </TextField>
      <Button disabled={!individualId} onClick={addLink}>Link individual</Button>
      <Typography variant="body2">New people can be created from their card on the Individuals tab.</Typography>
    </Stack>)}
  </Stack>;
};
