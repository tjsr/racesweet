import {
  Alert, Autocomplete, Box, Button, Card, CardActionArea, CardContent, Checkbox, FormControlLabel,
  MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import React from 'react';
import type { EventCatalogState } from '../../catalog/eventCatalog.js';
import { createOfficialContactReport } from '../../export/officialContactReport.js';
import { createReportPdf, downloadReportBlob, printReport, toReportCsv } from '../../export/tabularReport.js';
import type {
  OfficialAssignment,
  OfficialAssignmentInput,
  OfficialAvailabilitySlot,
  OfficialProfile,
} from '../../model/official.js';
import type { EventId, SessionId } from '../../model/raceevent.js';
import { type OfficialContactRow, getOfficialContactRows } from '../../processing/officialContacts.js';

export interface OfficialsPanelProps {
  catalog: EventCatalogState;
  eventId?: EventId;
  onCreateAssignment: (input: OfficialAssignmentInput) => Promise<void>;
  onOpenIndividual: () => void;
  onRemoveAssignment: (assignmentId: string) => Promise<void>;
  onSelectIndividual: (individualId: string | undefined) => void;
  onUpdateAssignment: (assignmentId: string, input: OfficialAssignmentInput) => Promise<void>;
  selectedIndividualId?: string;
}

const emptyAssignment = (eventId: EventId, officialId: string): OfficialAssignmentInput => ({
  availability: [], eventId, notes: '', officialId, position: '', role: '',
});

const assignmentInput = (assignment: OfficialAssignment): OfficialAssignmentInput => ({
  availability: assignment.availability || [],
  eventId: assignment.eventId,
  notes: assignment.notes,
  officialId: assignment.officialId,
  position: assignment.position || '',
  responsibilityOverride: assignment.responsibilityOverride,
  role: assignment.role,
  sessionId: assignment.sessionId,
});

const toLocalDateTime = (value: string | undefined): string => {
  if (!value) return '';
  const date: Date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString().slice(0, 16);
};

const fromLocalDateTime = (value: string): string | undefined => value ? new Date(value).toISOString() : undefined;

const AvailabilityFields = ({ slots, onChange }: {
  onChange: (slots: OfficialAvailabilitySlot[]) => void;
  slots: OfficialAvailabilitySlot[];
}): React.ReactElement => {
  const update = (index: number, patch: Partial<OfficialAvailabilitySlot>): void =>
    onChange(slots.map((slot: OfficialAvailabilitySlot, slotIndex: number): OfficialAvailabilitySlot =>
      slotIndex === index ? { ...slot, ...patch } : slot));
  return <Stack spacing={1}>
    <Typography variant="subtitle2">Assignment availability</Typography>
    {slots.map((slot: OfficialAvailabilitySlot, index: number): React.ReactElement =>
      <Box key={`${slot.startAt || 'open'}-${slot.endAt || 'open'}-${index}`} sx={{ display: 'grid', gap: 1,
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))' }}>
        <TextField select label="Availability status" value={slot.status}
          onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
            update(index, { status: event.target.value as OfficialAvailabilitySlot['status'] })}>
          <MenuItem value="available">Available</MenuItem>
          <MenuItem value="unavailable">Unavailable</MenuItem>
        </TextField>
        <TextField label="Available from" type="datetime-local" value={toLocalDateTime(slot.startAt)}
          slotProps={{ inputLabel: { shrink: true } }} onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
            update(index, { startAt: fromLocalDateTime(event.target.value) })} />
        <TextField label="Available to" type="datetime-local" value={toLocalDateTime(slot.endAt)}
          slotProps={{ inputLabel: { shrink: true } }} onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
            update(index, { endAt: fromLocalDateTime(event.target.value) })} />
        <Button onClick={(): void => onChange(slots.filter((_slot: OfficialAvailabilitySlot, slotIndex: number): boolean =>
          slotIndex !== index))}>Remove availability slot</Button>
      </Box>)}
    <Button onClick={(): void => onChange([...slots, { status: 'available' }])}>Add availability slot</Button>
  </Stack>;
};

export const OfficialsPanel = (props: OfficialsPanelProps): React.ReactElement => {
  const [sessionId, setSessionId] = React.useState<SessionId | undefined>(undefined);
  const [includeArchived, setIncludeArchived] = React.useState<boolean>(false);
  const [detailed, setDetailed] = React.useState<boolean>(false);
  const [assignmentId, setAssignmentId] = React.useState<string | undefined>(undefined);
  const [draft, setDraft] = React.useState<OfficialAssignmentInput | undefined>(undefined);
  const [error, setError] = React.useState<string>('');
  React.useEffect((): void => {
    setSessionId(undefined);
    setAssignmentId(undefined);
    setDraft(undefined);
  }, [props.eventId]);
  const selected: OfficialProfile | undefined = props.catalog.officials?.find((profile: OfficialProfile): boolean =>
    profile.id === props.selectedIndividualId);
  const assignments: OfficialAssignment[] = (props.catalog.officialAssignments || []).filter((assignment: OfficialAssignment): boolean =>
    !assignment.removed && assignment.eventId === props.eventId);
  const selectedAssignment: OfficialAssignment | undefined = assignments.find((assignment: OfficialAssignment): boolean =>
    assignment.id === assignmentId);
  const currentDraft: OfficialAssignmentInput | undefined = props.eventId && selected
    ? draft?.eventId === props.eventId && draft.officialId === selected.id
      ? draft : emptyAssignment(props.eventId, selected.id)
    : undefined;
  const rows: OfficialContactRow[] = props.eventId
    ? getOfficialContactRows(props.catalog, { eventId: props.eventId, includeArchived, sessionId }) : [];
  const matchingProfiles: OfficialProfile[] = (props.catalog.officials || []).filter((profile: OfficialProfile): boolean =>
    includeArchived || !profile.archived)
    .sort((first: OfficialProfile, second: OfficialProfile): number => first.displayName.localeCompare(second.displayName));
  const report = createOfficialContactReport(rows, detailed,
    `Officials — ${props.catalog.events.find((event): boolean => event.id === props.eventId)?.name || 'Event'}`);

  const run = (operation: () => Promise<void>): void => {
    setError('');
    Promise.resolve().then(operation).catch((failure: Error): void => setError(failure.message));
  };
  const selectIndividual = (individualId: string): void => {
    props.onSelectIndividual(individualId || undefined);
    setAssignmentId(undefined);
    setDraft(props.eventId && individualId ? emptyAssignment(props.eventId, individualId) : undefined);
  };
  const selectAssignment = (assignment: OfficialAssignment): void => {
    props.onSelectIndividual(assignment.officialId);
    setAssignmentId(assignment.id);
    setDraft(assignmentInput(assignment));
  };
  const save = (): void => {
    if (!currentDraft) return;
    run((): Promise<void> => selectedAssignment
      ? props.onUpdateAssignment(selectedAssignment.id, currentDraft)
      : props.onCreateAssignment(currentDraft));
  };
  const remove = (): void => {
    if (!selectedAssignment) return;
    run((): Promise<void> => props.onRemoveAssignment(selectedAssignment.id).then((): void => {
      setAssignmentId(undefined);
      setDraft(props.eventId && selected ? emptyAssignment(props.eventId, selected.id) : undefined);
    }));
  };
  const exportCsv = (): void => downloadReportBlob(
    new Blob([toReportCsv(report)], { type: 'text/csv;charset=utf-8' }), 'official-contacts.csv');
  const exportPdf = (): void => run((): Promise<void> => createReportPdf(report)
    .then((blob: Blob): void => downloadReportBlob(blob, 'official-contacts.pdf')));

  return <Stack spacing={2} sx={{ minWidth: 0, p: 2 }}>
    <Typography variant="h5">Officials</Typography>
    {error && <Alert severity="error">{error}</Alert>}
    <Box sx={{ '@media (max-width: 720px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
      display: 'grid', gap: 2,
      gridTemplateColumns: 'minmax(0, 320px) minmax(0, 1fr)' }}>
      <Stack spacing={1} sx={{ minWidth: 0 }}>
        <FormControlLabel control={<Checkbox checked={includeArchived} onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
          setIncludeArchived(event.target.checked)} />} label="Show archived" />
        <TextField select label="Contact list session" value={sessionId || ''} onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
          setSessionId(event.target.value as SessionId || undefined)}>
          <MenuItem value="">All sessions</MenuItem>
          {props.catalog.sessions.filter((session): boolean => session.eventId === props.eventId).map((session): React.ReactElement =>
            <MenuItem key={session.id} value={session.id}>{session.name}</MenuItem>)}
        </TextField>
        <Typography variant="subtitle2">Assignments for this event</Typography>
        {rows.map((row: OfficialContactRow): React.ReactElement =>
          <Card key={row.assignmentId} variant="outlined" sx={{ borderColor: row.assignmentId === assignmentId ? 'primary.main' : 'divider' }}>
            <CardActionArea onClick={(): void => {
              const assignment: OfficialAssignment | undefined = assignments.find((candidate: OfficialAssignment): boolean =>
                candidate.id === row.assignmentId);
              if (assignment) selectAssignment(assignment);
            }}>
              <CardContent>
                <Typography variant="subtitle1">{row.displayName}{row.archived ? ' (archived)' : ''}</Typography>
                <Typography variant="body2">{row.role} · {row.sessionName}</Typography>
                <Typography variant="body2">{row.position}</Typography>
                <Typography variant="caption">Individual ID: {row.officialId} / Assignment ID: {row.assignmentId}</Typography>
                <Typography variant="body2">{row.email} {row.phone}</Typography>
                <Typography variant="body2">{row.responsibilities}</Typography>
                <Typography variant="body2">{row.availability}</Typography>
                {detailed && <Typography variant="body2">{row.notes}</Typography>}
              </CardContent>
            </CardActionArea>
          </Card>)}
        {rows.length === 0 && <Typography variant="body2">No matching assignments.</Typography>}
      </Stack>
      <Stack spacing={1} sx={{ minWidth: 0 }}>
        <Typography variant="h6">{selectedAssignment ? 'Edit official assignment' : 'Assign an official'}</Typography>
        <Autocomplete filterOptions={(profiles: OfficialProfile[], state: { inputValue: string }): OfficialProfile[] =>
          profiles.filter((profile: OfficialProfile): boolean => [profile.displayName, profile.email, profile.phone]
            .filter(Boolean).join(' ').toLocaleLowerCase().includes(state.inputValue.trim().toLocaleLowerCase()))}
          getOptionLabel={(profile: OfficialProfile): string => profile.displayName}
          isOptionEqualToValue={(left: OfficialProfile, right: OfficialProfile): boolean => left.id === right.id}
          onChange={(_event: React.SyntheticEvent, profile: OfficialProfile | null): void => selectIndividual(profile?.id || '')}
          options={matchingProfiles} renderInput={(params): React.ReactElement =>
            <TextField {...params} label="Search and select individual" placeholder="Type a name, email, or phone" />}
          renderOption={(optionProps: React.HTMLAttributes<HTMLLIElement>, profile: OfficialProfile): React.ReactElement =>
            <li {...optionProps} key={profile.id}>{profile.displayName}{profile.archived ? ' (archived)' : ''} — {profile.id}</li>}
          value={selected || null} />
        {selected && <TextField label="Individual ID" slotProps={{ htmlInput: { readOnly: true } }} value={selected.id} />}
        <Button disabled={!selected} onClick={props.onOpenIndividual}>Edit individual details</Button>
        {currentDraft && <>
          <TextField select label="Session" value={currentDraft.sessionId || ''} onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
            setDraft({ ...currentDraft, sessionId: event.target.value as SessionId || undefined })}>
            <MenuItem value="">Event-wide</MenuItem>
            {props.catalog.sessions.filter((session): boolean => session.eventId === props.eventId).map((session): React.ReactElement =>
              <MenuItem key={session.id} value={session.id}>{session.name}</MenuItem>)}
          </TextField>
          {selectedAssignment && <TextField label="Assignment ID" slotProps={{ htmlInput: { readOnly: true } }} value={selectedAssignment.id} />}
          <TextField helperText="The duty or station this person will cover, for example Start marshal or Pit exit."
            label="Position / duty" required value={currentDraft.position} onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
              setDraft({ ...currentDraft, position: event.target.value, role: event.target.value })} />
          <TextField label="Responsibilities" value={currentDraft.responsibilityOverride || ''} onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
            setDraft({ ...currentDraft, responsibilityOverride: event.target.value })} />
          <TextField label="Assignment notes" multiline minRows={2} value={currentDraft.notes} onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
            setDraft({ ...currentDraft, notes: event.target.value })} />
          <AvailabilityFields slots={currentDraft.availability} onChange={(availability: OfficialAvailabilitySlot[]): void =>
            setDraft({ ...currentDraft, availability })} />
        </>}
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          <Button variant="contained" disabled={!currentDraft || !selected || selected.archived} onClick={save}>
            {selectedAssignment ? 'Save assignment' : 'Add assignment'}
          </Button>
          {selectedAssignment && <Button color="warning" onClick={remove}>Remove assignment</Button>}
          <Button disabled={!selected} onClick={(): void => {
            setAssignmentId(undefined);
            setDraft(props.eventId && selected ? emptyAssignment(props.eventId, selected.id) : undefined);
          }}>New assignment</Button>
        </Stack>
      </Stack>
    </Box>
    <Typography variant="h6">Contact list</Typography>
    <FormControlLabel control={<Checkbox checked={detailed} onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
      setDetailed(event.target.checked)} />} label="Detailed contact list (includes private notes)" />
    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
      <Button disabled={!props.eventId} onClick={(): void => run((): Promise<void> => Promise.resolve(printReport(report)))}>Print</Button>
      <Button disabled={!props.eventId} onClick={(): void => run((): Promise<void> => Promise.resolve(exportCsv()))}>CSV</Button>
      <Button disabled={!props.eventId} onClick={exportPdf}>PDF</Button>
    </Stack>
    <Typography variant="body2">{rows.length} assignment{rows.length === 1 ? '' : 's'} in contact list</Typography>
  </Stack>;
};
