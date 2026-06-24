import { validate as validateUuid } from 'uuid';
import { createCategoryId, createEventEntrantId, createEventId, createEventParticipantId, createId, createSessionId, rewriteImportedObjectIds } from './ids.js';

describe('rewriteImportedObjectIds', () => {
  it('rewrites typed id fields and unresolved id fields through a shared deterministic map', () => {
    const imported = {
      categories: [
        {
          id: 'cat-a',
          name: 'Category A',
        },
      ],
      nested: {
        id: 'cat-a',
      },
      participants: [
        {
          categoryId: 'cat-a',
          entrantId: 'team-a',
          id: 'participant-a',
        },
      ],
      records: [
        {
          categoryIds: ['cat-a'],
          id: 'record-a',
          participantId: 'participant-a',
        },
      ],
      teams: [
        {
          categoryId: 'cat-a',
          id: 'team-a',
          memberParticipantIds: ['participant-a'],
        },
      ],
    };

    const { idMap, value } = rewriteImportedObjectIds(imported);
    const expectedCategoryId = createCategoryId('cat-a');
    const expectedEntrantId = createEventEntrantId('team-a');
    const expectedParticipantId = createEventParticipantId('participant-a');

    expect(idMap.get('cat-a')).toBe(expectedCategoryId);
    expect(idMap.get('team-a')).toBe(expectedEntrantId);
    expect(idMap.get('participant-a')).toBe(expectedParticipantId);
    expect(validateUuid(value.categories[0]!.id)).toBe(true);
    expect(value.categories[0]!.id).toBe(expectedCategoryId);
    expect(value.nested.id).toBe(expectedCategoryId);
    expect(value.participants[0]!.categoryId).toBe(expectedCategoryId);
    expect(value.participants[0]!.entrantId).toBe(expectedEntrantId);
    expect(value.participants[0]!.id).toBe(expectedParticipantId);
    expect(value.records[0]!.categoryIds).toEqual([expectedCategoryId]);
    expect(value.records[0]!.participantId).toBe(expectedParticipantId);
    expect(value.teams[0]!.id).toBe(expectedEntrantId);
    expect(value.teams[0]!.memberParticipantIds).toEqual([expectedParticipantId]);
  });

  it('treats active event and session references as eventId and sessionId values', () => {
    const { idMap, value } = rewriteImportedObjectIds({
      activeEventId: 'event-a',
      activeSessionId: 'session-a',
      events: [
        {
          id: 'event-a',
          sessionIds: ['session-a'],
        },
      ],
      sessions: [
        {
          eventId: 'event-a',
          id: 'session-a',
        },
      ],
    });
    const expectedEventId = createEventId('event-a');
    const expectedSessionId = createSessionId('session-a');

    expect(idMap.get('event-a')).toBe(expectedEventId);
    expect(idMap.get('session-a')).toBe(expectedSessionId);
    expect(validateUuid(value.activeEventId)).toBe(true);
    expect(validateUuid(value.activeSessionId)).toBe(true);
    expect(value.activeEventId).toBe(expectedEventId);
    expect(value.activeSessionId).toBe(expectedSessionId);
    expect(value.events[0]!.id).toBe(expectedEventId);
    expect(value.events[0]!.sessionIds).toEqual([expectedSessionId]);
    expect(value.sessions[0]!.eventId).toBe(expectedEventId);
    expect(value.sessions[0]!.id).toBe(expectedSessionId);
  });

  it('preserves existing UUID values', () => {
    const existingCategoryId = createId('categoryId', 'already-valid');
    const { idMap, value } = rewriteImportedObjectIds({
      categories: [
        {
          id: existingCategoryId,
        },
      ],
      selectedCategoryId: existingCategoryId,
    });

    expect(idMap.get(existingCategoryId)).toBe(existingCategoryId);
    expect(value.categories[0]!.id).toBe(existingCategoryId);
    expect(value.selectedCategoryId).toBe(existingCategoryId);
  });
});
