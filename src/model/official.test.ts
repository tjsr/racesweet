import { describe, expect, it } from 'vitest';
import type { OfficialAssignmentInput, OfficialProfileInput } from './official.js';
import { normalizeOfficialAssignment, normalizeOfficialProfile, splitIndividualName } from './official.js';

const profile: OfficialProfileInput = {
  displayName: ' Alex ', email: ' alex@example.org ', notes: ' Note ', phone: '+61 400 000 000',
};

describe('official validation', () => {
  it('normalizes profile fields and rejects invalid contact information', () => {
    expect(normalizeOfficialProfile(profile)).toMatchObject({
      displayName: 'Alex', email: 'alex@example.org', notes: 'Note',
    });
    expect((): OfficialProfileInput => normalizeOfficialProfile({ ...profile, phone: 'abc' })).toThrow(/phone/);
  });

  it('stores licenses and emergency contacts on any individual profile', () => {
    const input: OfficialProfileInput = {
      ...profile,
      emergencyContacts: [{ email: ' support@example.org ', name: ' Casey ', phone: '+61 400 111 222', relationship: 'Partner' }],
      licenses: [{ expiresOn: '2027-06-12', issuer: 'Club', number: ' LIC-42 ', type: 'Racing' }],
    };
    expect(normalizeOfficialProfile(input)).toMatchObject({
      emergencyContacts: [{ email: 'support@example.org', name: 'Casey' }],
      licenses: [{ number: 'LIC-42', type: 'Racing' }],
    });
    expect((): OfficialProfileInput => normalizeOfficialProfile({ ...input, licenses: [{ number: '' }] }))
      .toThrow(/license/);
    expect((): OfficialProfileInput => normalizeOfficialProfile({ ...input,
      emergencyContacts: [{ name: 'Casey', phone: 'bad' }] })).toThrow(/emergency contact/);
  });

  it('derives a shared display name from first and last name and validates person attributes', () => {
    expect(splitIndividualName('  Alex Rider  ')).toEqual({ firstName: 'Alex', lastName: 'Rider' });
    expect(splitIndividualName('Alex')).toEqual({ firstName: 'Alex', lastName: '' });
    expect(normalizeOfficialProfile({ ...profile, dateOfBirth: '2001-02-03', firstName: ' Pat ',
      gender: 'female', lastName: ' Rider ' })).toMatchObject({
      dateOfBirth: '2001-02-03', displayName: 'Pat Rider', firstName: 'Pat', gender: 'female', lastName: 'Rider',
    });
    expect((): OfficialProfileInput => normalizeOfficialProfile({ ...profile, dateOfBirth: '2001-02-30' }))
      .toThrow(/date of birth/);
    expect((): OfficialProfileInput => normalizeOfficialProfile({ ...profile, firstName: '' }))
      .toThrow(/name/);
  });

  it('normalizes assignment fields and requires a position, role, and valid availability', () => {
    const assignment: OfficialAssignmentInput = {
      availability: [{ status: 'available' }], eventId: 'event', notes: ' Gate ', officialId: 'official',
      position: ' Start line ', responsibilityOverride: ' Flag ', role: ' Marshal ',
    };
    expect(normalizeOfficialAssignment(assignment)).toMatchObject({
      availability: [{ status: 'available' }], notes: 'Gate', position: 'Start line', responsibilityOverride: 'Flag', role: 'Marshal',
    });
    expect((): OfficialAssignmentInput => normalizeOfficialAssignment({ ...assignment, role: '' }))
      .toThrow(/role/);
    expect((): OfficialAssignmentInput => normalizeOfficialAssignment({ ...assignment, availability: [
      { endAt: '2026-06-12T09:00:00.000Z', startAt: '2026-06-12T10:00:00.000Z', status: 'available' },
    ] })).toThrow(/availability/);
  });
});
