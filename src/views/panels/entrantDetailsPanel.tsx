import { Button, CircularProgress, TextField } from '@mui/material';
import React from 'react';
import { type EventCatalogEntrant } from '../../catalog/eventCatalog.js';
import { SelectTextField } from '../../controls/selectTextField.js';
import { type CategoryId } from '../../processing/category.js';
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
  startOrder: string;
  teamEntrantId: EventEntrantId;
  vehicle: string;
}

interface EntrantDetailsPanelProps {
  entrantAssignmentIsDerived?: boolean;
  entrantLabel?: string;
  entrantDraft: EntrantDraft;
  deleteError?: string;
  deleteStatus?: 'idle' | 'pending' | 'succeeded' | 'failed';
  eventCategories: EventCategory[];
  onDeleteEntrant: () => void | Promise<void>;
  onSaveEntrant: () => void | Promise<void>;
  onSetEntrantDraft: React.Dispatch<React.SetStateAction<EntrantDraft>>;
  selectedEntrant?: EventCatalogEntrant;
  selectedTeamName?: string;
  isMotorsport?: boolean;
  showVehicle?: boolean;
  showTeamMembers?: boolean;
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
  const parentLabel = props.isMotorsport ? 'Entrant' : 'Team';
  const isDriver = props.selectedEntrant?.entrantType === 'rider';

  return (
    <section className="events-panel">
      <h2>{isDriver ? `${entrantLabel} Details` : `${parentLabel} Details`}</h2>
      {props.selectedEntrant ? (
        <>
          {!props.isMotorsport || !isDriver ? <TextField
            label={isDriver ? `${entrantLabel} Name` : `${parentLabel} Name`}
            slotProps={{ htmlInput: { 'aria-label': 'Entrant Name' } }}
            value={props.entrantDraft.name}
            onChange={(event) => props.onSetEntrantDraft((current) => ({ ...current, name: event.target.value }))}
          /> : null}
          {isDriver ? (
            <>
              <TextField
                label="First Name"
                slotProps={{ htmlInput: { 'aria-label': 'Entrant First Name' } }}
                value={props.entrantDraft.firstName}
                onChange={(event) => props.onSetEntrantDraft((current) => ({ ...current, firstName: event.target.value }))}
              />
              <TextField
                label="Surname"
                slotProps={{ htmlInput: { 'aria-label': 'Entrant Surname' } }}
                value={props.entrantDraft.lastName}
                onChange={(event) => props.onSetEntrantDraft((current) => ({ ...current, lastName: event.target.value }))}
              />
              <SelectTextField
                label="Gender"
                slotProps={{ select: { 'aria-label': 'Entrant Gender', native: true } }}
                value={props.entrantDraft.gender}
                onChange={(event) => props.onSetEntrantDraft((current) => ({ ...current, gender: event.target.value }))}
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value={UNSPECIFIED_GENDER}>Unspecified</option>
              </SelectTextField>
              <TextField
                label="Date of Birth"
                slotProps={{ htmlInput: { 'aria-label': 'Entrant Date Of Birth' }, inputLabel: { shrink: true } }}
                type="date"
                value={props.entrantDraft.dateOfBirth}
                onChange={(event) => props.onSetEntrantDraft((current) => ({ ...current, dateOfBirth: event.target.value }))}
              />
              {!props.isMotorsport ? <TextField
                label="Start Order"
                slotProps={{ htmlInput: { 'aria-label': 'Entrant Start Order', min: 1 } }}
                type="number"
                value={props.entrantDraft.startOrder}
                onChange={(event) => props.onSetEntrantDraft((current) => ({ ...current, startOrder: event.target.value }))}
              /> : null}
              <SelectTextField
                disabled={props.entrantAssignmentIsDerived}
                label={parentLabel}
                slotProps={{ select: { 'aria-label': 'Driver Entrant', native: true } }}
                value={props.entrantDraft.teamEntrantId}
                onChange={(event) => props.onSetEntrantDraft((current) => ({ ...current, teamEntrantId: event.target.value }))}
              >
                <option value="">{props.isMotorsport ? 'No entrant' : 'Individual entry'}</option>
                {props.teamEntrants.map((team) => (
                  <option key={team.id} value={team.id}>{`${team.name} (${team.id.toString().slice(0, 6)})`}</option>
                ))}
              </SelectTextField>
            </>
          ) : props.showTeamMembers !== false ? (
            <>
              <h3>{props.isMotorsport ? 'Drivers' : 'Team Members'}</h3>
              <ReadOnlyList
                emptyText={`No ${teamMemberLabel.toLowerCase()} are assigned to this ${parentLabel.toLowerCase()}.`}
                items={props.teamMembers}
              />
            </>
          ) : null}
          {!props.isMotorsport || !isDriver ? <SelectTextField
            label="Category"
            slotProps={{ select: { 'aria-label': 'Entrant Category', native: true } }}
            value={props.entrantDraft.categoryId}
            onChange={(event) => props.onSetEntrantDraft((current) => ({ ...current, categoryId: event.target.value }))}
          >
            <option value="">No category</option>
            {props.eventCategories.filter(isActiveCategory).map((category) => (
              <option key={category.id.toString()} value={category.id.toString()}>{category.name}</option>
            ))}
          </SelectTextField> : null}
          {isDriver && props.selectedTeamName ? (
            <p className="readonly-summary">{parentLabel}: {props.selectedTeamName}</p>
          ) : null}
          {props.showVehicle && !isDriver ? (
            <TextField
              label="Vehicle"
              slotProps={{ htmlInput: { 'aria-label': 'Entrant Vehicle' } }}
              value={props.entrantDraft.vehicle}
              onChange={(event) => props.onSetEntrantDraft((current) => ({ ...current, vehicle: event.target.value }))}
            />
          ) : null}
          {props.isMotorsport && !isDriver ? (
            <TextField
              label="Start Order"
              slotProps={{ htmlInput: { 'aria-label': 'Entrant Start Order', min: 1 } }}
              type="number"
              value={props.entrantDraft.startOrder}
              onChange={(event) => props.onSetEntrantDraft((current) => ({ ...current, startOrder: event.target.value }))}
            />
          ) : null}
          <TextField
            label="Notes"
            multiline
            slotProps={{ htmlInput: { 'aria-label': 'Entrant Notes' } }}
            value={props.entrantDraft.notes}
            onChange={(event) => props.onSetEntrantDraft((current) => ({ ...current, notes: event.target.value }))}
          />
          <div className="events-actions">
            <Button
              type="button"
              onClick={() => {
                void props.onSaveEntrant();
              }}
            >
              Save Entrant
            </Button>
            <div className="entrant-delete-status">
              <Button
                color="error"
                disabled={props.deleteStatus === 'pending'}
                endIcon={props.deleteStatus === 'pending' ? <CircularProgress aria-label="Deleting entrant" size={16} /> : props.deleteStatus === 'succeeded' ? <span aria-label="Entrant deleted" role="img">✓</span> : props.deleteStatus === 'failed' ? <span aria-label="Entrant deletion failed" role="img">!</span> : undefined}
                onClick={props.onDeleteEntrant}
                type="button"
                variant="outlined"
              >
                Delete Entrant
              </Button>
              {props.deleteError ? <span className="error entrant-delete-error" role="alert">{props.deleteError}</span> : null}
            </div>
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
