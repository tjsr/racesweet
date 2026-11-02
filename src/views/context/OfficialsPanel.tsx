import {
  Alert, Box, Button, Checkbox, FormControlLabel, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import React from 'react';
import type { EventCatalogState } from '../../catalog/eventCatalog.js';
import { createOfficialContactReport } from '../../export/officialContactReport.js';
import { createReportPdf, downloadReportBlob, printReport, toReportCsv } from '../../export/tabularReport.js';
import type { IndividualLinkInput } from '../../model/individualLink.js';
import type { OfficialAssignment, OfficialAssignmentInput, OfficialAvailabilitySlot, OfficialProfile, OfficialProfileInput } from '../../model/official.js';
import type { EventId, SessionId } from '../../model/raceevent.js';
import { type OfficialContactRow, getOfficialContactRows } from '../../processing/officialContacts.js';
import { IndividualLinksEditor } from './IndividualLinksEditor.js';

export interface OfficialsPanelProps {
  catalog: EventCatalogState;
  onArchiveProfile: (officialId: string, archived: boolean) => Promise<void>;
  onCreateAssignment: (input: OfficialAssignmentInput) => Promise<void>;
  onCreateProfile: (input: OfficialProfileInput) => Promise<void>;
  onLinkIndividual: (input: IndividualLinkInput) => Promise<void>;
  onRemoveAssignment: (assignmentId: string) => Promise<void>;
  onUnlinkIndividual: (linkId: string) => Promise<void>;
  onUpdateAssignment: (assignmentId: string, input: OfficialAssignmentInput) => Promise<void>;
  onUpdateProfile: (officialId: string, input: OfficialProfileInput) => Promise<void>;
  selectedEventId?: EventId;
}

const emptyProfile = (): OfficialProfileInput => ({
  availability: [], displayName: '', email: '', notes: '', phone: '', position: '', responsibilities: [],
});

const emptyAssignment = (eventId: EventId, officialId: string): OfficialAssignmentInput => ({
  eventId, notes: '', officialId, role: '',
});

const toLocalDateTime = (value: string | undefined): string => {
  if (!value) return '';
  const date: Date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString().slice(0, 16);
};

const fromLocalDateTime = (value: string): string | undefined => value ? new Date(value).toISOString() : undefined;

const AvailabilityEditor = ({ slots, onChange }: {
  onChange: (slots: OfficialAvailabilitySlot[]) => void;
  slots: OfficialAvailabilitySlot[];
}): React.ReactElement => {
  const update = (index: number, patch: Partial<OfficialAvailabilitySlot>): void =>
    onChange(slots.map((slot: OfficialAvailabilitySlot, slotIndex: number): OfficialAvailabilitySlot =>
      slotIndex === index ? { ...slot, ...patch } : slot));
  return <Stack spacing={1}>
    <Typography variant="subtitle2">Availability</Typography>
    {slots.map((slot: OfficialAvailabilitySlot, index: number): React.ReactElement =>
      <Box key={index} sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))' }}>
        <TextField select label="Status" value={slot.status} onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
          update(index, { status: event.target.value as OfficialAvailabilitySlot['status'] })}>
          <MenuItem value="available">Available</MenuItem><MenuItem value="unavailable">Unavailable</MenuItem>
        </TextField>
        <TextField label="From" type="datetime-local" value={toLocalDateTime(slot.startAt)}
          slotProps={{ inputLabel: { shrink: true } }} onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
            update(index, { startAt: fromLocalDateTime(event.target.value) })} />
        <TextField label="To" type="datetime-local" value={toLocalDateTime(slot.endAt)}
          slotProps={{ inputLabel: { shrink: true } }} onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
            update(index, { endAt: fromLocalDateTime(event.target.value) })} />
        <Button onClick={(): void => onChange(slots.filter((_item: OfficialAvailabilitySlot, slotIndex: number): boolean => slotIndex !== index))}>
          Remove slot
        </Button>
      </Box>)}
    <Button onClick={(): void => onChange([...slots, { status: 'available' }])}>Add availability slot</Button>
  </Stack>;
};

const ProfileEditor = ({ draft, onArchive, onChange, onSave, selected }: {
  draft: OfficialProfileInput;
  onArchive: () => void;
  onChange: (draft: OfficialProfileInput) => void;
  onSave: () => void;
  selected?: OfficialProfile;
}): React.ReactElement => {
  const change = (key: keyof OfficialProfileInput, value: string): void =>
    onChange({ ...draft, [key]: value });
  return <Stack spacing={1.5}>
    <Typography variant="h6">{selected ? 'Edit individual' : 'New individual'}</Typography>
    <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
      <TextField label="Name" required value={draft.displayName} onChange={(event: React.ChangeEvent<HTMLInputElement>): void => change('displayName', event.target.value)} />
      <TextField label="Position" value={draft.position} onChange={(event: React.ChangeEvent<HTMLInputElement>): void => change('position', event.target.value)} />
      <TextField label="Email" type="email" value={draft.email || ''} onChange={(event: React.ChangeEvent<HTMLInputElement>): void => change('email', event.target.value)} />
      <TextField label="Phone" type="tel" value={draft.phone || ''} onChange={(event: React.ChangeEvent<HTMLInputElement>): void => change('phone', event.target.value)} />
    </Box>
    <TextField label="Responsibilities (one per line)" multiline minRows={2} value={draft.responsibilities.join('\n')}
      onChange={(event: React.ChangeEvent<HTMLInputElement>): void => onChange({ ...draft, responsibilities: event.target.value.split('\n').filter(Boolean) })} />
    <TextField label="Private notes" multiline minRows={2} value={draft.notes}
      onChange={(event: React.ChangeEvent<HTMLInputElement>): void => change('notes', event.target.value)} />
    <AvailabilityEditor slots={draft.availability} onChange={(availability: OfficialAvailabilitySlot[]): void => onChange({ ...draft, availability })} />
    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
      <Button variant="contained" onClick={onSave}>{selected ? 'Save individual' : 'Create individual'}</Button>
      {selected && <Button color={selected.archived ? 'primary' : 'warning'} onClick={onArchive}>
        {selected.archived ? 'Restore individual' : 'Archive individual'}
      </Button>}
    </Stack>
  </Stack>;
};

const AssignmentEditor = ({ assignment, catalog, draft, onChange, onRemove, onSave, selected }: {
  assignment?: OfficialAssignment;
  catalog: EventCatalogState;
  draft: OfficialAssignmentInput;
  onChange: (draft: OfficialAssignmentInput) => void;
  onRemove: () => void;
  onSave: () => void;
  selected?: OfficialProfile;
}): React.ReactElement => {
  const sessions = catalog.sessions.filter((session): boolean => session.eventId === draft.eventId);
  return <Stack spacing={1}>
    <Typography variant="h6">{assignment ? 'Edit assignment' : 'Add assignment'}</Typography>
    <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))' }}>
      <TextField select label="Session" value={draft.sessionId || ''} onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
        onChange({ ...draft, sessionId: event.target.value as SessionId || undefined })}>
        <MenuItem value="">Event-wide</MenuItem>
        {sessions.map((session): React.ReactElement => <MenuItem key={session.id} value={session.id}>{session.name}</MenuItem>)}
      </TextField>
      <TextField label="Role" required value={draft.role} onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
        onChange({ ...draft, role: event.target.value })} />
      <TextField label="Responsibility override" value={draft.responsibilityOverride || ''}
        onChange={(event: React.ChangeEvent<HTMLInputElement>): void => onChange({ ...draft, responsibilityOverride: event.target.value })} />
    </Box>
    <TextField label="Assignment notes" multiline minRows={2} value={draft.notes}
      onChange={(event: React.ChangeEvent<HTMLInputElement>): void => onChange({ ...draft, notes: event.target.value })} />
    <Stack direction="row" spacing={1}>
      <Button variant="contained" disabled={!selected || selected.archived} onClick={onSave}>
        {assignment ? 'Save assignment' : 'Add assignment'}
      </Button>
      {assignment && <Button color="warning" onClick={onRemove}>Remove assignment</Button>}
    </Stack>
  </Stack>;
};

export const OfficialsPanel = (props: OfficialsPanelProps): React.ReactElement => {
  const [eventId, setEventId] = React.useState<EventId | undefined>(props.selectedEventId || props.catalog.events[0]?.id);
  const [sessionId, setSessionId] = React.useState<SessionId | undefined>(undefined);
  const [selectedId, setSelectedId] = React.useState<string | undefined>(undefined);
  const [assignmentId, setAssignmentId] = React.useState<string | undefined>(undefined);
  const [profileDraft, setProfileDraft] = React.useState<OfficialProfileInput>(emptyProfile);
  const [assignmentDraft, setAssignmentDraft] = React.useState<OfficialAssignmentInput | undefined>(undefined);
  const [query, setQuery] = React.useState<string>('');
  const [includeArchived, setIncludeArchived] = React.useState<boolean>(true);
  const [detailed, setDetailed] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string>('');
  const selected: OfficialProfile | undefined = props.catalog.officials?.find((official: OfficialProfile): boolean => official.id === selectedId);
  const assignments: OfficialAssignment[] = (props.catalog.officialAssignments || []).filter((assignment: OfficialAssignment): boolean =>
    !assignment.removed && assignment.eventId === eventId && assignment.officialId === selectedId);
  const selectedAssignment: OfficialAssignment | undefined = assignments.find((assignment: OfficialAssignment): boolean => assignment.id === assignmentId);
  const rows: OfficialContactRow[] = eventId ? getOfficialContactRows(props.catalog, { eventId, includeArchived, query, sessionId }) : [];
  const directory: OfficialProfile[] = (props.catalog.officials || []).filter((official: OfficialProfile): boolean =>
    (includeArchived || !official.archived) && [official.displayName, official.position, official.email, official.phone]
      .join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    .sort((first: OfficialProfile, second: OfficialProfile): number => first.displayName.localeCompare(second.displayName));

  const run = (operation: () => Promise<void>): void => {
    setError('');
    Promise.resolve().then(operation).catch((failure: Error): void => setError(failure.message));
  };
  const chooseProfile = (official: OfficialProfile | undefined): void => {
    setSelectedId(official?.id);
    setProfileDraft(official ? { availability: official.availability, displayName: official.displayName,
      email: official.email, notes: official.notes, phone: official.phone, position: official.position,
      responsibilities: official.responsibilities } : emptyProfile());
    setAssignmentId(undefined);
    setAssignmentDraft(eventId && official ? emptyAssignment(eventId, official.id) : undefined);
  };
  const chooseAssignment = (assignment: OfficialAssignment): void => {
    setAssignmentId(assignment.id);
    setAssignmentDraft({ eventId: assignment.eventId, notes: assignment.notes, officialId: assignment.officialId,
      responsibilityOverride: assignment.responsibilityOverride, role: assignment.role, sessionId: assignment.sessionId });
  };
  const saveProfile = (): void => run((): Promise<void> => selected
    ? props.onUpdateProfile(selected.id, profileDraft)
    : props.onCreateProfile(profileDraft));
  const saveAssignment = (): void => {
    if (!assignmentDraft) return;
    run((): Promise<void> => selectedAssignment
      ? props.onUpdateAssignment(selectedAssignment.id, assignmentDraft)
      : props.onCreateAssignment(assignmentDraft));
  };
  const report = createOfficialContactReport(rows, detailed,
    `Officials — ${props.catalog.events.find((event): boolean => event.id === eventId)?.name || 'Event'}`);
  const exportCsv = (): void => downloadReportBlob(
    new Blob([toReportCsv(report)], { type: 'text/csv;charset=utf-8' }), 'official-contacts.csv');
  const exportPdf = (): void => run((): Promise<void> => createReportPdf(report)
    .then((blob: Blob): void => downloadReportBlob(blob, 'official-contacts.pdf')));
  return <Stack spacing={2} sx={{ minWidth: 0, p: 2 }}>
    <Typography variant="h5">Individuals</Typography>
    {error && <Alert severity="error">{error}</Alert>}
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))' }}>
      <Stack spacing={1}>
        <TextField label="Search individuals" value={query} onChange={(event: React.ChangeEvent<HTMLInputElement>): void => setQuery(event.target.value)} />
        <FormControlLabel control={<Checkbox checked={includeArchived} onChange={(event: React.ChangeEvent<HTMLInputElement>): void => setIncludeArchived(event.target.checked)} />} label="Show archived" />
        <Button onClick={(): void => chooseProfile(undefined)}>New individual</Button>
        {directory.map((official: OfficialProfile): React.ReactElement =>
          <Button key={official.id} variant={official.id === selectedId ? 'contained' : 'outlined'}
            sx={{ justifyContent: 'flex-start' }} onClick={(): void => chooseProfile(official)}>
            {official.displayName}{official.archived ? ' (archived)' : ''}
          </Button>)}
      </Stack>
      <ProfileEditor draft={profileDraft} onChange={setProfileDraft} selected={selected} onSave={saveProfile}
        onArchive={(): void => {
          if (selected) run((): Promise<void> => props.onArchiveProfile(selected.id, !selected.archived)); 
        }} />
    </Box>
    <Typography variant="h6">Officials</Typography>
    <Typography variant="body2">Event and session assignments, plus the contact list.</Typography>
    <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))' }}>
      <TextField select label="Event" value={eventId || ''} onChange={(event: React.ChangeEvent<HTMLInputElement>): void => {
        const nextId: EventId = event.target.value as EventId;
        setEventId(nextId); setSessionId(undefined); setAssignmentId(undefined);
        setAssignmentDraft(selected ? emptyAssignment(nextId, selected.id) : undefined);
      }}>
        {props.catalog.events.map((event): React.ReactElement => <MenuItem key={event.id} value={event.id}>{event.name}</MenuItem>)}
      </TextField>
      <TextField select label="Contact list session" value={sessionId || ''} onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
        setSessionId(event.target.value as SessionId || undefined)}>
        <MenuItem value="">All sessions</MenuItem>
        {props.catalog.sessions.filter((session): boolean => session.eventId === eventId).map((session): React.ReactElement =>
          <MenuItem key={session.id} value={session.id}>{session.name}</MenuItem>)}
      </TextField>
    </Box>
    {selected && eventId && <Stack spacing={1}>
      {assignments.map((assignment: OfficialAssignment): React.ReactElement =>
        <Button key={assignment.id} variant={assignment.id === assignmentId ? 'contained' : 'outlined'}
          onClick={(): void => chooseAssignment(assignment)}>
          {assignment.role} · {assignment.sessionId
            ? props.catalog.sessions.find((session): boolean => session.id === assignment.sessionId)?.name || 'Unknown session'
            : 'Event-wide'}
        </Button>)}
      <Button onClick={(): void => {
        setAssignmentId(undefined); setAssignmentDraft(emptyAssignment(eventId, selected.id)); 
      }}>
        New assignment
      </Button>
      {assignmentDraft && <AssignmentEditor assignment={selectedAssignment} catalog={props.catalog} draft={assignmentDraft}
        onChange={setAssignmentDraft} selected={selected} onSave={saveAssignment}
        onRemove={(): void => {
          if (selectedAssignment) run((): Promise<void> => props.onRemoveAssignment(selectedAssignment.id)
            .then((): void => {
              setAssignmentId(undefined); setAssignmentDraft(emptyAssignment(eventId, selected.id)); 
            })); 
        }} />}
    </Stack>}
    <IndividualLinksEditor catalog={props.catalog} eventId={eventId} selected={selected}
      onLink={props.onLinkIndividual} onUnlink={props.onUnlinkIndividual} />
    <FormControlLabel control={<Checkbox checked={detailed} onChange={(event: React.ChangeEvent<HTMLInputElement>): void => setDetailed(event.target.checked)} />} label="Detailed contact list (includes private notes)" />
    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
      <Button disabled={!eventId} onClick={(): void => run((): Promise<void> => Promise.resolve(printReport(report)))}>Print</Button>
      <Button disabled={!eventId} onClick={(): void => run((): Promise<void> => Promise.resolve(exportCsv()))}>CSV</Button>
      <Button disabled={!eventId} onClick={exportPdf}>PDF</Button>
    </Stack>
    <Typography variant="body2">{rows.length} assignment{rows.length === 1 ? '' : 's'} in contact list</Typography>
    {rows.map((row: OfficialContactRow): React.ReactElement =>
      <Box key={row.assignmentId} sx={{ borderBottom: 1, borderColor: 'divider', pb: 1 }}>
        <Typography>{row.displayName}{row.archived ? ' (archived)' : ''} · {row.role} · {row.sessionName}</Typography>
        <Typography variant="body2">{row.position} · {row.email} · {row.phone}</Typography>
        {detailed && <Typography variant="body2">{row.notes}</Typography>}
      </Box>)}
  </Stack>;
};
