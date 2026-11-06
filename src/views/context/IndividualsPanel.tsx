import {
  Alert, Box, Button, Card, CardActionArea, CardContent, Checkbox, Chip,
  FormControlLabel, Menu, MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import React from 'react';
import type { EventCatalogEntrant, EventCatalogState } from '../../catalog/eventCatalog.js';
import type { IndividualLinkInput, IndividualLinkTargetInput } from '../../model/individualLink.js';
import { splitIndividualName } from '../../model/official.js';
import type { OfficialProfile, OfficialProfileInput } from '../../model/official.js';
import type { EventId } from '../../model/raceevent.js';
import { type IndividualDirectoryCard, getIndividualDirectoryCards } from '../../processing/individualDirectory.js';
import { IndividualProfileEditor, createEmptyIndividualDraft, getIndividualDraft } from './IndividualProfileEditor.js';

export interface IndividualsPanelProps {
  catalog: EventCatalogState;
  eventId?: EventId;
  onArchiveProfile: (individualId: string, archived: boolean) => Promise<void>;
  onCreateFromEntrant: (target: IndividualLinkTargetInput) => Promise<string>;
  onCreateProfile: (input: OfficialProfileInput) => Promise<string>;
  onLinkIndividual: (input: IndividualLinkInput) => Promise<void>;
  onUpdateProfile: (individualId: string, input: OfficialProfileInput) => Promise<void>;
  onSelectProfile: (individualId: string | undefined) => void;
  requestedTarget?: IndividualLinkTargetInput;
  selectedProfileId?: string;
}

interface CardIdentifier {
  label: string;
  value: string;
}

interface IndividualCardContextMenu {
  card: IndividualDirectoryCard;
  mouseX: number;
  mouseY: number;
}

const getCardIdentifier = (card: IndividualDirectoryCard): CardIdentifier | undefined => {
  if (card.profile) {
    return { label: 'Individual ID', value: card.profile.id };
  }

  return card.target?.entrantId
    ? { label: 'Entrant ID', value: card.target.entrantId }
    : undefined;
};

const IndividualCard = ({ card, onOpenContextMenu, onSelect, selected }: {
  card: IndividualDirectoryCard;
  onOpenContextMenu: (event: React.MouseEvent<HTMLElement>, card: IndividualDirectoryCard) => void;
  onSelect: () => void;
  selected: boolean;
}): React.ReactElement => {
  const identifier: CardIdentifier | undefined = getCardIdentifier(card);
  const tooltipTitle: string = identifier ? `${identifier.label}: ${identifier.value}` : card.label;

  return <Tooltip enterDelay={0} title={tooltipTitle}>
    <Card variant="outlined" sx={{ borderColor: selected ? 'primary.main' : 'divider' }}>
      <CardActionArea aria-label={`Individual card: ${card.label}`} onClick={onSelect}
        onContextMenu={(event: React.MouseEvent<HTMLElement>): void => onOpenContextMenu(event, card)}>
        <CardContent>
          <Typography variant="subtitle1">{card.label}{card.profile?.archived ? ' (archived)' : ''}</Typography>
          <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', mt: 0.5 }}>
            {card.target && <Chip size="small" label="Needs profile" />}
            {card.participantLabel && <Chip size="small" label={`Participant: ${card.participantLabel}`} />}
            {card.officialRoles.map((role: string, index: number): React.ReactElement =>
              <Chip key={`${role}-${index}`} size="small" label={`Official: ${role}`} />)}
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  </Tooltip>;
};

interface EntrantProfilePreview {
  dateOfBirth?: string;
  firstName: string;
  gender?: string;
  lastName: string;
}

const getEntrantProfilePreview = (
  catalog: EventCatalogState,
  target: IndividualLinkTargetInput | undefined,
): EntrantProfilePreview | undefined => {
  if (!target) return undefined;
  const entrant: EventCatalogEntrant | undefined = catalog.entrants.find((candidate: EventCatalogEntrant): boolean =>
    candidate.id === target.entrantId && candidate.eventId === target.eventId);
  if (!entrant) return undefined;
  const member: NonNullable<EventCatalogEntrant['teamMembers']>[number] | undefined = target.participantId
    ? entrant.teamMembers?.find((candidate: NonNullable<EventCatalogEntrant['teamMembers']>[number]): boolean =>
      candidate.participantId === target.participantId)
    : undefined;
  const name: { firstName: string; lastName: string } = splitIndividualName(member
    ? [member.firstName, member.lastName].filter(Boolean).join(' ')
    : entrant.name);
  return {
    dateOfBirth: member?.dateOfBirth || entrant.dateOfBirth,
    firstName: member?.firstName || entrant.firstName || name.firstName,
    gender: member?.gender || entrant.gender,
    lastName: member?.lastName || entrant.lastName || name.lastName,
  };
};

export const IndividualsPanel = (props: IndividualsPanelProps): React.ReactElement => {
  const [query, setQuery] = React.useState<string>('');
  const [includeArchived, setIncludeArchived] = React.useState<boolean>(true);
  const [unlinkedCardId, setUnlinkedCardId] = React.useState<string | undefined>(undefined);
  const [linkProfileId, setLinkProfileId] = React.useState<string>('');
  const [draft, setDraft] = React.useState<OfficialProfileInput>(createEmptyIndividualDraft);
  const [error, setError] = React.useState<string>('');
  const [contextMenu, setContextMenu] = React.useState<IndividualCardContextMenu | undefined>(undefined);
  const cards: IndividualDirectoryCard[] = getIndividualDirectoryCards(props.catalog, props.eventId);
  const visibleCards: IndividualDirectoryCard[] = cards.filter((card: IndividualDirectoryCard): boolean =>
    (includeArchived || !card.profile?.archived) &&
    [card.label, card.participantLabel, ...card.officialRoles].join(' ').toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()));
  const selected: OfficialProfile | undefined = props.catalog.officials?.find((profile: OfficialProfile): boolean =>
    profile.id === props.selectedProfileId);
  const unlinkedCard: IndividualDirectoryCard | undefined = cards.find((card: IndividualDirectoryCard): boolean =>
    card.id === unlinkedCardId && !!card.target);
  const profilePreview: EntrantProfilePreview | undefined = getEntrantProfilePreview(props.catalog, unlinkedCard?.target);

  React.useEffect((): void => {
    setDraft(selected ? getIndividualDraft(selected) : createEmptyIndividualDraft());
  }, [selected?.id, selected?.updatedAt]);

  React.useEffect((): void => {
    if (!props.requestedTarget) return;
    const requested: IndividualDirectoryCard | undefined = cards.find((card: IndividualDirectoryCard): boolean =>
      card.target?.entrantId === props.requestedTarget?.entrantId &&
      card.target?.participantId === props.requestedTarget?.participantId);
    setUnlinkedCardId(requested?.id);
  }, [props.requestedTarget?.entrantId, props.requestedTarget?.participantId, props.requestedTarget?.eventId]);

  const selectCard = (card: IndividualDirectoryCard): void => {
    setError('');
    setUnlinkedCardId(card.target ? card.id : undefined);
    setLinkProfileId('');
    props.onSelectProfile(card.profile?.id);
  };
  const createProfile = (): void => {
    setError('');
    props.onCreateProfile(draft).then((individualId: string): void => props.onSelectProfile(individualId))
      .catch((failure: Error): void => setError(failure.message));
  };
  const createFromEntrant = (): void => {
    if (!unlinkedCard?.target) return;
    setError('');
    props.onCreateFromEntrant(unlinkedCard.target).then((individualId: string): void => {
      setUnlinkedCardId(undefined);
      props.onSelectProfile(individualId);
    }).catch((failure: Error): void => setError(failure.message));
  };
  const updateProfile = (): void => {
    if (!selected) return;
    setError('');
    props.onUpdateProfile(selected.id, draft).catch((failure: Error): void => setError(failure.message));
  };
  const linkExistingProfile = (): void => {
    if (!unlinkedCard?.target || !linkProfileId) return;
    setError('');
    props.onLinkIndividual({ ...unlinkedCard.target, individualId: linkProfileId })
      .then((): void => {
        setUnlinkedCardId(undefined);
        props.onSelectProfile(linkProfileId);
        setLinkProfileId('');
      }).catch((failure: Error): void => setError(failure.message));
  };
  const archiveProfile = (): void => {
    if (!selected) return;
    setError('');
    props.onArchiveProfile(selected.id, !selected.archived)
      .catch((failure: Error): void => setError(failure.message));
  };
  const openCardContextMenu = (event: React.MouseEvent<HTMLElement>, card: IndividualDirectoryCard): void => {
    event.preventDefault();
    setContextMenu({ card, mouseX: event.clientX - 2, mouseY: event.clientY - 4 });
  };
  const closeCardContextMenu = (): void => setContextMenu(undefined);
  const copyCardIdentifier = (): void => {
    const identifier: CardIdentifier | undefined = contextMenu ? getCardIdentifier(contextMenu.card) : undefined;
    if (identifier) {
      void navigator.clipboard.writeText(identifier.value);
    }
    closeCardContextMenu();
  };
  const contextMenuIdentifier: CardIdentifier | undefined = contextMenu
    ? getCardIdentifier(contextMenu.card)
    : undefined;

  return <Stack spacing={2} sx={{ minWidth: 0, p: 2 }}>
    <Typography variant="h5">Individuals</Typography>
    {error && <Alert severity="error">{error}</Alert>}
    <Box sx={{ '@media (max-width: 720px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
      display: 'grid', gap: 2,
      gridTemplateColumns: 'minmax(0, 320px) minmax(0, 1fr)' }}>
      <Stack spacing={1} sx={{ minWidth: 0 }}>
        <TextField label="Search individuals" value={query} onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
          setQuery(event.target.value)} />
        <FormControlLabel control={<Checkbox checked={includeArchived} onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
          setIncludeArchived(event.target.checked)} />} label="Show archived" />
        <Button onClick={(): void => {
          setUnlinkedCardId(undefined);
          setLinkProfileId('');
          props.onSelectProfile(undefined);
          setDraft(createEmptyIndividualDraft());
        }}>New individual</Button>
        <Typography variant="body2">{visibleCards.length} individual{visibleCards.length === 1 ? '' : 's'}</Typography>
        {visibleCards.map((card: IndividualDirectoryCard): React.ReactElement =>
          <IndividualCard key={card.id} card={card} onOpenContextMenu={openCardContextMenu}
            onSelect={(): void => selectCard(card)}
            selected={card.id === unlinkedCardId || (!!card.profile && card.profile.id === props.selectedProfileId)} />)}
      </Stack>
      {unlinkedCard?.target ? <Stack spacing={1}>
        <Typography variant="h6">{unlinkedCard.label}</Typography>
        <Typography variant="body2">This entrant or team member does not yet have a shared Individual profile.</Typography>
        {profilePreview && <Box sx={{ display: 'grid', gap: 0.5,
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }}>
          <Typography variant="body2">First name: {profilePreview.firstName || '—'}</Typography>
          <Typography variant="body2">Surname: {profilePreview.lastName || '—'}</Typography>
          <Typography variant="body2">Gender: {profilePreview.gender || '—'}</Typography>
          <Typography variant="body2">Date of birth: {profilePreview.dateOfBirth || '—'}</Typography>
        </Box>}
        <Typography variant="body2">These entrant details will prefill the new linked profile.</Typography>
        <Button variant="contained" onClick={createFromEntrant}>Create profile and link</Button>
        <TextField select label="Link existing individual" value={linkProfileId}
          onChange={(event: React.ChangeEvent<HTMLInputElement>): void => setLinkProfileId(event.target.value)}>
          <MenuItem value="">Select an individual</MenuItem>
          {(props.catalog.officials || []).filter((profile: OfficialProfile): boolean => !profile.archived)
            .map((profile: OfficialProfile): React.ReactElement =>
              <MenuItem key={profile.id} value={profile.id}>{profile.displayName}</MenuItem>)}
        </TextField>
        <Button disabled={!linkProfileId} onClick={linkExistingProfile}>Link existing profile</Button>
      </Stack> : <IndividualProfileEditor draft={draft} onArchive={archiveProfile} onChange={setDraft}
        onSave={selected ? updateProfile : createProfile} selected={selected} />}
    </Box>
    <Menu
      anchorPosition={contextMenu ? { left: contextMenu.mouseX, top: contextMenu.mouseY } : undefined}
      anchorReference="anchorPosition"
      onClose={closeCardContextMenu}
      open={contextMenu !== undefined}
    >
      {contextMenuIdentifier ? <MenuItem onClick={copyCardIdentifier}>
        Copy {contextMenuIdentifier.label}
      </MenuItem> : null}
    </Menu>
  </Stack>;
};
