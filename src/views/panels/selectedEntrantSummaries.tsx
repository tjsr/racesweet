import React from 'react';
import { type EventCatalogEntrant, type EventCatalogSession } from '../../catalog/eventCatalog.js';
import { getParticipantNumber, getParticipantTransponders } from '../../processing/participant.js';
import { type EventParticipant } from '../../model/eventparticipant.js';
import { getParticipantsForEntrant } from './entrantList.js';

interface SelectedEntrantIdentificationPanelProps {
  entrants: EventCatalogEntrant[];
  eventEntrants: EventCatalogEntrant[];
  participants: EventParticipant[];
}

interface SelectedEntrantSessionsPanelProps {
  entrants: EventCatalogEntrant[];
  sessionsByEntrantId: Map<string, EventCatalogSession[]>;
}

export const SelectedEntrantSessionsPanel = (props: SelectedEntrantSessionsPanelProps): React.ReactElement => {
  const groups = new Map<string, { entrants: EventCatalogEntrant[]; sessionNames: string[] }>();
  props.entrants.forEach((entrant) => {
    const sessions = props.sessionsByEntrantId.get(entrant.id.toString()) || [];
    const sessionNames = sessions.map((session) => session.name);
    const key = sessions.map((session) => session.id.toString()).sort().join('|');
    const existing = groups.get(key);
    if (existing) {
      existing.entrants.push(entrant);
    } else {
      groups.set(key, { entrants: [entrant], sessionNames });
    }
  });

  return <section className="events-panel"><h2>Sessions for Entrants</h2>{Array.from(groups.values()).map((group) => <div key={group.sessionNames.join('|') || 'none'}><h3>{group.sessionNames.join(', ') || 'No sessions assigned'}</h3><ul className="readonly-summary-list">{group.entrants.map((entrant) => <li key={entrant.id}>{entrant.name}</li>)}</ul></div>)}</section>;
};

export const SelectedEntrantIdentificationPanel = (props: SelectedEntrantIdentificationPanelProps): React.ReactElement => {
  const participants = props.entrants.flatMap((entrant) => getParticipantsForEntrant(entrant, props.participants, props.eventEntrants));
  const plateNumbers = Array.from(new Set(participants.flatMap((participant) => {
    const number = getParticipantNumber(participant);
    return number === undefined || number === '' ? [] : [String(number)];
  })));
  const timingDevices = Array.from(new Set(participants.flatMap((participant) => getParticipantTransponders(participant).map(String))));

  return <section className="events-panel"><h2>Identification</h2><h3>Plate Numbers</h3>{plateNumbers.length > 0 ? <ul className="readonly-summary-list">{plateNumbers.map((plateNumber) => <li key={plateNumber}>{plateNumber}</li>)}</ul> : <p className="readonly-summary">No plate numbers are assigned.</p>}<h3>Timing devices</h3>{timingDevices.length > 0 ? <ul className="readonly-summary-list">{timingDevices.map((timingDevice) => <li key={timingDevice}>{timingDevice}</li>)}</ul> : <p className="readonly-summary">No timing devices are assigned.</p>}</section>;
};
