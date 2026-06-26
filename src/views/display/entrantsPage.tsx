import React from 'react';
import {
  type EntrantType,
  type EventCatalogEntrant,
  type EventCatalogState,
  getCategoriesForEvent,
  getEntrantsForEvent,
  getSessionsForEvent,
} from '../../app/eventCatalog.js';
import { CategoryId } from '../../controllers/category.js';
import { getParticipantNumber, getParticipantTransponders } from '../../controllers/participant.js';
import { EntrantListCard } from '../../controls/entrantListCard.js';
import { LicencesControl } from '../../controls/licencesControl.js';
import { RaceNumbersControl } from '../../controls/raceNumbersControl.js';
import { TimingDevicesControl } from '../../controls/timingDevicesControl.js';
import { EventEntrantId } from '../../model/entrant.js';
import { type EventParticipant, type EventParticipantId } from '../../model/eventparticipant.js';
import { type RaceState } from '../../model/racestate.js';
import { EventId } from '../../model/raceevent.js';
import { type UnsavedChangesGuard, useUnsavedChangesWarning } from './unsavedChangesWarning.js';

interface EntrantsPageProps {
  catalog: EventCatalogState;
  onCreateEntrant: (eventId: EventId, entrantType?: EntrantType) => void | Promise<void>;
  onDeleteEntrant: (eventId: EventId, entrantId: EventEntrantId) => void | Promise<void>;
  onSelectEntrant: (entrantId: EventEntrantId) => void;
  onSelectEvent: (eventId: EventId) => void;
  onUnsavedChangesGuardChange?: (guard: UnsavedChangesGuard | undefined) => void;
  onUpdateParticipantIdentifiers?: (participantId: EventParticipantId, identifierType: 'racePlate' | 'txNo', values: Array<string | number>) => void | Promise<void>;
  onUpdateEntrant: (entrantId: EventEntrantId, changes: Partial<Pick<EventCatalogEntrant, 'categoryId' | 'categoryIds' | 'dateOfBirth' | 'entrantType' | 'firstName' | 'gender' | 'lastName' | 'memberParticipantIds' | 'name' | 'notes' | 'sessionIds' | 'teamEntrantId' | 'teamMembers'>>) => void | Promise<void>;
  raceState?: Partial<RaceState>;
  selectedEntrantId?: EventEntrantId;
  selectedEventId?: EventId;
}

interface EntrantDraft {
  categoryId: CategoryId;
  dateOfBirth: string;
  firstName: string;
  gender: string;
  lastName: string;
  name: string;
  notes: string;
  teamEntrantId: EventEntrantId;
}

const UNSPECIFIED_GENDER = 'unspecified';
const CATEGORY_FILTER_ALL = 'all';
const CATEGORY_FILTER_UNASSIGNED = 'unassigned';

const getCategoryName = (catalog: EventCatalogState, categoryId?: CategoryId): string => {
  if (!categoryId) {
    return 'No category';
  }

  return catalog.categories.find((category) => category.id === categoryId)?.name || categoryId;
};

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

const getParticipantsForEntrant = (
  entrant: EventCatalogEntrant | undefined,
  participants: EventParticipant[]
): EventParticipant[] => {
  if (!entrant) {
    return [];
  }

  const participantIds = new Set([
    entrant.id.toString(),
    ...entrant.memberParticipantIds.map((participantId) => participantId.toString()),
  ]);

  return participants.filter((participant) => {
    return participantIds.has(participant.id.toString()) || participant.entrantId?.toString() === entrant.id.toString();
  });
};

const ReadOnlyList = (props: { emptyText: string; items: string[] }): React.ReactElement => {
  if (props.items.length === 0) {
    return <p className="readonly-summary">{props.emptyText}</p>;
  }

  return (
    <ul className="readonly-summary-list">
      {props.items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
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
  const selectedParticipants = getParticipantsForEntrant(selectedEntrant, raceStateParticipants);
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

  const sessionNames = selectedEntrant
    ? eventSessions
      .filter((session) => selectedEntrant.sessionIds.includes(session.id))
      .map((session) => session.name)
    : [];
  const selectedTeamName = selectedEntrant?.teamEntrantId
    ? teamEntrants.find((team) => team.id === selectedEntrant.teamEntrantId)?.name
    : undefined;

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
        <section className="events-panel">
          <h2>Entrant List</h2>
          <div className="events-actions">
            {teamsEnabled ? (
              <label className="compact-action-label">
                Create
                <select
                  aria-label="Create Entrant Kind"
                  value={createKind}
                  onChange={(event) => setCreateKind(event.target.value as EntrantType)}
                >
                  <option value="rider">Create entrant</option>
                  <option value="team">Create team</option>
                </select>
              </label>
            ) : null}
            <button type="button" onClick={() => selectedEvent && requestFormExit(() => props.onCreateEntrant(selectedEvent.id, teamsEnabled ? createKind : 'rider'))} disabled={!selectedEvent}>
              {teamsEnabled && createKind === 'team' ? 'Create Team' : 'Create Entrant'}
            </button>
          </div>
          <div className="events-list" role="listbox" aria-label="Entrants for selected event">
            {riderEntrants.length > 0 ? (
              <>
                {teamsEnabled ? <h3 className="events-list-subheading">Individual Entrants</h3> : null}
                {riderEntrants.map((entrant) => {
                  const participant = getParticipantsForEntrant(entrant, raceStateParticipants)[0];
                  const teamName = entrant.teamEntrantId
                    ? teamEntrants.find((team) => team.id === entrant.teamEntrantId)?.name
                    : undefined;
                  const categoryId = entrant.categoryId || entrant.categoryIds[0];

                  return (
                    <EntrantListCard
                      key={entrant.id}
                      entrant={entrant}
                      categoryName={getCategoryName(props.catalog, categoryId)}
                      isSelected={entrant.id === selectedEntrant?.id}
                      raceNumber={participant ? getParticipantNumber(participant) : undefined}
                      onSelect={() => requestFormExit(() => props.onSelectEntrant(entrant.id))}
                      timingDevices={participant ? getParticipantTransponders(participant) : undefined}
                      teamName={teamName}
                    />
                  );
                })}
              </>
            ) : null}
            {teamsEnabled && filteredTeamEntrants.length > 0 ? (
              <>
                <h3 className="events-list-subheading">Teams</h3>
                {filteredTeamEntrants.map((entrant) => {
                  const participant = getParticipantsForEntrant(entrant, raceStateParticipants)[0];

                  return (
                    <EntrantListCard
                      key={entrant.id}
                      entrant={entrant}
                      isSelected={entrant.id === selectedEntrant?.id}
                      onSelect={() => requestFormExit(() => props.onSelectEntrant(entrant.id))}
                      raceNumber={participant ? getParticipantNumber(participant) : undefined}
                      timingDevices={participant ? getParticipantTransponders(participant) : undefined}
                    />
                  );
                })}
              </>
            ) : null}
          </div>
        </section>
        <section className="events-panel">
          <h2>{selectedEntrant?.entrantType === 'team' ? 'Team Details' : 'Entrant Details'}</h2>
          {selectedEntrant ? (
            <>
              <label>
                {selectedEntrant.entrantType === 'team' ? 'Team Name' : 'Entrant Name'}
                <input
                  aria-label="Entrant Name"
                  type="text"
                  value={entrantDraft.name}
                  onChange={(event) => setEntrantDraft((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              {selectedEntrant.entrantType === 'rider' ? (
                <>
                  <label>
                    First Name
                    <input
                      aria-label="Entrant First Name"
                      type="text"
                      value={entrantDraft.firstName}
                      onChange={(event) => setEntrantDraft((current) => ({ ...current, firstName: event.target.value }))}
                    />
                  </label>
                  <label>
                    Surname
                    <input
                      aria-label="Entrant Surname"
                      type="text"
                      value={entrantDraft.lastName}
                      onChange={(event) => setEntrantDraft((current) => ({ ...current, lastName: event.target.value }))}
                    />
                  </label>
                  <label>
                    Gender
                    <select
                      aria-label="Entrant Gender"
                      value={entrantDraft.gender}
                      onChange={(event) => setEntrantDraft((current) => ({ ...current, gender: event.target.value }))}
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value={UNSPECIFIED_GENDER}>Unspecified</option>
                    </select>
                  </label>
                  <label>
                    Date of Birth
                    <input
                      aria-label="Entrant Date Of Birth"
                      type="date"
                      value={entrantDraft.dateOfBirth}
                      onChange={(event) => setEntrantDraft((current) => ({ ...current, dateOfBirth: event.target.value }))}
                    />
                  </label>
                  <label>
                    Team
                    <select
                      aria-label="Entrant Team"
                      value={entrantDraft.teamEntrantId}
                      onChange={(event) => setEntrantDraft((current) => ({ ...current, teamEntrantId: event.target.value }))}
                    >
                      <option value="">Individual entry</option>
                      {teamEntrants.map((team) => (
                        <option key={team.id} value={team.id}>{team.name}</option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <>
                  <h3>Team Members</h3>
                  <ReadOnlyList
                    emptyText="No riders are assigned to this team."
                    items={riderEntrants
                      .filter((entrant) => entrant.teamEntrantId === selectedEntrant.id)
                      .map((entrant) => entrant.name)}
                  />
                </>
              )}
              <label>
                Category
                <select
                  aria-label="Entrant Category"
                  value={entrantDraft.categoryId}
                  onChange={(event) => setEntrantDraft((current) => ({ ...current, categoryId: event.target.value }))}
                >
                  <option value="">No category</option>
                  {eventCategories.map((category) => (
                    <option key={category.id.toString()} value={category.id.toString()}>{category.name}</option>
                  ))}
                </select>
              </label>
              <section className="readonly-summary-section">
                <h3>Sessions</h3>
                <ReadOnlyList emptyText="No sessions are assigned." items={sessionNames} />
              </section>
              {selectedEntrant.entrantType === 'rider' && selectedTeamName ? (
                <p className="readonly-summary">Team: {selectedTeamName}</p>
              ) : null}
              <label>
                Notes
                <textarea
                  aria-label="Entrant Notes"
                  value={entrantDraft.notes}
                  onChange={(event) => setEntrantDraft((current) => ({ ...current, notes: event.target.value }))}
                />
              </label>
              <div className="events-actions">
                <button type="button" onClick={() => {
                  void saveEntrant();
                }}>
                  Save Entrant
                </button>
                <button type="button" onClick={() => selectedEvent && requestFormExit(() => props.onDeleteEntrant(selectedEvent.id, selectedEntrant.id))}>
                  Delete Entrant
                </button>
              </div>
              {warningModal}
            </>
          ) : (
            <p>No entrants are defined for this event.</p>
          )}
        </section>
        <section className="events-panel">
          <h2>Identification</h2>
          <RaceNumbersControl
            participants={selectedParticipants}
            onUpdateRaceNumbers={(participantId, raceNumbers) => props.onUpdateParticipantIdentifiers?.(participantId, 'racePlate', raceNumbers)}
          />
          <TimingDevicesControl
            participants={selectedParticipants}
            onUpdateTimingDevices={(participantId, timingDevices) => props.onUpdateParticipantIdentifiers?.(participantId, 'txNo', timingDevices)}
          />
          <LicencesControl />
        </section>
      </div>
    </section>
  );
};
