import React from 'react';

import type { EventCatalogCategory, EventCatalogEntrant, EventCatalogEntry } from '../../catalog/eventCatalog.js';
import type { EventEntrantId } from '../../model/entrant.js';
import type { EventEntryId } from '../../model/entry.js';
import type { EventParticipant } from '../../model/eventparticipant.js';

type EntryChanges = Partial<Pick<EventCatalogEntry, 'categoryId' | 'identifiers' | 'name' | 'raceNumber' | 'startOrder' | 'vehicle'>>;
type DriverChanges = Partial<Pick<EventCatalogEntrant, 'firstName' | 'lastName' | 'name'>>;

interface EntrantEntriesPanelProps {
  categories: EventCatalogCategory[];
  entries: EventCatalogEntry[];
  onUpdateDriver: (entrantId: EventEntrantId, changes: DriverChanges) => void | Promise<void>;
  onUpdateEntry: (entryId: EventEntryId, changes: EntryChanges) => void | Promise<void>;
  participants: EventParticipant[];
  riderEntrants: EventCatalogEntrant[];
}

interface EntryDraft {
  categoryId: string;
  name: string;
  raceNumber: string;
  startOrder: string;
  transmitter: string;
  vehicle: string;
}

const getEntryTransmitter = (entry: EventCatalogEntry): string => {
  const identifier = entry.identifiers.find((candidate) => 'txNo' in candidate) as unknown as { txNo?: string | number } | undefined;
  return identifier?.txNo?.toString() || '';
};

const getEntryDraft = (entry: EventCatalogEntry): EntryDraft => ({
  categoryId: entry.categoryId?.toString() || '',
  name: entry.name || '',
  raceNumber: entry.raceNumber || '',
  startOrder: entry.startOrder?.toString() || '',
  transmitter: getEntryTransmitter(entry),
  vehicle: entry.vehicle || '',
});

const DriverEditor = (props: {
  driver: EventCatalogEntrant;
  onUpdateDriver: EntrantEntriesPanelProps['onUpdateDriver'];
}): React.ReactElement => {
  const [firstName, setFirstName] = React.useState(props.driver.firstName || '');
  const [lastName, setLastName] = React.useState(props.driver.lastName || '');

  React.useEffect(() => {
    setFirstName(props.driver.firstName || '');
    setLastName(props.driver.lastName || '');
  }, [props.driver]);

  return (
    <fieldset className="entry-driver-form">
      <legend>Driver</legend>
      <label>
        First Name
        <input
          aria-label={`Entry Driver First Name ${props.driver.id}`}
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
        />
      </label>
      <label>
        Surname
        <input
          aria-label={`Entry Driver Surname ${props.driver.id}`}
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
        />
      </label>
      <button
        type="button"
        onClick={() => void props.onUpdateDriver(props.driver.id, {
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          name: `${firstName} ${lastName}`.trim() || props.driver.name,
        })}
      >
        Save Driver
      </button>
    </fieldset>
  );
};

const EntryEditor = (props: EntrantEntriesPanelProps & { entry: EventCatalogEntry }): React.ReactElement => {
  const [draft, setDraft] = React.useState<EntryDraft>(() => getEntryDraft(props.entry));

  React.useEffect(() => {
    setDraft(getEntryDraft(props.entry));
  }, [props.entry]);

  const participantIds = new Set(props.entry.participantIds.map((participantId) => participantId.toString()));
  const drivers = props.riderEntrants.filter((entrant) => entrant.memberParticipantIds.some((participantId) => (
    participantIds.has(participantId.toString())
  )));
  const participantNames = props.participants
    .filter((participant) => participantIds.has(participant.id.toString()))
    .map((participant) => `${participant.firstname} ${participant.surname}`.trim());

  const saveEntry = (): void => {
    const identifiers = props.entry.identifiers.filter((identifier) => !('txNo' in identifier));
    if (draft.transmitter.trim()) {
      identifiers.push({
        fromTime: undefined,
        toTime: undefined,
        txNo: draft.transmitter.trim(),
      } as unknown as EventCatalogEntry['identifiers'][number]);
    }
    void props.onUpdateEntry(props.entry.id, {
      categoryId: draft.categoryId || undefined,
      identifiers,
      name: draft.name || undefined,
      raceNumber: draft.raceNumber || undefined,
      startOrder: draft.startOrder ? Number(draft.startOrder) : undefined,
      vehicle: draft.vehicle || undefined,
    });
  };

  return (
    <fieldset className="entrant-entry-form">
      <legend>{draft.raceNumber ? `Entry #${draft.raceNumber}` : `Entry ${props.entry.id.toString().slice(0, 6)}`}</legend>
      <label>
        Entry Name
        <input
          aria-label={`Entry Name ${props.entry.id}`}
          value={draft.name}
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
        />
      </label>
      <label>
        Category
        <select
          aria-label={`Entry Category ${props.entry.id}`}
          value={draft.categoryId}
          onChange={(event) => setDraft((current) => ({ ...current, categoryId: event.target.value }))}
        >
          <option value="">No category</option>
          {props.categories.filter((category) => category.deleted !== true).map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
      </label>
      <label>
        Race Number
        <input
          aria-label={`Entry Race Number ${props.entry.id}`}
          value={draft.raceNumber}
          onChange={(event) => setDraft((current) => ({ ...current, raceNumber: event.target.value }))}
        />
      </label>
      <label>
        Transmitter
        <input
          aria-label={`Entry Transmitter ${props.entry.id}`}
          value={draft.transmitter}
          onChange={(event) => setDraft((current) => ({ ...current, transmitter: event.target.value }))}
        />
      </label>
      <label>
        Vehicle
        <input
          aria-label={`Entry Vehicle ${props.entry.id}`}
          value={draft.vehicle}
          onChange={(event) => setDraft((current) => ({ ...current, vehicle: event.target.value }))}
        />
      </label>
      <label>
        Start Order
        <input
          aria-label={`Entry Start Order ${props.entry.id}`}
          min="1"
          type="number"
          value={draft.startOrder}
          onChange={(event) => setDraft((current) => ({ ...current, startOrder: event.target.value }))}
        />
      </label>
      <button type="button" onClick={saveEntry}>Save Entry</button>
      <div className="entry-driver-list">
        {drivers.map((driver) => (
          <DriverEditor driver={driver} key={driver.id} onUpdateDriver={props.onUpdateDriver} />
        ))}
        {drivers.length === 0 && participantNames.map((name) => (
          <p className="readonly-summary" key={name}>Driver: {name}</p>
        ))}
      </div>
    </fieldset>
  );
};

export const EntrantEntriesPanel = (props: EntrantEntriesPanelProps): React.ReactElement => (
  <section className="events-panel entrant-entries-panel">
    <h2>Entries</h2>
    {props.entries.length > 0 ? props.entries.map((entry) => (
      <EntryEditor {...props} entry={entry} key={entry.id} />
    )) : <p>No Entries are assigned to this Entrant.</p>}
  </section>
);
