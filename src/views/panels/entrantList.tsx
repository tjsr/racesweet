import React from 'react';
import {
  type EntrantType,
  type EventCatalogEntrant,
  type EventCatalogEntry,
  type EventCatalogState,
  getEntriesForEvent,
} from '../../catalog/eventCatalog.js';
import { type CategoryId } from '../../controllers/category.js';
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
  isMotorsport?: boolean;
  singularLabel?: string;
  pluralLabel?: string;
  setCreateKind: React.Dispatch<React.SetStateAction<EntrantType>>;
  teamEntrants: EventCatalogEntrant[];
  teamsEnabled: boolean;
}

type EntrantListSortOrder = 'grade' | 'plateNumber' | 'surname';

const entrantListSortOptions: Array<{ label: string; value: EntrantListSortOrder }> = [
  { label: 'Surname', value: 'surname' },
  { label: 'Plate number', value: 'plateNumber' },
  { label: 'Grade', value: 'grade' },
];

const getCategoryName = (catalog: EventCatalogState, categoryId?: CategoryId): string => {
  if (!categoryId) {
    return 'No category';
  }

  return catalog.categories.find((category) => category.id === categoryId)?.name || categoryId;
};

const compareEntrantSortText = (firstValue: string, secondValue: string): number => (
  firstValue.localeCompare(secondValue, undefined, { numeric: true, sensitivity: 'base' })
);

const getEntrantSurnameSortText = (entrant: EventCatalogEntrant): string => {
  if (entrant.lastName?.trim()) {
    return entrant.lastName.trim();
  }

  const nameParts = entrant.name.trim().split(/\s+/);
  return nameParts[nameParts.length - 1] || entrant.name;
};

const getEntrantCategoryId = (entrant: EventCatalogEntrant): CategoryId | undefined => (
  entrant.categoryId || entrant.categoryIds[0]
);

const createParticipantFromEntrantIdentifiers = (entrant: EventCatalogEntrant): EventParticipant | undefined => {
  if (entrant.entrantType !== 'rider' || !entrant.identifiers || entrant.identifiers.length === 0) {
    return undefined;
  }

  return {
    categoryId: entrant.categoryId || entrant.categoryIds[0] || '',
    currentResult: undefined,
    entrantId: entrant.id,
    firstname: entrant.firstName || entrant.name,
    id: entrant.memberParticipantIds[0] || entrant.id,
    identifiers: [...entrant.identifiers],
    lastRecordTime: null,
    resultDuration: null,
    surname: entrant.lastName || '',
  };
};

const getEntrantParticipant = (
  entrant: EventCatalogEntrant,
  participants: EventParticipant[],
  teamEntrants: EventCatalogEntrant[]
): EventParticipant | undefined => getParticipantsForEntrant(entrant, participants, teamEntrants)[0] ||
  createParticipantFromEntrantIdentifiers(entrant);

const getEntryParticipant = (
  entry: EventCatalogEntry,
  participants: EventParticipant[],
): EventParticipant | undefined => participants.find((participant) => (
  entry.participantIds.includes(participant.id)
));

const formatDriverName = (firstName: string | undefined, lastName: string | undefined, fallbackName: string): string => {
  const formattedName = `${firstName || ''} ${(lastName || '').toUpperCase()}`.trim();
  if (formattedName) {
    return formattedName;
  }

  const nameParts = fallbackName.trim().split(/\s+/);
  const surname = nameParts.pop();
  return [...nameParts, surname?.toUpperCase()].filter(Boolean).join(' ') || 'Unknown driver';
};

const getEntryDriverName = (
  entry: EventCatalogEntry,
  participants: EventParticipant[],
  riderEntrants: EventCatalogEntrant[],
): string => {
  const participant = getEntryParticipant(entry, participants);
  if (participant) {
    return formatDriverName(participant.firstname, participant.surname, entry.name || '');
  }

  const riderEntrant = riderEntrants.find((entrant) => entry.participantIds.some((participantId) => (
    entrant.memberParticipantIds.includes(participantId)
  )));
  return formatDriverName(riderEntrant?.firstName, riderEntrant?.lastName, riderEntrant?.name || entry.name || '');
};

const getEntrySummary = (
  entry: EventCatalogEntry,
  participants: EventParticipant[],
  riderEntrants: EventCatalogEntrant[],
): string => {
  const participant = getEntryParticipant(entry, participants);
  const raceNumber = entry.raceNumber || (participant ? getParticipantNumber(participant) : undefined);
  const entryTransponders = entry.identifiers.flatMap((identifier) => (
    'txNo' in identifier && identifier.txNo !== undefined ? [identifier.txNo] : []
  ));
  const transponders = entryTransponders.length > 0
    ? entryTransponders
    : participant
      ? getParticipantTransponders(participant)
      : [];
  const raceNumberText = raceNumber === undefined || raceNumber === '' ? '' : `#${raceNumber} `;
  const normalizedTransponders = transponders.flatMap((transponder): string[] => {
    if (transponder === null || transponder === undefined || transponder === '') {
      return [];
    }
    const value = transponder.toString();
    return [value.toLowerCase().startsWith('tx') ? value : `Tx${value}`];
  });
  const transponderText = normalizedTransponders.length > 0
    ? ` (${normalizedTransponders.join(', ')})`
    : '';

  return `${raceNumberText}${getEntryDriverName(entry, participants, riderEntrants)}${transponderText}`;
};

const sortEntrants = (
  entrants: EventCatalogEntrant[],
  sortOrder: EntrantListSortOrder,
  catalog: EventCatalogState,
  participants: EventParticipant[],
  teamEntrants: EventCatalogEntrant[]
): EventCatalogEntrant[] => (
  [...entrants].sort((firstEntrant, secondEntrant) => {
    if (sortOrder === 'plateNumber') {
      const firstParticipant = getEntrantParticipant(firstEntrant, participants, teamEntrants);
      const secondParticipant = getEntrantParticipant(secondEntrant, participants, teamEntrants);
      const firstPlateNumber = firstParticipant ? String(getParticipantNumber(firstParticipant) ?? '') : '';
      const secondPlateNumber = secondParticipant ? String(getParticipantNumber(secondParticipant) ?? '') : '';
      const plateComparison = compareEntrantSortText(firstPlateNumber, secondPlateNumber);

      if (plateComparison !== 0) {
        return plateComparison;
      }
    }

    if (sortOrder === 'grade') {
      const firstCategoryName = getCategoryName(catalog, getEntrantCategoryId(firstEntrant));
      const secondCategoryName = getCategoryName(catalog, getEntrantCategoryId(secondEntrant));
      const gradeComparison = compareEntrantSortText(firstCategoryName, secondCategoryName);

      if (gradeComparison !== 0) {
        return gradeComparison;
      }
    }

    const surnameComparison = compareEntrantSortText(
      getEntrantSurnameSortText(firstEntrant),
      getEntrantSurnameSortText(secondEntrant)
    );

    if (surnameComparison !== 0) {
      return surnameComparison;
    }

    return compareEntrantSortText(firstEntrant.name, secondEntrant.name);
  })
);

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

export const EntrantListPanel = (props: EntrantListPanelProps): React.ReactElement => {
  const [sortOrder, setSortOrder] = React.useState<EntrantListSortOrder>('surname');
  const singularLabel = props.singularLabel || 'Driver';
  const pluralLabel = props.pluralLabel || 'Drivers';
  const groupLabel = props.isMotorsport ? 'Entrants' : 'Teams';
  const relationshipLabel = props.isMotorsport ? 'Entrant' : 'Team';
  const eventEntries = getEntriesForEvent(props.catalog, props.selectedEventId);
  const sortedRiderEntrants = React.useMemo(() => sortEntrants(
    props.riderEntrants,
    sortOrder,
    props.catalog,
    props.raceStateParticipants,
    props.teamEntrants
  ), [props.catalog, props.raceStateParticipants, props.riderEntrants, props.teamEntrants, sortOrder]);
  const sortedTeamEntrants = React.useMemo(() => sortEntrants(
    props.filteredTeamEntrants,
    sortOrder,
    props.catalog,
    props.raceStateParticipants,
    props.teamEntrants
  ), [props.catalog, props.filteredTeamEntrants, props.raceStateParticipants, props.teamEntrants, sortOrder]);
  const motorsportEntrants = sortedTeamEntrants.filter((entrant) => entrant.isEntryOwner === true);
  const entriesByEntrantId = new Map(motorsportEntrants.map((entrant) => [
    entrant.id,
    eventEntries.filter((entry) => entry.entrantId === entrant.id),
  ]));
  const ownedEntryIds = new Set(Array.from(entriesByEntrantId.values()).flat().map((entry) => entry.id));
  const ownedParticipantIds = new Set(
    Array.from(entriesByEntrantId.values()).flatMap((entries) => (
      entries.flatMap((entry) => entry.participantIds)
    )),
  );
  const unownedRiderEntrants = sortedRiderEntrants.filter((entrant) => (
    !ownedEntryIds.has(entrant.id) &&
    !entrant.memberParticipantIds.some((participantId) => ownedParticipantIds.has(participantId))
  ));
  const displayedRiderEntrants = props.isMotorsport ? unownedRiderEntrants : sortedRiderEntrants;
  const displayedTeamEntrants = props.isMotorsport ? motorsportEntrants : sortedTeamEntrants;

  return (
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
              <option value="rider">Create {singularLabel.toLowerCase()}</option>
              <option value="team">Create {groupLabel.toLowerCase().slice(0, -1)}</option>
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
          {props.teamsEnabled && props.createKind === 'team' ? `Create ${groupLabel.slice(0, -1)}` : `Create ${singularLabel}`}
        </button>
        <label className="compact-action-label">
          Sort
          <select
            aria-label="Sort Entrants"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value as EntrantListSortOrder)}
          >
            {entrantListSortOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="events-list" role="listbox" aria-label="Entrants for selected event">
        {displayedRiderEntrants.length > 0 ? (
          <>
            {props.teamsEnabled ? <h3 className="events-list-subheading">Individual {pluralLabel}</h3> : null}
            {displayedRiderEntrants.map((entrant) => {
              const participant = getEntrantParticipant(entrant, props.raceStateParticipants, props.teamEntrants);
              const teamName = entrant.teamEntrantId
                ? props.teamEntrants.find((team) => team.id === entrant.teamEntrantId)?.name
                : undefined;
              const categoryId = getEntrantCategoryId(entrant);

              return (
                <EntrantListCard
                  key={entrant.id}
                  entrant={entrant}
                  entrantLabel={singularLabel}
                  categoryName={getCategoryName(props.catalog, categoryId)}
                  isSelected={entrant.id === props.selectedEntrant?.id}
                  raceNumber={participant ? getParticipantNumber(participant) : undefined}
                  onSelect={() => props.requestFormExit(() => props.onSelectEntrant(entrant.id))}
                  timingDevices={participant ? getParticipantTransponders(participant) : undefined}
                  teamName={teamName}
                  relationshipLabel={relationshipLabel}
                  showCategory={!props.isMotorsport}
                />
              );
            })}
          </>
        ) : null}
        {(props.isMotorsport || props.teamsEnabled) && displayedTeamEntrants.length > 0 ? (
          <>
            <h3 className="events-list-subheading">{groupLabel}</h3>
            {displayedTeamEntrants.map((entrant) => {
              const participant = getEntrantParticipant(entrant, props.raceStateParticipants, props.teamEntrants);

              return (
                <EntrantListCard
                  key={entrant.id}
                  entrant={entrant}
                  entrantLabel={singularLabel}
                  entrySummaries={props.isMotorsport
                    ? (entriesByEntrantId.get(entrant.id) || []).map((entry) => getEntrySummary(
                      entry,
                      props.raceStateParticipants,
                      props.riderEntrants,
                    ))
                    : undefined}
                  categoryName={getCategoryName(props.catalog, getEntrantCategoryId(entrant))}
                  isSelected={entrant.id === props.selectedEntrant?.id}
                  onSelect={() => props.requestFormExit(() => props.onSelectEntrant(entrant.id))}
                  raceNumber={!props.isMotorsport && participant ? getParticipantNumber(participant) : undefined}
                  timingDevices={!props.isMotorsport && participant ? getParticipantTransponders(participant) : undefined}
                  showCategory={props.isMotorsport}
                />
              );
            })}
          </>
        ) : null}
      </div>
    </section>
  );
};
