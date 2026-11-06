import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import React from 'react';
import { IdentifierDisplay } from '../../controls/identifierDisplay.js';
import { splitIndividualName } from '../../model/official.js';
import type {
  IndividualEmergencyContact,
  IndividualLicense,
  OfficialProfile,
  OfficialProfileInput,
} from '../../model/official.js';

export const createEmptyIndividualDraft = (): OfficialProfileInput => ({
  dateOfBirth: '', displayName: '', email: '', emergencyContacts: [], firstName: '', gender: '', lastName: '',
  licenses: [], notes: '', phone: '',
});

export const getIndividualDraft = (profile: OfficialProfile): OfficialProfileInput => {
  const name: { firstName: string; lastName: string } = splitIndividualName(profile.displayName);
  return {
    dateOfBirth: profile.dateOfBirth || '',
    displayName: profile.displayName,
    email: profile.email,
    emergencyContacts: profile.emergencyContacts || [],
    firstName: profile.firstName ?? name.firstName,
    gender: profile.gender || '',
    lastName: profile.lastName ?? name.lastName,
    licenses: profile.licenses || [],
    notes: profile.notes,
    phone: profile.phone,
  };
};

const LicenseFields = ({ licenses, onChange }: {
  licenses: IndividualLicense[];
  onChange: (licenses: IndividualLicense[]) => void;
}): React.ReactElement => {
  const rows: IndividualLicense[] = licenses.length > 0 ? licenses : [{ number: '' }];
  const update = (index: number, patch: Partial<IndividualLicense>): void =>
    onChange(rows.map((license: IndividualLicense, licenseIndex: number): IndividualLicense =>
      licenseIndex === index ? { ...license, ...patch } : license));
  return <Stack spacing={1}>
    <Typography variant="subtitle2">License numbers</Typography>
    {rows.map((license: IndividualLicense, index: number): React.ReactElement =>
      <Box key={index} sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))' }}>
        <TextField label="License number" required value={license.number}
          slotProps={{ htmlInput: { 'aria-label': `Individual License Number ${index + 1}` } }}
          onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
            update(index, { number: event.target.value })} />
        <TextField label="License type" value={license.type || ''} onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
          update(index, { type: event.target.value })} />
        <TextField label="Issuer" value={license.issuer || ''} onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
          update(index, { issuer: event.target.value })} />
        <TextField label="Expires on" type="date" value={license.expiresOn || ''}
          slotProps={{ inputLabel: { shrink: true } }} onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
            update(index, { expiresOn: event.target.value })} />
        {licenses.length > 0 && <Button onClick={(): void => onChange(licenses.filter(
          (_license: IndividualLicense, licenseIndex: number): boolean => licenseIndex !== index))}>Remove license</Button>}
      </Box>)}
    <Button onClick={(): void => onChange([...rows, { number: '' }])}>Add another license</Button>
  </Stack>;
};

const EmergencyContactFields = ({ contacts, onChange }: {
  contacts: IndividualEmergencyContact[];
  onChange: (contacts: IndividualEmergencyContact[]) => void;
}): React.ReactElement => {
  const update = (index: number, patch: Partial<IndividualEmergencyContact>): void =>
    onChange(contacts.map((contact: IndividualEmergencyContact, contactIndex: number): IndividualEmergencyContact =>
      contactIndex === index ? { ...contact, ...patch } : contact));
  return <Stack spacing={1}>
    <Typography variant="subtitle2">Emergency contacts</Typography>
    {contacts.map((contact: IndividualEmergencyContact, index: number): React.ReactElement =>
      <Box key={index} sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))' }}>
        <TextField label="Contact name" required value={contact.name} onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
          update(index, { name: event.target.value })} />
        <TextField label="Relationship" value={contact.relationship || ''} onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
          update(index, { relationship: event.target.value })} />
        <TextField label="Contact phone" required type="tel" value={contact.phone} onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
          update(index, { phone: event.target.value })} />
        <TextField label="Contact email" type="email" value={contact.email || ''} onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
          update(index, { email: event.target.value })} />
        <Button onClick={(): void => onChange(contacts.filter((_contact: IndividualEmergencyContact, contactIndex: number): boolean =>
          contactIndex !== index))}>Remove contact</Button>
      </Box>)}
    <Button onClick={(): void => onChange([...contacts, { name: '', phone: '' }])}>Add emergency contact</Button>
  </Stack>;
};

export const IndividualProfileEditor = ({ draft, onArchive, onChange, onSave, selected }: {
  draft: OfficialProfileInput;
  onArchive: () => void;
  onChange: (draft: OfficialProfileInput) => void;
  onSave: () => void;
  selected?: OfficialProfile;
}): React.ReactElement => {
  const change = (key: 'dateOfBirth' | 'email' | 'firstName' | 'gender' | 'lastName' | 'notes' | 'phone', value: string): void =>
    onChange({ ...draft, [key]: value });
  return <Stack spacing={1.5}>
    <Typography variant="h6">{selected ? 'Edit individual' : 'New individual'}</Typography>
    {selected && <IdentifierDisplay label="Individual ID" value={selected.id} />}
    <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
      <TextField label="First name" required value={draft.firstName || ''}
        slotProps={{ htmlInput: { 'aria-label': 'Individual First Name' } }}
        onChange={(event: React.ChangeEvent<HTMLInputElement>): void => change('firstName', event.target.value)} />
      <TextField label="Surname" value={draft.lastName || ''}
        slotProps={{ htmlInput: { 'aria-label': 'Individual Surname' } }}
        onChange={(event: React.ChangeEvent<HTMLInputElement>): void => change('lastName', event.target.value)} />
      <TextField label="Gender" value={draft.gender || ''}
        slotProps={{ htmlInput: { 'aria-label': 'Individual Gender' } }}
        onChange={(event: React.ChangeEvent<HTMLInputElement>): void => change('gender', event.target.value)} />
      <TextField label="Date of birth" type="date" value={draft.dateOfBirth || ''}
        slotProps={{ htmlInput: { 'aria-label': 'Individual Date Of Birth' }, inputLabel: { shrink: true } }}
        onChange={(event: React.ChangeEvent<HTMLInputElement>): void => change('dateOfBirth', event.target.value)} />
      <TextField label="Email" type="email" value={draft.email || ''} onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
        change('email', event.target.value)} />
      <TextField label="Phone" type="tel" value={draft.phone || ''} onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
        change('phone', event.target.value)} />
    </Box>
    <LicenseFields licenses={draft.licenses || []} onChange={(licenses: IndividualLicense[]): void => onChange({ ...draft, licenses })} />
    <EmergencyContactFields contacts={draft.emergencyContacts || []}
      onChange={(emergencyContacts: IndividualEmergencyContact[]): void => onChange({ ...draft, emergencyContacts })} />
    <TextField label="Private notes" multiline minRows={2} value={draft.notes} onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
      change('notes', event.target.value)} />
    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
      <Button variant="contained" onClick={onSave}>{selected ? 'Save individual' : 'Create individual'}</Button>
      {selected && <Button color={selected.archived ? 'primary' : 'warning'} onClick={onArchive}>
        {selected.archived ? 'Restore individual' : 'Archive individual'}
      </Button>}
    </Stack>
  </Stack>;
};
