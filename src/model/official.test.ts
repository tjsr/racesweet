import { describe, expect, it } from 'vitest';
import type { OfficialAssignmentInput, OfficialProfileInput } from './official.js';
import { normalizeOfficialAssignment, normalizeOfficialProfile } from './official.js';

const profile: OfficialProfileInput = {
  availability: [{ status: 'available' }], displayName: ' Alex ', email: ' alex@example.org ',
  notes: ' Note ', phone: '+61 400 000 000', position: ' Marshal ', responsibilities: [' Pit lane '],
};

describe('official validation', () => {
  it('normalizes profile fields and rejects invalid contact, availability, or responsibilities', () => {
    expect(normalizeOfficialProfile(profile)).toMatchObject({
      displayName: 'Alex', email: 'alex@example.org', notes: 'Note', position: 'Marshal',
      responsibilities: ['Pit lane'],
    });
    expect((): OfficialProfileInput => normalizeOfficialProfile({ ...profile, phone: 'abc' })).toThrow(/phone/);
    expect((): OfficialProfileInput => normalizeOfficialProfile({ ...profile, responsibilities: ['A', 'a'] }))
      .toThrow(/unique/);
    expect((): OfficialProfileInput => normalizeOfficialProfile({ ...profile, availability: [
      { startAt: '2026-06-12T10:00:00.000Z', endAt: '2026-06-12T09:00:00.000Z', status: 'available' },
    ] })).toThrow(/availability/);
  });

  it('normalizes assignment fields and requires a role', () => {
    const assignment: OfficialAssignmentInput = {
      eventId: 'event', notes: ' Gate ', officialId: 'official', responsibilityOverride: ' Flag ', role: ' Marshal ',
    };
    expect(normalizeOfficialAssignment(assignment)).toMatchObject({
      notes: 'Gate', responsibilityOverride: 'Flag', role: 'Marshal',
    });
    expect((): OfficialAssignmentInput => normalizeOfficialAssignment({ ...assignment, role: '' }))
      .toThrow(/role/);
  });
});
