import React from 'react';
import { type EventCatalogEntrant } from '../../catalog/eventCatalog.js';
import { type CategoryId } from '../../controllers/category.js';
import { type EventEntrantId } from '../../model/entrant.js';
import { type EventCategory } from '../../model/eventcategory.js';

export interface EntrantDraft {
  categoryId: CategoryId;
  dateOfBirth: string;
  firstName: string;
  gender: string;
  lastName: string;
  name: string;
  notes: string;
  teamEntrantId: EventEntrantId;
}

interface EntrantDetailsPanelProps {
  entrantLabel?: string;
  entrantDraft: EntrantDraft;
  eventCategories: EventCategory[];
  onDeleteEntrant: () => void;
  onSaveEntrant: () => void | Promise<void>;
  onSetEntrantDraft: React.Dispatch<React.SetStateAction<EntrantDraft>>;
  selectedEntrant?: EventCatalogEntrant;
  selectedTeamName?: string;
  teamMemberLabel?: string;
  teamEntrants: EventCatalogEntrant[];
  teamMembers: string[];
  warningModal?: React.ReactNode;
}

const UNSPECIFIED_GENDER = 'unspecified';
const isActiveCategory = (category: EventCategory): boolean => category.deleted !== true;

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

export const EntrantDetailsPanel = (props: EntrantDetailsPanelProps): React.ReactElement => {
  const entrantLabel = props.entrantLabel || 'Driver';
  const teamMemberLabel = props.teamMemberLabel || 'Drivers';

  return (
    <section className="events-panel">
      <h2>{props.selectedEntrant?.entrantType === 'team' ? 'Team Details' : `${entrantLabel} Details`}</h2>
      {props.selectedEntrant ? (
        <>
          <label>
            {props.selectedEntrant.entrantType === 'team' ? 'Team Name' : `${entrantLabel} Name`}
            <input
              aria-label="Entrant Name"
              type="text"
              value={props.entrantDraft.name}
              onChange={(event) => props.onSetEntrantDraft((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          {props.selectedEntrant.entrantType === 'rider' ? (
            <>
              <label>
                First Name
                <input
                  aria-label="Entrant First Name"
                  type="text"
                  value={props.entrantDraft.firstName}
                  onChange={(event) => props.onSetEntrantDraft((current) => ({ ...current, firstName: event.target.value }))}
                />
              </label>
              <label>
                Surname
                <input
                  aria-label="Entrant Surname"
                  type="text"
                  value={props.entrantDraft.lastName}
                  onChange={(event) => props.onSetEntrantDraft((current) => ({ ...current, lastName: event.target.value }))}
                />
              </label>
              <label>
                Gender
                <select
                  aria-label="Entrant Gender"
                  value={props.entrantDraft.gender}
                  onChange={(event) => props.onSetEntrantDraft((current) => ({ ...current, gender: event.target.value }))}
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
                  value={props.entrantDraft.dateOfBirth}
                  onChange={(event) => props.onSetEntrantDraft((current) => ({ ...current, dateOfBirth: event.target.value }))}
                />
              </label>
              <label>
                Team
                <select
                  aria-label="Entrant Team"
                  value={props.entrantDraft.teamEntrantId}
                  onChange={(event) => props.onSetEntrantDraft((current) => ({ ...current, teamEntrantId: event.target.value }))}
                >
                  <option value="">Individual entry</option>
                  {props.teamEntrants.map((team) => (
                    <option key={team.id} value={team.id}>{team.name}</option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <>
              <h3>Team Members</h3>
              <ReadOnlyList
                emptyText={`No ${teamMemberLabel.toLowerCase()} are assigned to this team.`}
                items={props.teamMembers}
              />
            </>
          )}
          <label>
            Category
            <select
              aria-label="Entrant Category"
              value={props.entrantDraft.categoryId}
              onChange={(event) => props.onSetEntrantDraft((current) => ({ ...current, categoryId: event.target.value }))}
            >
              <option value="">No category</option>
              {props.eventCategories.filter(isActiveCategory).map((category) => (
                <option key={category.id.toString()} value={category.id.toString()}>{category.name}</option>
              ))}
            </select>
          </label>
          {props.selectedEntrant.entrantType === 'rider' && props.selectedTeamName ? (
            <p className="readonly-summary">Team: {props.selectedTeamName}</p>
          ) : null}
          <label>
            Notes
            <textarea
              aria-label="Entrant Notes"
              value={props.entrantDraft.notes}
              onChange={(event) => props.onSetEntrantDraft((current) => ({ ...current, notes: event.target.value }))}
            />
          </label>
          <div className="events-actions">
            <button
              type="button"
              onClick={() => {
                void props.onSaveEntrant();
              }}
            >
              Save Entrant
            </button>
            <button type="button" onClick={props.onDeleteEntrant}>
              Delete Entrant
            </button>
          </div>
          <div className="entrant-id">Id: {props.selectedEntrant.id}</div>
          {props.warningModal}
        </>
      ) : (
        <p>No entrants are defined for this event.</p>
      )}
    </section>
  );
};
