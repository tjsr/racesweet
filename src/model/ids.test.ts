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

  it('adds rewritten child IDs to their parent event component lists', () => {
    const { value } = rewriteImportedObjectIds({
      mutations: [
        {
          event: {
            categoryIds: [],
            entrantIds: [],
            id: 'event-a',
            sessionIds: [],
          },
          id: 'mutation-event',
          type: 'event-created',
        },
        {
          category: {
            eventId: 'event-a',
            id: 'cat-a',
            name: 'Category A',
          },
          id: 'mutation-category',
          type: 'category-created',
        },
        {
          entrant: {
            eventId: 'event-a',
            id: 'entrant-a',
            name: 'Entrant A',
          },
          id: 'mutation-entrant',
          type: 'entrant-created',
        },
        {
          id: 'mutation-session',
          session: {
            eventId: 'event-a',
            id: 'session-a',
            name: 'Session A',
          },
          type: 'session-created',
        },
      ],
    });

    const event = value.mutations[0]!.event!;
    const category = value.mutations[1]!.category!;
    const entrant = value.mutations[2]!.entrant!;
    const session = value.mutations[3]!.session!;

    expect(event.id).toBe(createEventId('event-a'));
    expect(category.id).toBe(createCategoryId('cat-a'));
    expect(category.eventId).toBe(event.id);
    expect(entrant.id).toBe(createEventEntrantId('entrant-a'));
    expect(entrant.eventId).toBe(event.id);
    expect(session.id).toBe(createSessionId('session-a'));
    expect(session.eventId).toBe(event.id);
    expect(event.categoryIds).toEqual([category.id]);
    expect(event.entrantIds).toEqual([entrant.id]);
    expect(event.sessionIds).toEqual([session.id]);
  });

  it('does not duplicate rewritten child IDs that are already listed on the parent event', () => {
    const { value } = rewriteImportedObjectIds({
      events: [
        {
          categoryIds: ['cat-a'],
          entrantIds: [],
          id: 'event-a',
          sessionIds: [],
        },
      ],
      categories: [
        {
          eventId: 'event-a',
          id: 'cat-a',
        },
      ],
    });

    expect(value.events[0]!.categoryIds).toEqual([createCategoryId('cat-a')]);
  });
});
