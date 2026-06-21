import {
  type EntrantType,
  type EventCatalogEntrant,
  type EventCatalogState,
  getCategoriesForEvent,
  getEntrantsForEvent,
  getSessionsForEvent,
} from '../../app/eventCatalog.js';
import React from 'react';

interface EntrantsPageProps {
  catalog: EventCatalogState;
  onCreateEntrant: (eventId: string, entrantType?: EntrantType) => void | Promise<void>;
  onDeleteEntrant: (eventId: string, entrantId: string) => void | Promise<void>;
  onSelectEntrant: (entrantId: string) => void;
  onSelectEvent: (eventId: string) => void;
  onUpdateEntrant: (entrantId: string, changes: Partial<Pick<EventCatalogEntrant, 'categoryId' | 'categoryIds' | 'dateOfBirth' | 'entrantType' | 'firstName' | 'gender' | 'lastName' | 'memberParticipantIds' | 'name' | 'notes' | 'sessionIds' | 'teamEntrantId' | 'teamMembers'>>) => void | Promise<void>;
  selectedEntrantId?: string;
  selectedEventId?: string;
}

interface EntrantDraft {
  categoryId: string;
  dateOfBirth: string;
  firstName: string;
  gender: string;
  lastName: string;
  name: string;
  notes: string;
  teamEntrantId: string;
}

const UNSPECIFIED_GENDER = 'unspecified';

const getCategoryName = (catalog: EventCatalogState, categoryId?: string): string => {
  if (!categoryId) {
    return 'No category';
  }

  return catalog.categories.find((category) => category.id.toString() === categoryId)?.name || categoryId;
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

const eventSupportsTeams = (catalog: EventCatalogState, eventId: string | undefined): boolean => {
  if (!eventId) {
    return false;
  }

  return getCategoriesForEvent(catalog, eventId).some((category) => (category.teamRules?.maxTeamSize || 0) > 1) ||
    getEntrantsForEvent(catalog, eventId).some((entrant) => entrant.entrantType === 'team');
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
  const teamEntrants = eventEntrants.filter((entrant) => entrant.entrantType === 'team');
  const riderEntrants = eventEntrants.filter((entrant) => entrant.entrantType === 'rider');
  const teamsEnabled = eventSupportsTeams(props.catalog, selectedEvent?.id);
  const selectedEntrant = eventEntrants.find((entrant) => entrant.id === props.selectedEntrantId) ?? eventEntrants[0];
  const [createKind, setCreateKind] = React.useState<EntrantType>('rider');
  const [entrantDraft, setEntrantDraft] = React.useState<EntrantDraft>(getEntrantDraft(selectedEntrant));

  React.useEffect(() => {
    setEntrantDraft(getEntrantDraft(selectedEntrant));
  }, [selectedEntrant]);

  const sessionNames = selectedEntrant
    ? eventSessions
      .filter((session) => selectedEntrant.sessionIds.includes(session.id))
      .map((session) => session.name)
    : [];
  const selectedTeamName = selectedEntrant?.teamEntrantId
    ? teamEntrants.find((team) => team.id === selectedEntrant.teamEntrantId)?.name
    : undefined;

  const saveEntrant = (): void => {
    if (!selectedEntrant) {
      return;
    }

    if (selectedEntrant.entrantType === 'team') {
      void props.onUpdateEntrant(selectedEntrant.id, {
        categoryId: entrantDraft.categoryId || undefined,
        name: entrantDraft.name,
        notes: entrantDraft.notes || undefined,
      });
      return;
    }

    void props.onUpdateEntrant(selectedEntrant.id, {
      categoryId: entrantDraft.categoryId || undefined,
      dateOfBirth: entrantDraft.dateOfBirth || undefined,
      firstName: entrantDraft.firstName || undefined,
      gender: entrantDraft.gender === UNSPECIFIED_GENDER ? undefined : entrantDraft.gender,
      lastName: entrantDraft.lastName || undefined,
      name: entrantDraft.name,
      notes: entrantDraft.notes || undefined,
      teamEntrantId: entrantDraft.teamEntrantId || undefined,
    });
  };

  const renderEntrantButton = (entrant: EventCatalogEntrant): React.ReactElement => {
    const isSelected = entrant.id === selectedEntrant?.id;
    const categoryId = entrant.categoryId || entrant.categoryIds[0];
    const teamName = entrant.teamEntrantId
      ? teamEntrants.find((team) => team.id === entrant.teamEntrantId)?.name
      : undefined;

    return (
      <button
        key={entrant.id}
        type="button"
        className={`events-list-item${isSelected ? ' selected' : ''}`}
        onClick={() => props.onSelectEntrant(entrant.id)}
        aria-selected={isSelected}
      >
        {entrant.entrantType === 'rider' ? (
          <span className="entrant-category-chip">{getCategoryName(props.catalog, categoryId)}</span>
        ) : null}
        <strong>{entrant.name}</strong>
        <span className="entrant-list-type">{entrant.entrantType}</span>
        {teamName ? (
          <span className="entrantTeam">Team: {teamName}</span>
        ) : null}
      </button>
    );
  };

  return (
    <section className="events-screen">
      <h1>Entrants</h1>
      <label className="page-filter-label">
        Event
        <select
          aria-label="Entrants Event"
          value={selectedEvent?.id || ''}
          onChange={(event) => props.onSelectEvent(event.target.value)}
        >
          {props.catalog.events.map((event) => (
            <option key={event.id} value={event.id}>{event.name}</option>
          ))}
        </select>
      </label>
      <div className="events-layout two-panel">
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
            <button type="button" onClick={() => selectedEvent && props.onCreateEntrant(selectedEvent.id, teamsEnabled ? createKind : 'rider')} disabled={!selectedEvent}>
              {teamsEnabled && createKind === 'team' ? 'Create Team' : 'Create Entrant'}
            </button>
          </div>
          <div className="events-list" role="listbox" aria-label="Entrants for selected event">
            {teamsEnabled && teamEntrants.length > 0 ? (
              <>
                <h3 className="events-list-subheading">Teams</h3>
                {teamEntrants.map(renderEntrantButton)}
              </>
            ) : null}
            {riderEntrants.length > 0 ? (
              <>
                {teamsEnabled ? <h3 className="events-list-subheading">Riders</h3> : null}
                {riderEntrants.map(renderEntrantButton)}
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
                <button type="button" onClick={saveEntrant}>
                  Save Entrant
                </button>
                <button type="button" onClick={() => selectedEvent && props.onDeleteEntrant(selectedEvent.id, selectedEntrant.id)}>
                  Delete Entrant
                </button>
              </div>
            </>
          ) : (
            <p>No entrants are defined for this event.</p>
          )}
        </section>
      </div>
    </section>
  );
};
