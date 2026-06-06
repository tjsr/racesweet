import type { EventParticipant } from '../model/eventparticipant.js';
import { selectedCategoriesForParticipants } from './selectionState.js';

const participant = (id: string, categoryId: string): EventParticipant => ({
  categoryId,
  currentResult: undefined,
  entrantId: id,
  firstname: `Rider ${id}`,
  id,
  identifiers: [],
  lastRecordTime: null,
  resultDuration: null,
  surname: `Surname ${id}`,
});

describe('selectedCategoriesForParticipants', () => {
  it('returns the selected participants categories', () => {
    const participants = new Map([
      ['p1', participant('p1', 'cat-a')],
      ['p2', participant('p2', 'cat-b')],
    ]);

    const result = selectedCategoriesForParticipants(new Set(['p1']), (participantId) => participants.get(participantId));

    expect([...result]).toEqual(['cat-a']);
  });

  it('returns every category for multi-selected participants', () => {
    const participants = new Map([
      ['p1', participant('p1', 'cat-a')],
      ['p2', participant('p2', 'cat-b')],
    ]);

    const result = selectedCategoriesForParticipants(new Set(['p1', 'p2']), (participantId) => participants.get(participantId));

    expect([...result].sort()).toEqual(['cat-a', 'cat-b']);
  });

  it('ignores missing participants', () => {
    const result = selectedCategoriesForParticipants(new Set(['missing']), () => undefined);

    expect(result.size).toBe(0);
  });
});
