import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { getEntrantsForEvent, getEntriesForEvent } from '../catalog/eventCatalog.js';
import { createSeedEventCatalogLedger } from '../ledger/createSeedEventCatalogLedger.js';
import type { EventCatalogLedger } from '../ledger/eventCatalogLedger.js';
import type { OfficialAssignmentInput, OfficialProfileInput } from '../model/official.js';
import { createEventParticipantId } from '../model/ids.js';
import type { EventCatalogPersistence } from '../persistence/eventCatalogPersistence.js';
import { NodeJsonEventCatalogPersistence } from '../persistence/nodePersistence.js';
import { getOfficialContactRows } from '../processing/officialContacts.js';
import { EventCatalogService } from './eventCatalogService.js';

const profileInput: OfficialProfileInput = {
  availability: [{ endAt: '2026-06-12T12:00:00.000Z', startAt: '2026-06-12T08:00:00.000Z', status: 'available' }],
  displayName: 'Alex Marshal', email: 'alex@example.org', notes: 'Private contact note',
  phone: '+61 400 000 000', position: 'Chief marshal', responsibilities: ['Pit lane'],
};

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
  it('reopens official profiles and assignments from JSON persistence', async () => {
    const directory: string = await mkdtemp(path.join(os.tmpdir(), 'racesweet-officials-'));
    try {
      const persistence = new NodeJsonEventCatalogPersistence(path.join(directory, 'event-catalog.json'));
      const service: EventCatalogService = await EventCatalogService.create(persistence);
      const eventId = service.catalog.events[0]!.id;
      await service.createOfficialProfile(profileInput);
      const officialId: string = service.catalog.officials![0]!.id;
      await service.createOfficialAssignment({ eventId, notes: '', officialId, role: 'Marshal' });
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
    await service.updateOfficialProfile(officialId, { ...profileInput, position: 'Senior marshal' });
    const assignment: OfficialAssignmentInput = {
      eventId: event.id, notes: 'Gate A', officialId, role: 'Start marshal', sessionId: session.id,
    };
    await service.createOfficialAssignment(assignment);
    const assignmentId: string = service.catalog.officialAssignments![0]!.id;
    await service.updateOfficialAssignment(assignmentId, { ...assignment, role: 'Finish marshal' });
    await service.archiveOfficialProfile(officialId);
    expect(service.catalog.officials![0]?.archived).toBe(true);
    await expect(service.createOfficialAssignment({ ...assignment, role: 'Extra' })).rejects.toThrow(/Archived/);
    expect(getOfficialContactRows(service.catalog, { eventId: event.id, includeArchived: true, sessionId: session.id }))
      .toMatchObject([{ displayName: 'Alex Marshal', role: 'Finish marshal', archived: true }]);
    await service.archiveOfficialProfile(officialId, false);
    await service.removeOfficialAssignment(assignmentId);
    expect(service.catalog.officialAssignments![0]?.removed).toBe(true);
    expect(fixture.getSaved().mutations.slice(mutationCountBefore).map((mutation) => mutation.type)).toEqual([
      'official-profile-created', 'official-profile-updated', 'official-assignment-created',
      'official-assignment-updated', 'official-profile-archived', 'official-profile-archived',
      'official-assignment-removed',
    ]);
    expect(fixture.onPersistedLedger).toHaveBeenCalledTimes(7);
    expect(getEntrantsForEvent(service.catalog, event.id)).toHaveLength(entrantsBefore);
    expect(getEntriesForEvent(service.catalog, event.id)).toHaveLength(entriesBefore);
    expect(JSON.stringify(service.getImportedRaceState(event.id, session.id))).toBe(raceBefore);
    const reloaded: EventCatalogService = await EventCatalogService.create(fixture.persistence);
    expect(reloaded.catalog.officials![0]?.position).toBe('Senior marshal');
    expect(reloaded.catalog.officialAssignments![0]?.removed).toBe(true);
  });

  it('rejects malformed profiles, duplicate roles, and cross-event sessions', async () => {
    const { service } = await createFixture();
    await expect(service.createOfficialProfile({ ...profileInput, email: 'bad' })).rejects.toThrow(/email/);
    await expect(service.createOfficialProfile({ ...profileInput, availability: [
      { endAt: '2026-06-12T08:00:00.000Z', startAt: '2026-06-12T12:00:00.000Z', status: 'available' },
    ] })).rejects.toThrow(/availability/);
    await service.createOfficialProfile(profileInput);
    const officialId: string = service.catalog.officials![0]!.id;
    const event = service.catalog.events[0]!;
    const otherSession = service.catalog.sessions.find((candidate): boolean => candidate.eventId !== event.id);
    if (otherSession) {
      await expect(service.createOfficialAssignment({
        eventId: event.id, notes: '', officialId, role: 'Marshal', sessionId: otherSession.id,
      })).rejects.toThrow(/does not belong/);
    }
    const input: OfficialAssignmentInput = { eventId: event.id, notes: '', officialId, role: 'Marshal' };
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
    await service.createOfficialAssignment({ eventId: firstEvent.id, notes: '', officialId, role: 'Event coordinator' });
    await service.createOfficialAssignment({
      eventId: firstEvent.id, notes: '', officialId, role: 'Start marshal', sessionId: sessions[0]!.id,
    });
    await service.createOfficialAssignment({
      eventId: secondEvent.id, notes: '', officialId, role: 'Chief marshal',
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
    await service.createOfficialAssignment({ eventId: dutyEvent.id, notes: '', officialId: individualId, role: 'Starter' });
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
    expect(fixture.getSaved().mutations.slice(-3).map((mutation) => mutation.type)).toEqual([
      'individual-linked', 'official-assignment-created', 'individual-unlinked',
    ]);
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
});
