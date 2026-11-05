import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { getEntrantsForEvent, getEntriesForEvent } from '../catalog/eventCatalog.js';
import { createSeedEventCatalogLedger } from '../ledger/createSeedEventCatalogLedger.js';
import { applyEventCatalogLedger, type EventCatalogLedger } from '../ledger/eventCatalogLedger.js';
import type { OfficialAssignmentInput, OfficialProfileInput } from '../model/official.js';
import { createEventEntrantId, createEventParticipantId, createId, createMutationId } from '../model/ids.js';
import type { EventCatalogPersistence } from '../persistence/eventCatalogPersistence.js';
import { NodeJsonEventCatalogPersistence } from '../persistence/nodePersistence.js';
import { getOfficialContactRows } from '../processing/officialContacts.js';
import { EventCatalogService } from './eventCatalogService.js';

const profileInput: OfficialProfileInput = {
  displayName: 'Alex Marshal', email: 'alex@example.org', notes: 'Private contact note',
  phone: '+61 400 000 000',
};

const assignmentInput = (eventId: string, officialId: string, role: string, position: string): OfficialAssignmentInput => ({
  availability: [{ endAt: '2026-06-12T12:00:00.000Z', startAt: '2026-06-12T08:00:00.000Z', status: 'available' }],
  eventId, notes: '', officialId, position, role,
});

const createFixture = (): Promise<{
  getSaved: () => EventCatalogLedger;
  onPersistedLedger: Mock<(ledger: EventCatalogLedger) => Promise<void>>;
  persistence: EventCatalogPersistence;
  service: EventCatalogService;
}> => {
  let saved: EventCatalogLedger = createSeedEventCatalogLedger();
  const onPersistedLedger: Mock<(ledger: EventCatalogLedger) => Promise<void>> =
    vi.fn(async (_ledger: EventCatalogLedger): Promise<void> => undefined);
  const persistence: EventCatalogPersistence = {
    load: vi.fn(async (): Promise<EventCatalogLedger> => saved),
    save: vi.fn(async (ledger: EventCatalogLedger): Promise<void> => { saved = ledger; }),
  };
  return EventCatalogService.create(persistence, { onPersistedLedger }).then((service: EventCatalogService) => ({
    getSaved: (): EventCatalogLedger => saved, onPersistedLedger, persistence, service,
  }));
};

describe('official catalog ledger flow', () => {
  it('reconciles loaded riders and team members into linked Individuals exactly once', async () => {
    let saved: EventCatalogLedger = createSeedEventCatalogLedger();
    const eventId = applyEventCatalogLedger(saved).events[0]!.id;
    const teamId = createEventEntrantId();
    const memberId = createEventParticipantId();
    const existingIndividualId = createId('officialId');
    const teamMemberEntrantId = createEventEntrantId();
    saved = {
      ...saved,
      mutations: [...saved.mutations, {
        id: createMutationId(), official: {
          archived: false, createdAt: '2026-06-11T00:00:00.000Z', displayName: 'Taylor Timekeeper',
          id: existingIndividualId, notes: '', updatedAt: '2026-06-11T00:00:00.000Z',
        }, timestamp: '2026-06-11T00:00:00.000Z', type: 'official-profile-created',
      }, {
        entrant: {
          categoryIds: [], entrantType: 'team', eventId, id: teamId, memberParticipantIds: [memberId],
          name: 'Relay Team', teamMembers: [{ dateOfBirth: '1994-03-02', firstName: 'Taylor',
            gender: 'female', lastName: 'Timekeeper', participantId: memberId }],
        },
        id: createMutationId(), timestamp: '2026-06-12T00:00:00.000Z', type: 'entrant-created',
      }, {
        entrant: {
          categoryIds: [], entrantType: 'rider', eventId, firstName: 'Taylor', id: teamMemberEntrantId,
          lastName: 'Timekeeper', memberParticipantIds: [memberId], name: 'Taylor Timekeeper', teamEntrantId: teamId,
        },
        id: createMutationId(), timestamp: '2026-06-12T00:00:01.000Z', type: 'entrant-created',
      }],
    };
    const onPersistedLedger = vi.fn(async (_ledger: EventCatalogLedger): Promise<void> => undefined);
    const persistence: EventCatalogPersistence = {
      load: vi.fn(async (): Promise<EventCatalogLedger> => saved),
      save: vi.fn(async (ledger: EventCatalogLedger): Promise<void> => { saved = ledger; }),
    };
    const service: EventCatalogService = await EventCatalogService.create(persistence, {
      onPersistedLedger, reconcileEntrantIndividualsOnLoad: true,
    });
    expect(service.catalog.officials?.map((profile) => profile.displayName).sort())
      .toEqual(['Rider 101', 'Taylor Timekeeper']);
    expect(service.catalog.individualLinks).toEqual(expect.arrayContaining([
      expect.objectContaining({ entrantId: teamId, individualId: expect.any(String), participantId: memberId }),
      expect.objectContaining({ entrantId: teamMemberEntrantId, individualId: expect.any(String) }),
    ]));
    const teamMemberProfile = service.catalog.officials?.find((profile) => profile.displayName === 'Taylor Timekeeper');
    expect(teamMemberProfile?.id).toBe(existingIndividualId);
    expect(service.catalog.individualLinks?.filter((link) => link.individualId === teamMemberProfile?.id)).toHaveLength(2);
    const callbackCount: number = onPersistedLedger.mock.calls.length;
    expect(onPersistedLedger.mock.calls.at(-1)?.[0].mutations.slice(-4).map((mutation) => mutation.type)).toEqual([
      'official-profile-created', 'individual-linked', 'individual-linked', 'individual-linked',
    ]);
    const mutationCount: number = saved.mutations.length;
    const reloaded: EventCatalogService = await EventCatalogService.create(persistence, {
      onPersistedLedger, reconcileEntrantIndividualsOnLoad: true,
    });
    expect(reloaded.catalog.officials).toHaveLength(2);
    expect(reloaded.catalog.individualLinks).toHaveLength(3);
    expect(saved.mutations).toHaveLength(mutationCount);
    expect(onPersistedLedger).toHaveBeenCalledTimes(callbackCount);
  });

  it('reopens official profiles and assignments from JSON persistence', async () => {
    const directory: string = await mkdtemp(path.join(os.tmpdir(), 'racesweet-officials-'));
    try {
      const persistence = new NodeJsonEventCatalogPersistence(path.join(directory, 'event-catalog.json'));
      const service: EventCatalogService = await EventCatalogService.create(persistence);
      const eventId = service.catalog.events[0]!.id;
      await service.createOfficialProfile(profileInput);
      const officialId: string = service.catalog.officials![0]!.id;
      await service.createOfficialAssignment(assignmentInput(eventId, officialId, 'Marshal', 'Track'));
      const reloaded: EventCatalogService = await EventCatalogService.create(persistence);
      expect(reloaded.catalog.officials![0]?.displayName).toBe('Alex Marshal');
      expect(reloaded.catalog.officialAssignments![0]?.officialId).toBe(officialId);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('persists, replays, and calls upstream for every profile and assignment write', async () => {
    const fixture = await createFixture();
    const service: EventCatalogService = fixture.service;
    const event = service.catalog.events[0]!;
    const session = service.catalog.sessions.find((candidate): boolean => candidate.eventId === event.id)!;
    const entrantsBefore: number = getEntrantsForEvent(service.catalog, event.id).length;
    const entriesBefore: number = getEntriesForEvent(service.catalog, event.id).length;
    const raceBefore: string = JSON.stringify(service.getImportedRaceState(event.id, session.id));
    const mutationCountBefore: number = fixture.getSaved().mutations.length;
    await service.createOfficialProfile(profileInput);
    const officialId: string = service.catalog.officials![0]!.id;
    const assignment: OfficialAssignmentInput = {
      ...assignmentInput(event.id, officialId, 'Start marshal', 'Start line'), notes: 'Gate A', sessionId: session.id,
    };
    await service.createOfficialAssignment(assignment);
    const assignmentId: string = service.catalog.officialAssignments![0]!.id;
    await service.updateOfficialAssignment(assignmentId, { ...assignment, position: 'Finish line', role: 'Finish marshal' });
    await service.archiveOfficialProfile(officialId);
    expect(service.catalog.officials![0]?.archived).toBe(true);
    await expect(service.createOfficialAssignment({ ...assignment, role: 'Extra' })).rejects.toThrow(/Archived/);
    expect(getOfficialContactRows(service.catalog, { eventId: event.id, includeArchived: true, sessionId: session.id }))
      .toMatchObject([{ displayName: 'Alex Marshal', role: 'Finish marshal', archived: true }]);
    await service.archiveOfficialProfile(officialId, false);
    await service.removeOfficialAssignment(assignmentId);
    expect(service.catalog.officialAssignments![0]?.removed).toBe(true);
    expect(fixture.getSaved().mutations.slice(mutationCountBefore).map((mutation) => mutation.type)).toEqual([
      'official-profile-created', 'official-assignment-created',
      'official-assignment-updated', 'official-profile-archived', 'official-profile-archived',
      'official-assignment-removed',
    ]);
    expect(fixture.onPersistedLedger).toHaveBeenCalledTimes(6);
    expect(getEntrantsForEvent(service.catalog, event.id)).toHaveLength(entrantsBefore);
    expect(getEntriesForEvent(service.catalog, event.id)).toHaveLength(entriesBefore);
    expect(JSON.stringify(service.getImportedRaceState(event.id, session.id))).toBe(raceBefore);
    const reloaded: EventCatalogService = await EventCatalogService.create(fixture.persistence);
    expect(reloaded.catalog.officialAssignments![0]?.position).toBe('Finish line');
    expect(reloaded.catalog.officialAssignments![0]?.removed).toBe(true);
  });

  it('rejects malformed profiles, duplicate roles, and cross-event sessions', async () => {
    const { service } = await createFixture();
    await expect(service.createOfficialProfile({ ...profileInput, email: 'bad' })).rejects.toThrow(/email/);
    await service.createOfficialProfile(profileInput);
    const officialId: string = service.catalog.officials![0]!.id;
    const event = service.catalog.events[0]!;
    const otherSession = service.catalog.sessions.find((candidate): boolean => candidate.eventId !== event.id);
    if (otherSession) {
      await expect(service.createOfficialAssignment({
        ...assignmentInput(event.id, officialId, 'Marshal', 'Track'), sessionId: otherSession.id,
      })).rejects.toThrow(/does not belong/);
    }
    const input: OfficialAssignmentInput = assignmentInput(event.id, officialId, 'Marshal', 'Track');
    await service.createOfficialAssignment(input);
    await expect(service.createOfficialAssignment({ ...input, role: 'marshal' })).rejects.toThrow(/equivalent/);
    await expect(service.updateOfficialAssignment(service.catalog.officialAssignments![0]!.id,
      { ...input, officialId: 'different-official' })).rejects.toThrow(/Move an official assignment/);
  });

  it('keeps one official visible only in assigned events and selected sessions', async () => {
    const { service } = await createFixture();
    const firstEvent = service.catalog.events[0]!;
    const sessions = service.catalog.sessions.filter((candidate): boolean => candidate.eventId === firstEvent.id);
    await service.createEvent();
    const secondEvent = service.catalog.events.find((candidate): boolean => candidate.id !== firstEvent.id)!;
    await service.createOfficialProfile(profileInput);
    const officialId: string = service.catalog.officials![0]!.id;
    await service.createOfficialAssignment(assignmentInput(firstEvent.id, officialId, 'Event coordinator', 'Control'));
    await service.createOfficialAssignment({
      ...assignmentInput(firstEvent.id, officialId, 'Start marshal', 'Start line'), sessionId: sessions[0]!.id,
    });
    await service.createOfficialAssignment({
      ...assignmentInput(secondEvent.id, officialId, 'Chief marshal', 'Pits'),
    });
    expect(getOfficialContactRows(service.catalog, { eventId: firstEvent.id })).toHaveLength(2);
    expect(getOfficialContactRows(service.catalog, { eventId: firstEvent.id, sessionId: sessions[1]!.id })
      .map((row) => row.role)).toEqual(['Event coordinator']);
    expect(getOfficialContactRows(service.catalog, { eventId: secondEvent.id })
      .map((row) => row.role)).toEqual(['Chief marshal']);
    await service.archiveOfficialProfile(officialId);
    expect(getOfficialContactRows(service.catalog, { eventId: firstEvent.id })).toEqual([]);
    expect(getOfficialContactRows(service.catalog, { eventId: firstEvent.id, includeArchived: true })).toHaveLength(2);
  });

  it('links one individual to a participant in one event and an official role in another', async () => {
    const fixture = await createFixture();
    const service: EventCatalogService = fixture.service;
    const participationEvent = service.catalog.events[0]!;
    const rider = getEntrantsForEvent(service.catalog, participationEvent.id)[0]!;
    await service.createEvent();
    const dutyEvent = service.catalog.events.find((candidate): boolean => candidate.id !== participationEvent.id)!;
    await service.createOfficialProfile(profileInput);
    const individualId: string = service.catalog.officials![0]!.id;
    const raceBefore: string = JSON.stringify(service.getImportedRaceState(participationEvent.id,
      service.catalog.sessions.find((candidate): boolean => candidate.eventId === participationEvent.id)!.id));
    await service.linkIndividualToEntrant({ entrantId: rider.id, eventId: participationEvent.id, individualId });
    const linkId: string = service.catalog.individualLinks![0]!.id;
    await service.createOfficialAssignment(assignmentInput(dutyEvent.id, individualId, 'Starter', 'Start line'));
    expect(service.catalog.individualLinks![0]).toMatchObject({ entrantId: rider.id, individualId, removed: false });
    expect(getOfficialContactRows(service.catalog, { eventId: participationEvent.id })).toEqual([]);
    expect(getOfficialContactRows(service.catalog, { eventId: dutyEvent.id })[0]?.role).toBe('Starter');
    await expect(service.linkIndividualToEntrant({ entrantId: rider.id, eventId: participationEvent.id, individualId }))
      .rejects.toThrow(/already linked/);
    expect(JSON.stringify(service.getImportedRaceState(participationEvent.id,
      service.catalog.sessions.find((candidate): boolean => candidate.eventId === participationEvent.id)!.id)))
      .toBe(raceBefore);
    await service.unlinkIndividualFromEntrant(linkId);
    expect(service.catalog.individualLinks![0]?.removed).toBe(true);
    const reloaded: EventCatalogService = await EventCatalogService.create(fixture.persistence);
    expect(reloaded.catalog.individualLinks![0]?.removed).toBe(true);
    expect(fixture.getSaved().mutations.slice(-4).map((mutation) => mutation.type)).toEqual([
      'individual-linked', 'entrant-updated', 'official-assignment-created', 'individual-unlinked',
    ]);
  });

  it('creates a shared profile and entrant link in one persisted catalog write', async () => {
    const fixture = await createFixture();
    const service: EventCatalogService = fixture.service;
    const event = service.catalog.events[0]!;
    const rider = getEntrantsForEvent(service.catalog, event.id)[0]!;
    const before: number = fixture.getSaved().mutations.length;
    await service.createIndividualFromEntrant({ entrantId: rider.id, eventId: event.id });
    expect(service.catalog.officials![0]?.displayName).toBe(rider.name);
    expect(service.catalog.officials![0]).toMatchObject({ firstName: 'Rider', lastName: '101' });
    expect(service.catalog.individualLinks![0]?.individualId).toBe(service.catalog.officials![0]?.id);
    expect(fixture.getSaved().mutations.slice(before).map((mutation) => mutation.type)).toEqual([
      'official-profile-created', 'individual-linked',
    ]);
    expect(fixture.onPersistedLedger).toHaveBeenCalledTimes(1);
    await expect(service.createIndividualFromEntrant({ entrantId: rider.id, eventId: event.id }))
      .rejects.toThrow(/already linked/);
    const reloaded: EventCatalogService = await EventCatalogService.create(fixture.persistence);
    expect(reloaded.catalog.individualLinks![0]?.individualId).toBe(reloaded.catalog.officials![0]?.id);
  });

  it('keeps linked rider person fields in the shared profile and mirrors edits through one catalog write', async () => {
    const fixture = await createFixture();
    const service: EventCatalogService = fixture.service;
    const event = service.catalog.events[0]!;
    const rider = getEntrantsForEvent(service.catalog, event.id)[0]!;
    await service.updateEntrant(rider.id, { dateOfBirth: '2000-02-03', firstName: 'Original',
      gender: 'female', lastName: 'Rider', name: 'Original Rider' });
    await service.createIndividualFromEntrant({ entrantId: rider.id, eventId: event.id });
    const profile = service.catalog.officials![0]!;
    expect(profile).toMatchObject({ dateOfBirth: '2000-02-03', firstName: 'Original',
      gender: 'female', lastName: 'Rider' });
    const before: number = fixture.getSaved().mutations.length;
    const callbackCount: number = fixture.onPersistedLedger.mock.calls.length;
    await service.updateOfficialProfile(profile.id, { ...profile, dateOfBirth: '2001-04-05',
      firstName: 'Updated', lastName: 'Person', licenses: [{ number: 'LIC-19' }] });
    expect(service.catalog.entrants.find((entrant): boolean => entrant.id === rider.id)).toMatchObject({
      dateOfBirth: '2001-04-05', firstName: 'Updated', gender: 'female', lastName: 'Person', name: 'Updated Person',
    });
    expect(fixture.getSaved().mutations.slice(before).map((mutation) => mutation.type)).toEqual([
      'official-profile-updated', 'entrant-updated',
    ]);
    expect(fixture.onPersistedLedger).toHaveBeenCalledTimes(callbackCount + 1);
    const reloaded: EventCatalogService = await EventCatalogService.create(fixture.persistence);
    expect(reloaded.catalog.officials![0]?.licenses?.[0]?.number).toBe('LIC-19');
    expect(reloaded.catalog.entrants.find((entrant): boolean => entrant.id === rider.id)?.name).toBe('Updated Person');
  });

  it('links a named team member but rejects a team identity or a member from another team', async () => {
    const { service } = await createFixture();
    const eventId = service.catalog.events[0]!.id;
    await service.createOfficialProfile({ ...profileInput, displayName: 'Team member' });
    const individualId: string = service.catalog.officials![0]!.id;
    await service.createEntrant(eventId, 'team');
    const team = getEntrantsForEvent(service.catalog, eventId).find((entrant): boolean => entrant.entrantType === 'team')!;
    const participantId = createEventParticipantId();
    await service.updateEntrant(team.id, {
      memberParticipantIds: [participantId],
      teamMembers: [{ firstName: 'Team', gender: 'unspecified', lastName: 'Member', participantId }],
    });
    await expect(service.linkIndividualToEntrant({ entrantId: team.id, eventId, individualId }))
      .rejects.toThrow(/team member/);
    await expect(service.linkIndividualToEntrant({
      entrantId: team.id, eventId, individualId, participantId: createEventParticipantId(),
    })).rejects.toThrow(/does not belong/);
    await service.linkIndividualToEntrant({ entrantId: team.id, eventId, individualId, participantId });
    expect(service.catalog.individualLinks![0]?.displayName).toBe('Team Member');
  });

  it('promotes a team member into a shared Individual and mirrors later person edits', async () => {
    const fixture = await createFixture();
    const service: EventCatalogService = fixture.service;
    const eventId = service.catalog.events[0]!.id;
    await service.createEntrant(eventId, 'team');
    const team = getEntrantsForEvent(service.catalog, eventId).find((entrant): boolean => entrant.entrantType === 'team')!;
    const participantId = createEventParticipantId();
    await service.updateEntrant(team.id, {
      memberParticipantIds: [participantId],
      teamMembers: [{ dateOfBirth: '1999-03-04', firstName: 'Team', gender: 'female',
        lastName: 'Member', participantId }],
    });
    await service.createIndividualFromEntrant({ entrantId: team.id, eventId, participantId });
    const profile = service.catalog.officials![0]!;
    expect(profile).toMatchObject({ dateOfBirth: '1999-03-04', displayName: 'Team Member',
      firstName: 'Team', gender: 'female', lastName: 'Member' });
    const callbackCount: number = fixture.onPersistedLedger.mock.calls.length;
    await service.updateOfficialProfile(profile.id, { ...profile, firstName: 'New', lastName: 'Name' });
    expect(getEntrantsForEvent(service.catalog, eventId).find((entrant): boolean => entrant.id === team.id)
      ?.teamMembers?.[0]).toMatchObject({ dateOfBirth: '1999-03-04', firstName: 'New', gender: 'female',
        lastName: 'Name', participantId });
    expect(fixture.onPersistedLedger).toHaveBeenCalledTimes(callbackCount + 1);
  });
});
