import { Box, Tab, Tabs } from '@mui/material';
import React from 'react';
import { EntrantsPage } from '../../app/views/entrants/entrantsPage.js';
import { SelectTextField } from '../../controls/selectTextField.js';
import type { EventEntrantId } from '../../model/entrant.js';
import type { IndividualLink, IndividualLinkInput, IndividualLinkTargetInput } from '../../model/individualLink.js';
import type { OfficialAssignmentInput, OfficialProfileInput } from '../../model/official.js';
import type { EventId } from '../../model/raceevent.js';
import type { UnsavedChangesGuard } from '../display/unsavedChangesWarning.js';
import { IndividualsPanel } from './IndividualsPanel.js';
import { OfficialsPanel } from './OfficialsPanel.js';

interface ParticipantActions {
  onArchiveProfile: (individualId: string, archived: boolean) => Promise<void>;
  onCreateAssignment: (input: OfficialAssignmentInput) => Promise<void>;
  onCreateFromEntrant: (target: IndividualLinkTargetInput) => Promise<string>;
  onCreateProfile: (input: OfficialProfileInput) => Promise<string>;
  onLinkIndividual: (input: IndividualLinkInput) => Promise<void>;
  onRemoveAssignment: (assignmentId: string) => Promise<void>;
  onUnlinkIndividual: (linkId: string) => Promise<void>;
  onUpdateAssignment: (assignmentId: string, input: OfficialAssignmentInput) => Promise<void>;
  onUpdateProfile: (individualId: string, input: OfficialProfileInput) => Promise<void>;
}

type EntrantsContextProps = React.ComponentProps<typeof EntrantsPage> & {
  officials: ParticipantActions;
};

type ParticipantsTab = 'entrants' | 'individuals' | 'officials';

export const EntrantsContext = (props: EntrantsContextProps): React.ReactElement => {
  const [tab, setTab] = React.useState<ParticipantsTab>('entrants');
  const [selectedIndividualId, setSelectedIndividualId] = React.useState<string | undefined>(undefined);
  const [requestedIndividualTarget, setRequestedIndividualTarget] = React.useState<IndividualLinkTargetInput | undefined>(undefined);
  const guardRef = React.useRef<UnsavedChangesGuard | undefined>(undefined);
  const { officials, ...entrantProps } = props;
  const eventId: EventId | undefined = props.selectedEventId || props.catalog.activeEventId || props.catalog.events[0]?.id;
  const navigate = (action: () => void): void => guardRef.current ? guardRef.current(action) : action();
  const selectTab = (next: ParticipantsTab): void => navigate((): void => setTab(next));
  const selectEvent = (next: EventId): void => navigate((): void => props.onSelectEvent(next));
  const openIndividual = (entrantId: EventEntrantId): void => navigate((): void => {
    const link: IndividualLink | undefined = props.catalog.individualLinks?.find((candidate: IndividualLink): boolean =>
      !candidate.removed && candidate.entrantId === entrantId && !candidate.participantId);
    setSelectedIndividualId(link?.individualId);
    setRequestedIndividualTarget((link || !eventId) ? undefined : { entrantId, eventId });
    setTab('individuals');
  });
  const setGuard = (guard: UnsavedChangesGuard | undefined): void => {
    guardRef.current = guard;
    props.onUnsavedChangesGuardChange?.(guard);
  };

  return <Box sx={{ minWidth: 0 }}>
    <Box sx={{ pt: 2, px: 2 }}>
      <SelectTextField label="Event" slotProps={{ select: { 'aria-label': 'Participants Event', native: true } }}
        value={eventId || ''} onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
          selectEvent(event.target.value as EventId)}>
        {props.catalog.events.filter((event): boolean => !props.catalog.deletedEventIds.includes(event.id))
          .map((event): React.ReactElement => <option key={event.id} value={event.id}>{event.name}</option>)}
      </SelectTextField>
    </Box>
    <Tabs aria-label="Participant areas" value={tab} variant="scrollable" scrollButtons="auto"
      onChange={(_event: React.SyntheticEvent, value: ParticipantsTab): void => selectTab(value)}>
      <Tab label="Entrants" value="entrants" />
      <Tab label="Individuals" value="individuals" />
      <Tab label="Officials" value="officials" />
    </Tabs>
    {tab === 'entrants' && <EntrantsPage {...entrantProps} hideEventSelector
      onLinkIndividual={officials.onLinkIndividual} onUnlinkIndividual={officials.onUnlinkIndividual}
      onOpenIndividuals={openIndividual}
      onUnsavedChangesGuardChange={setGuard} selectedEventId={eventId} />}
    {tab === 'individuals' && <IndividualsPanel catalog={props.catalog} eventId={eventId}
      onArchiveProfile={officials.onArchiveProfile} onCreateFromEntrant={officials.onCreateFromEntrant}
      onCreateProfile={officials.onCreateProfile} onSelectProfile={setSelectedIndividualId}
      onLinkIndividual={officials.onLinkIndividual} onUpdateProfile={officials.onUpdateProfile}
      requestedTarget={requestedIndividualTarget} selectedProfileId={selectedIndividualId} />}
    {tab === 'officials' && <OfficialsPanel catalog={props.catalog} eventId={eventId}
      onCreateAssignment={officials.onCreateAssignment} onOpenIndividual={(): void => setTab('individuals')}
      onRemoveAssignment={officials.onRemoveAssignment}
      onSelectIndividual={setSelectedIndividualId} onUpdateAssignment={officials.onUpdateAssignment}
      selectedIndividualId={selectedIndividualId} />}
  </Box>;
};
