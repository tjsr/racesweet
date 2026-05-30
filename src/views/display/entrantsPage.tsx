import React from 'react';

import {
  getEntrantsForEvent,
  type EventCatalogEntrant,
  type EventCatalogState,
} from '../../app/eventCatalog.js';

interface EntrantsPageProps {
  catalog: EventCatalogState;
  onCreateEntrant: (eventId: string) => void | Promise<void>;
  onDeleteEntrant: (eventId: string, entrantId: string) => void | Promise<void>;
  onSelectEntrant: (entrantId: string) => void;
  onSelectEvent: (eventId: string) => void;
  onUpdateEntrant: (entrantId: string, changes: Partial<Pick<EventCatalogEntrant, 'categoryId' | 'categoryIds' | 'dateOfBirth' | 'entrantType' | 'firstName' | 'gender' | 'lastName' | 'memberParticipantIds' | 'name' | 'notes' | 'sessionIds' | 'teamMembers'>>) => void | Promise<void>;
  selectedEntrantId?: string;
  selectedEventId?: string;
}

const splitCsv = (value: string): string[] => value.split(',').map((item) => item.trim()).filter((item) => item.length > 0);

export const EntrantsPage = (props: EntrantsPageProps): React.ReactElement => {
  const selectedEvent = props.catalog.events.find((event) => event.id === props.selectedEventId)
    ?? props.catalog.events.find((event) => event.id === props.catalog.activeEventId)
    ?? props.catalog.events[0];
  const eventEntrants = getEntrantsForEvent(props.catalog, selectedEvent?.id);
  const selectedEntrant = eventEntrants.find((entrant) => entrant.id === props.selectedEntrantId) ?? eventEntrants[0];

  const [entrantDraft, setEntrantDraft] = React.useState({
    categoryId: selectedEntrant?.categoryId || '',
    categoryIds: selectedEntrant?.categoryIds.join(', ') || '',
    dateOfBirth: selectedEntrant?.dateOfBirth || '',
    entrantType: selectedEntrant?.entrantType || 'rider',
    firstName: selectedEntrant?.firstName || '',
    gender: selectedEntrant?.gender || '',
    lastName: selectedEntrant?.lastName || '',
    memberParticipantIds: selectedEntrant?.memberParticipantIds.join(', ') || '',
    name: selectedEntrant?.name || '',
    notes: selectedEntrant?.notes || '',
    sessionIds: selectedEntrant?.sessionIds.join(', ') || '',
    teamMembers: selectedEntrant?.teamMembers?.map((member) => {
      return `${member.participantId}:${member.firstName}:${member.lastName}:${member.categoryId || ''}`;
    }).join('; ') || '',
  });

  React.useEffect(() => {
    setEntrantDraft({
      categoryId: selectedEntrant?.categoryId || '',
      categoryIds: selectedEntrant?.categoryIds.join(', ') || '',
      dateOfBirth: selectedEntrant?.dateOfBirth || '',
      entrantType: selectedEntrant?.entrantType || 'rider',
      firstName: selectedEntrant?.firstName || '',
      gender: selectedEntrant?.gender || '',
      lastName: selectedEntrant?.lastName || '',
      memberParticipantIds: selectedEntrant?.memberParticipantIds.join(', ') || '',
      name: selectedEntrant?.name || '',
      notes: selectedEntrant?.notes || '',
      sessionIds: selectedEntrant?.sessionIds.join(', ') || '',
      teamMembers: selectedEntrant?.teamMembers?.map((member) => {
        return `${member.participantId}:${member.firstName}:${member.lastName}:${member.categoryId || ''}`;
      }).join('; ') || '',
    });
  }, [selectedEntrant?.id, selectedEntrant?.name, selectedEntrant?.entrantType, selectedEntrant?.notes, selectedEntrant?.categoryIds, selectedEntrant?.categoryId, selectedEntrant?.dateOfBirth, selectedEntrant?.firstName, selectedEntrant?.gender, selectedEntrant?.lastName, selectedEntrant?.memberParticipantIds, selectedEntrant?.sessionIds, selectedEntrant?.teamMembers]);

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
            <button type="button" onClick={() => selectedEvent && props.onCreateEntrant(selectedEvent.id)} disabled={!selectedEvent}>
              Create Entrant
            </button>
          </div>
          <div className="events-list" role="listbox" aria-label="Entrants for selected event">
            {eventEntrants.map((entrant) => {
              const isSelected = entrant.id === selectedEntrant?.id;
              return (
                <button
                  key={entrant.id}
                  type="button"
                  className={`events-list-item${isSelected ? ' selected' : ''}`}
                  onClick={() => props.onSelectEntrant(entrant.id)}
                  aria-selected={isSelected}
                >
                  <strong>{entrant.name}</strong>
                  <span>{entrant.entrantType}</span>
                  <span>{entrant.id}</span>
                </button>
              );
            })}
          </div>
        </section>
        <section className="events-panel">
          <h2>Entrant Details</h2>
          {selectedEntrant ? (
            <>
              <label>
                Entrant Name
                <input
                  aria-label="Entrant Name"
                  type="text"
                  value={entrantDraft.name}
                  onChange={(event) => setEntrantDraft((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label>
                Entrant Type
                <select
                  aria-label="Entrant Type"
                  value={entrantDraft.entrantType}
                  onChange={(event) => setEntrantDraft((current) => ({ ...current, entrantType: event.target.value as EventCatalogEntrant['entrantType'] }))}
                >
                  <option value="rider">Rider</option>
                  <option value="team">Team</option>
                </select>
              </label>
              {entrantDraft.entrantType === 'rider' ? (
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
                    <input
                      aria-label="Entrant Gender"
                      type="text"
                      value={entrantDraft.gender}
                      onChange={(event) => setEntrantDraft((current) => ({ ...current, gender: event.target.value }))}
                    />
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
                    Primary Category ID
                    <input
                      aria-label="Entrant Primary Category"
                      type="text"
                      value={entrantDraft.categoryId}
                      onChange={(event) => setEntrantDraft((current) => ({ ...current, categoryId: event.target.value }))}
                    />
                  </label>
                </>
              ) : (
                <label>
                  Team Members (participantId:firstName:lastName:categoryId; ...)
                  <textarea
                    aria-label="Entrant Team Members"
                    value={entrantDraft.teamMembers}
                    onChange={(event) => setEntrantDraft((current) => ({ ...current, teamMembers: event.target.value }))}
                  />
                </label>
              )}
              <label>
                Category IDs (comma-separated)
                <input
                  aria-label="Entrant Category IDs"
                  type="text"
                  value={entrantDraft.categoryIds}
                  onChange={(event) => setEntrantDraft((current) => ({ ...current, categoryIds: event.target.value }))}
                />
              </label>
              <label>
                Session IDs (comma-separated)
                <input
                  aria-label="Entrant Session IDs"
                  type="text"
                  value={entrantDraft.sessionIds}
                  onChange={(event) => setEntrantDraft((current) => ({ ...current, sessionIds: event.target.value }))}
                />
              </label>
              <label>
                Member Participant IDs (comma-separated)
                <input
                  aria-label="Entrant Participant IDs"
                  type="text"
                  value={entrantDraft.memberParticipantIds}
                  onChange={(event) => setEntrantDraft((current) => ({ ...current, memberParticipantIds: event.target.value }))}
                />
              </label>
              <label>
                Notes
                <textarea
                  aria-label="Entrant Notes"
                  value={entrantDraft.notes}
                  onChange={(event) => setEntrantDraft((current) => ({ ...current, notes: event.target.value }))}
                />
              </label>
              <div className="events-actions">
                <button
                  type="button"
                  onClick={() => props.onUpdateEntrant(selectedEntrant.id, {
                    categoryId: entrantDraft.categoryId || undefined,
                    categoryIds: splitCsv(entrantDraft.categoryIds),
                    dateOfBirth: entrantDraft.dateOfBirth || undefined,
                    entrantType: entrantDraft.entrantType as EventCatalogEntrant['entrantType'],
                    firstName: entrantDraft.firstName || undefined,
                    gender: entrantDraft.gender || undefined,
                    lastName: entrantDraft.lastName || undefined,
                    memberParticipantIds: splitCsv(entrantDraft.memberParticipantIds),
                    name: entrantDraft.name,
                    notes: entrantDraft.notes || undefined,
                    sessionIds: splitCsv(entrantDraft.sessionIds),
                    teamMembers: entrantDraft.entrantType === 'team'
                      ? entrantDraft.teamMembers
                          .split(';')
                          .map((memberChunk) => memberChunk.trim())
                          .filter((memberChunk) => memberChunk.length > 0)
                          .map((memberChunk) => {
                            const [participantId, firstName, lastName, categoryId] = memberChunk.split(':').map((item) => item.trim());
                            return {
                              categoryId: categoryId || undefined,
                              firstName: firstName || '',
                              lastName: lastName || '',
                              participantId: participantId || '',
                            };
                          })
                      : undefined,
                  })}
                >
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
