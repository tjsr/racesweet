import React from 'react';
import { type EntrantType, type EventCatalogEntrant, type EventCatalogState } from '../../app/eventCatalog.js';
import { CategoryId } from '../../controllers/category.js';
import { getParticipantNumber, getParticipantTransponders } from '../../controllers/participant.js';
import { EntrantListCard } from '../../controls/entrantListCard.js';
import { EventEntrantId } from '../../model/entrant.js';
import { type EventParticipant } from '../../model/eventparticipant.js';
import { EventId } from '../../model/raceevent.js';

interface EntrantListPanelProps {
  catalog: EventCatalogState;
  createKind: EntrantType;
  filteredTeamEntrants: EventCatalogEntrant[];
  onCreateEntrant: (eventId: EventId, entrantType?: EntrantType) => void | Promise<void>;
  onSelectEntrant: (entrantId: EventEntrantId) => void;
  raceStateParticipants: EventParticipant[];
  requestFormExit: (action: () => void | Promise<void>) => void;
  riderEntrants: EventCatalogEntrant[];
  selectedEntrant?: EventCatalogEntrant;
  selectedEventId?: EventId;
  setCreateKind: React.Dispatch<React.SetStateAction<EntrantType>>;
  teamEntrants: EventCatalogEntrant[];
  teamsEnabled: boolean;
}

const getCategoryName = (catalog: EventCatalogState, categoryId?: CategoryId): string => {
  if (!categoryId) {
    return 'No category';
  }

  return catalog.categories.find((category) => category.id === categoryId)?.name || categoryId;
};

export const getParticipantsForEntrant = (
  entrant: EventCatalogEntrant | undefined,
  participants: EventParticipant[],
  eventEntrants: EventCatalogEntrant[] = []
): EventParticipant[] => {
  if (!entrant) {
    return [];
  }

  const participantIds = new Set([
    entrant.id.toString(),
    ...entrant.memberParticipantIds.map((participantId) => participantId.toString()),
  ]);
  entrant.teamMembers?.forEach((teamMember) => participantIds.add(teamMember.participantId.toString()));

  if (entrant.entrantType === 'rider' && entrant.teamEntrantId) {
    const teamEntrant = eventEntrants.find((candidate) => candidate.id === entrant.teamEntrantId);
    const matchingTeamMember = teamEntrant?.teamMembers?.find((teamMember) => {
      if (teamMember.participantId === entrant.id || entrant.memberParticipantIds.includes(teamMember.participantId)) {
        return true;
      }

      const memberName = `${teamMember.firstName} ${teamMember.lastName}`.trim();
      const entrantName = `${entrant.firstName || ''} ${entrant.lastName || ''}`.trim();
      return memberName.length > 0 && (memberName === entrantName || memberName === entrant.name);
    });

    if (matchingTeamMember) {
      participantIds.add(matchingTeamMember.participantId.toString());
    }
  }

  return participants.filter((participant) => {
    return participantIds.has(participant.id.toString()) || participant.entrantId?.toString() === entrant.id.toString();
  });
};

export const EntrantListPanel = (props: EntrantListPanelProps): React.ReactElement => (
  <section className="events-panel">
    <h2>Entrant List</h2>
    <div className="events-actions">
      {props.teamsEnabled ? (
        <label className="compact-action-label">
          Create
          <select
            aria-label="Create Entrant Kind"
            value={props.createKind}
            onChange={(event) => props.setCreateKind(event.target.value as EntrantType)}
          >
            <option value="rider">Create entrant</option>
            <option value="team">Create team</option>
          </select>
        </label>
      ) : null}
      <button
        type="button"
        onClick={() => {
          if (!props.selectedEventId) {
            return;
          }

          const selectedEventId = props.selectedEventId;
          props.requestFormExit(() => props.onCreateEntrant(
            selectedEventId,
            props.teamsEnabled ? props.createKind : 'rider'
          ));
        }}
        disabled={!props.selectedEventId}
      >
        {props.teamsEnabled && props.createKind === 'team' ? 'Create Team' : 'Create Entrant'}
      </button>
    </div>
    <div className="events-list" role="listbox" aria-label="Entrants for selected event">
      {props.riderEntrants.length > 0 ? (
        <>
          {props.teamsEnabled ? <h3 className="events-list-subheading">Individual Entrants</h3> : null}
          {props.riderEntrants.map((entrant) => {
            const participant = getParticipantsForEntrant(entrant, props.raceStateParticipants, props.teamEntrants)[0];
            const teamName = entrant.teamEntrantId
              ? props.teamEntrants.find((team) => team.id === entrant.teamEntrantId)?.name
              : undefined;
            const categoryId = entrant.categoryId || entrant.categoryIds[0];

            return (
              <EntrantListCard
                key={entrant.id}
                entrant={entrant}
                categoryName={getCategoryName(props.catalog, categoryId)}
                isSelected={entrant.id === props.selectedEntrant?.id}
                raceNumber={participant ? getParticipantNumber(participant) : undefined}
                onSelect={() => props.requestFormExit(() => props.onSelectEntrant(entrant.id))}
                timingDevices={participant ? getParticipantTransponders(participant) : undefined}
                teamName={teamName}
              />
            );
          })}
        </>
      ) : null}
      {props.teamsEnabled && props.filteredTeamEntrants.length > 0 ? (
        <>
          <h3 className="events-list-subheading">Teams</h3>
          {props.filteredTeamEntrants.map((entrant) => {
            const participant = getParticipantsForEntrant(entrant, props.raceStateParticipants, props.teamEntrants)[0];

            return (
              <EntrantListCard
                key={entrant.id}
                entrant={entrant}
                isSelected={entrant.id === props.selectedEntrant?.id}
                onSelect={() => props.requestFormExit(() => props.onSelectEntrant(entrant.id))}
                raceNumber={participant ? getParticipantNumber(participant) : undefined}
                timingDevices={participant ? getParticipantTransponders(participant) : undefined}
              />
            );
          })}
        </>
      ) : null}
    </div>
  </section>
);
