import React from 'react';
import {
  type EntrantType,
  type EventCatalogEntrant,
  type EventCatalogState,
  getCategoriesForEvent,
  getEntrantAssignedSessionIds,
  getEntrantsForEvent,
  getSessionsForEvent,
} from '../../app/eventCatalog.js';
import { EventEntrantId } from '../../model/entrant.js';
import { type EventParticipant, type EventParticipantId, type ParticipantIdentifierUpdate } from '../../model/eventparticipant.js';
import { EventId } from '../../model/raceevent.js';
import { type RaceState } from '../../model/racestate.js';
import { EntrantListPanel, getParticipantsForEntrant } from '../panels/entrantList.js';
import { EntrantDetailsPanel, type EntrantDraft } from '../panels/entrantDetailsPanel.js';
import { IdentificationPanel } from '../panels/identificationPanel.js';
import { SessionListPanel } from '../panels/sessionList.js';
import { type UnsavedChangesGuard, useUnsavedChangesWarning } from './unsavedChangesWarning.js';

interface EntrantsPageProps {
  catalog: EventCatalogState;
  enableMultiplePlates?: boolean;
  onCreateEntrant: (eventId: EventId, entrantType?: EntrantType) => void | Promise<void>;
  onDeleteEntrant: (eventId: EventId, entrantId: EventEntrantId) => void | Promise<void>;
  onSelectEntrant: (entrantId: EventEntrantId) => void;
  onSelectEvent: (eventId: EventId) => void;
  onUnsavedChangesGuardChange?: (guard: UnsavedChangesGuard | undefined) => void;
  onUpdateParticipantIdentifiers?: (participantId: EventParticipantId, identifierType: 'racePlate' | 'txNo', values: ParticipantIdentifierUpdate[]) => void | Promise<void>;
  onUpdateEntrant: (entrantId: EventEntrantId, changes: Partial<Pick<EventCatalogEntrant, 'categoryId' | 'categoryIds' | 'dateOfBirth' | 'entrantType' | 'firstName' | 'gender' | 'identifiers' | 'lastName' | 'memberParticipantIds' | 'name' | 'notes' | 'teamEntrantId' | 'teamMembers'>>) => void | Promise<void>;
  raceState?: Partial<RaceState>;
  selectedEntrantId?: EventEntrantId;
  selectedEventId?: EventId;
}

const UNSPECIFIED_GENDER = 'unspecified';
const CATEGORY_FILTER_ALL = 'all';
const CATEGORY_FILTER_UNASSIGNED = 'unassigned';

const getEntrantDraft = (entrant: EventCatalogEntrant | undefined): EntrantDraft => ({
  categoryId: entrant?.categoryId || entrant?.categoryIds[0] || '',
  dateOfBirth: entrant?.dateOfBirth || '',
  firstName: entrant?.firstName || '',
  gender: entrant?.gender || UNSPECIFIED_GENDER,
  lastName: entrant?.lastName || '',
  name: entrant?.name || '',
  notes: entrant?.notes || '',
  teamEntrantId: entrant?.teamEntrantId || '',
});

const eventSupportsTeams = (catalog: EventCatalogState, eventId: EventId | undefined): boolean => {
  if (!eventId) {
    return false;
  }

  return getCategoriesForEvent(catalog, eventId).some((category) => (category.teamRules?.maxTeamSize || 0) > 1) ||
    getEntrantsForEvent(catalog, eventId).some((entrant) => entrant.entrantType === 'team');
};

const getFallbackParticipantForEntrant = (entrant: EventCatalogEntrant | undefined): EventParticipant | undefined => {
  if (!entrant || entrant.entrantType !== 'rider') {
    return undefined;
  }

  const participantId = entrant.memberParticipantIds[0] || entrant.id;

  return {
    categoryId: entrant.categoryId || entrant.categoryIds[0] || '',
    currentResult: undefined,
    entrantId: entrant.id,
    firstname: entrant.firstName || entrant.name,
    id: participantId,
    identifiers: [...(entrant.identifiers || [])],
    lastRecordTime: null,
    resultDuration: null,
    surname: entrant.lastName || '',
  };
};

export const EntrantsPage = (props: EntrantsPageProps): React.ReactElement => {
  const selectedEvent = props.catalog.events.find((event) => event.id === props.selectedEventId) ??
    props.catalog.events.find((event) => event.id === props.catalog.activeEventId) ??
    props.catalog.events[0];
  const eventEntrants = getEntrantsForEvent(props.catalog, selectedEvent?.id);
  const eventCategories = getCategoriesForEvent(props.catalog, selectedEvent?.id);
  const eventSessions = getSessionsForEvent(props.catalog, selectedEvent?.id);
  const raceStateParticipants = props.raceState?.participants || [];
  const [selectedCategoryFilter, setSelectedCategoryFilter] = React.useState<string>(CATEGORY_FILTER_ALL);
  const teamEntrants = eventEntrants.filter((entrant) => entrant.entrantType === 'team');
  const teamEntrantById = new Map(teamEntrants.map((entrant) => [entrant.id.toString(), entrant]));
  const eventCategoryIds = new Set(eventCategories.map((category) => category.id.toString()));
  const eventCategoryKey = eventCategories.map((category) => category.id.toString()).join('|');

  React.useEffect(() => {
    const validCategoryIds = new Set(eventCategoryKey.split('|').filter((categoryId) => categoryId.length > 0));

    if (
      selectedCategoryFilter !== CATEGORY_FILTER_ALL &&
      selectedCategoryFilter !== CATEGORY_FILTER_UNASSIGNED &&
      !validCategoryIds.has(selectedCategoryFilter)
    ) {
      setSelectedCategoryFilter(CATEGORY_FILTER_ALL);
    }
  }, [eventCategoryKey, selectedCategoryFilter]);

  const getEntrantCategoryIds = (entrant: EventCatalogEntrant): string[] => {
    const ids = [
      entrant.categoryId?.toString() || '',
      ...entrant.categoryIds.map((categoryId) => categoryId.toString()),
    ];

    if (entrant.teamEntrantId) {
      const team = teamEntrantById.get(entrant.teamEntrantId.toString());
      if (team) {
        ids.push(team.categoryId?.toString() || '');
        ids.push(...team.categoryIds.map((categoryId) => categoryId.toString()));
      }
    }

    return Array.from(new Set(ids.filter((categoryId) => eventCategoryIds.has(categoryId))));
  };

  const entrantMatchesCategoryFilter = (entrant: EventCatalogEntrant): boolean => {
    if (selectedCategoryFilter === CATEGORY_FILTER_ALL) {
      return true;
    }

    const validCategoryIds = getEntrantCategoryIds(entrant);
    if (selectedCategoryFilter === CATEGORY_FILTER_UNASSIGNED) {
      return validCategoryIds.length === 0;
    }

    return validCategoryIds.includes(selectedCategoryFilter);
  };

  const filteredEventEntrants = eventEntrants.filter((entrant) => entrantMatchesCategoryFilter(entrant));
  const riderEntrants = filteredEventEntrants.filter((entrant) => entrant.entrantType === 'rider');
  const filteredTeamEntrants = filteredEventEntrants.filter((entrant) => entrant.entrantType === 'team');
  const teamsEnabled = eventSupportsTeams(props.catalog, selectedEvent?.id);
  const selectedEntrant = filteredEventEntrants.find((entrant) => entrant.id === props.selectedEntrantId) ?? filteredEventEntrants[0];
  const selectedParticipants = getParticipantsForEntrant(selectedEntrant, raceStateParticipants, eventEntrants);
  const selectedIdentificationParticipant = selectedParticipants[0] || getFallbackParticipantForEntrant(selectedEntrant);
  const identificationParticipants = selectedParticipants.length > 0
    ? selectedParticipants
    : selectedIdentificationParticipant
      ? [selectedIdentificationParticipant]
      : [];
  const selectedEntrantDraft = React.useMemo(() => getEntrantDraft(selectedEntrant), [selectedEntrant]);
  const [createKind, setCreateKind] = React.useState<EntrantType>('rider');
  const [entrantDraft, setEntrantDraft] = React.useState<EntrantDraft>(selectedEntrantDraft);
  const [savedEntrantDraft, setSavedEntrantDraft] = React.useState<EntrantDraft>(selectedEntrantDraft);
  const hasUnsavedChanges = selectedEntrant
    ? JSON.stringify(entrantDraft) !== JSON.stringify(savedEntrantDraft)
    : false;

  React.useEffect(() => {
    setEntrantDraft(selectedEntrantDraft);
    setSavedEntrantDraft(selectedEntrantDraft);
  }, [selectedEntrantDraft]);

  const selectedEntrantSessionIds = getEntrantAssignedSessionIds(selectedEntrant, eventCategories, eventSessions, eventEntrants);
  const selectedEntrantSessions = eventSessions.filter((session) => selectedEntrantSessionIds.has(session.id));
  const selectedTeamName = selectedEntrant?.teamEntrantId
    ? teamEntrants.find((team) => team.id === selectedEntrant.teamEntrantId)?.name
    : undefined;
  const selectedTeamMembers = selectedEntrant?.entrantType === 'team'
    ? riderEntrants
      .filter((entrant) => entrant.teamEntrantId === selectedEntrant.id)
      .map((entrant) => entrant.name)
    : [];

  const saveEntrant = async (): Promise<boolean> => {
    if (!selectedEntrant) {
      return true;
    }

    if (selectedEntrant.entrantType === 'team') {
      await props.onUpdateEntrant(selectedEntrant.id, {
        categoryId: entrantDraft.categoryId || undefined,
        name: entrantDraft.name,
        notes: entrantDraft.notes || undefined,
      });
      setSavedEntrantDraft(entrantDraft);
      return true;
    }

    await props.onUpdateEntrant(selectedEntrant.id, {
      categoryId: entrantDraft.categoryId || undefined,
      dateOfBirth: entrantDraft.dateOfBirth || undefined,
      firstName: entrantDraft.firstName || undefined,
      gender: entrantDraft.gender === UNSPECIFIED_GENDER ? undefined : entrantDraft.gender,
      lastName: entrantDraft.lastName || undefined,
      name: entrantDraft.name,
      notes: entrantDraft.notes || undefined,
      teamEntrantId: entrantDraft.teamEntrantId || undefined,
    });
    setSavedEntrantDraft(entrantDraft);
    return true;
  };

  const deleteEntrant = (): void => {
    if (!selectedEvent || !selectedEntrant) {
      return;
    }

    requestFormExit(() => props.onDeleteEntrant(selectedEvent.id, selectedEntrant.id));
  };

  const { requestExit: requestFormExit, warningModal } = useUnsavedChangesWarning({
    hasUnsavedChanges: hasUnsavedChanges && !!selectedEntrant,
    itemName: selectedEntrant?.name || selectedEntrant?.id,
    itemType: 'entrant',
    onSave: saveEntrant,
    onUnsavedChangesGuardChange: props.onUnsavedChangesGuardChange,
  });

  return (
    <section className="events-screen">
      <h1>Entrants</h1>
      <label className="page-filter-label">
        Event
        <select
          aria-label="Entrants Event"
          value={selectedEvent?.id || ''}
          onChange={(event) => {
            const eventId = event.target.value;
            requestFormExit(() => props.onSelectEvent(eventId));
          }}
        >
          {props.catalog.events.map((event) => (
            <option key={event.id} value={event.id}>{event.name}</option>
          ))}
        </select>
      </label>
      <label className="page-filter-label">
        Category
        <select
          aria-label="Entrants Category"
          value={selectedCategoryFilter}
          onChange={(event) => setSelectedCategoryFilter(event.target.value)}
        >
          <option value={CATEGORY_FILTER_ALL}>All</option>
          <option value={CATEGORY_FILTER_UNASSIGNED}>Unassigned</option>
          {eventCategories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
      </label>
      <div className="events-layout">
        <EntrantListPanel
          catalog={props.catalog}
          createKind={createKind}
          filteredTeamEntrants={filteredTeamEntrants}
          onCreateEntrant={props.onCreateEntrant}
          onSelectEntrant={props.onSelectEntrant}
          raceStateParticipants={raceStateParticipants}
          requestFormExit={requestFormExit}
          riderEntrants={riderEntrants}
          selectedEntrant={selectedEntrant}
          selectedEventId={selectedEvent?.id}
          setCreateKind={setCreateKind}
          teamEntrants={teamEntrants}
          teamsEnabled={teamsEnabled}
        />
        <EntrantDetailsPanel
          entrantDraft={entrantDraft}
          eventCategories={eventCategories}
          onDeleteEntrant={deleteEntrant}
          onSaveEntrant={() => {
            void saveEntrant();
          }}
          onSetEntrantDraft={setEntrantDraft}
          selectedEntrant={selectedEntrant}
          selectedTeamName={selectedTeamName}
          teamEntrants={teamEntrants}
          teamMembers={selectedTeamMembers}
          warningModal={warningModal}
        />
        <div className="event-summary-column">
          <SessionListPanel
            emptyText="No sessions are currently assigned to this entrant."
            sessions={selectedEntrantSessions}
            title="Sessions for Entrant"
          />
          <IdentificationPanel
            enableMultiplePlates={props.enableMultiplePlates}
            onUpdateParticipantIdentifiers={props.onUpdateParticipantIdentifiers}
            participants={identificationParticipants}
            selectedParticipant={selectedIdentificationParticipant}
          />
        </div>
      </div>
    </section>
  );
};
