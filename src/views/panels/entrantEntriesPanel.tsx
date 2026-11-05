import { Button, TextField, Typography } from '@mui/material';
import React from 'react';

import type { EventCatalogCategory, EventCatalogEntrant, EventCatalogEntry } from '../../catalog/eventCatalog.js';
import { SelectTextField } from '../../controls/selectTextField.js';
import type { EventEntrantId } from '../../model/entrant.js';
import type { EventEntryId } from '../../model/entry.js';
import type { EventParticipant } from '../../model/eventparticipant.js';

type EntryChanges = Partial<Pick<EventCatalogEntry, 'categoryId' | 'identifiers' | 'name' | 'raceNumber' | 'startOrder' | 'vehicle'>>;
interface EntrantEntriesPanelProps {
  categories: EventCatalogCategory[];
  entries: EventCatalogEntry[];
  onOpenIndividuals?: (entrantId: EventEntrantId) => void;
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
      <TextField
        label="Entry Name"
        slotProps={{ htmlInput: { 'aria-label': `Entry Name ${props.entry.id}` } }}
        value={draft.name}
        onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
      />
      <SelectTextField
        label="Category"
        slotProps={{ select: { 'aria-label': `Entry Category ${props.entry.id}`, native: true } }}
        value={draft.categoryId}
        onChange={(event) => setDraft((current) => ({ ...current, categoryId: event.target.value }))}
      >
        <option value="">No category</option>
        {props.categories.filter((category) => category.deleted !== true).map((category) => (
          <option key={category.id} value={category.id}>{category.name}</option>
        ))}
      </SelectTextField>
      <TextField
        label="Race Number"
        slotProps={{ htmlInput: { 'aria-label': `Entry Race Number ${props.entry.id}` } }}
        value={draft.raceNumber}
        onChange={(event) => setDraft((current) => ({ ...current, raceNumber: event.target.value }))}
      />
      <TextField
        label="Transmitter"
        slotProps={{ htmlInput: { 'aria-label': `Entry Transmitter ${props.entry.id}` } }}
        value={draft.transmitter}
        onChange={(event) => setDraft((current) => ({ ...current, transmitter: event.target.value }))}
      />
      <TextField
        label="Vehicle"
        slotProps={{ htmlInput: { 'aria-label': `Entry Vehicle ${props.entry.id}` } }}
        value={draft.vehicle}
        onChange={(event) => setDraft((current) => ({ ...current, vehicle: event.target.value }))}
      />
      <TextField
        label="Start Order"
        slotProps={{ htmlInput: { 'aria-label': `Entry Start Order ${props.entry.id}`, min: 1 } }}
        type="number"
        value={draft.startOrder}
        onChange={(event) => setDraft((current) => ({ ...current, startOrder: event.target.value }))}
      />
      <Button type="button" onClick={saveEntry}>Save Entry</Button>
      <div className="entry-driver-list">
        {drivers.map((driver) => (
          <React.Fragment key={driver.id}>
            <Typography variant="body2">Driver: {driver.name}</Typography>
            {props.onOpenIndividuals && <Button onClick={(): void => props.onOpenIndividuals?.(driver.id)}>
              Open {driver.name} in Individuals
            </Button>}
          </React.Fragment>
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
