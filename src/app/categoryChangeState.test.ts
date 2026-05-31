import { updateCategorySelectionsForChangedParticipant } from './categoryChangeState.js';

describe('updateCategorySelectionsForChangedParticipant', () => {
  it('updates both selection sets when the changed rider is selected', () => {
    const selectedCategories = new Set(['cat-a']);
    const recordSelectedCategories = new Set(['cat-a', 'cat-b']);
    const recordSelectedParticipants = new Set(['participant-1']);

    const result = updateCategorySelectionsForChangedParticipant({
      categoryId: 'cat-c',
      participantId: 'participant-1',
      recordSelectedCategories,
      recordSelectedParticipants,
      selectedCategories,
    });

    expect([...result.selectedCategories]).toEqual(['cat-c']);
    expect([...result.recordSelectedCategories]).toEqual(['cat-c']);
    expect([...selectedCategories]).toEqual(['cat-a']);
    expect([...recordSelectedCategories]).toEqual(['cat-a', 'cat-b']);
  });

  it('can preserve participant selection when multi-select is enabled', () => {
    const selectedCategories = new Set(['cat-a']);
    const recordSelectedCategories = new Set(['cat-a']);
    const recordSelectedParticipants = new Set(['participant-1', 'participant-2']);

    const result = updateCategorySelectionsForChangedParticipant(
      {
        categoryId: 'cat-c',
        participantId: 'participant-1',
        recordSelectedCategories,
        recordSelectedParticipants,
        selectedCategories,
      },
      true
    );

    expect([...result.selectedCategories]).toEqual(['cat-c']);
    expect([...result.recordSelectedCategories]).toEqual(['cat-c']);
    expect([...result.recordSelectedParticipants].sort()).toEqual(['participant-1', 'participant-2']);
  });

  it('clears selected participants by default after category change', () => {
    const result = updateCategorySelectionsForChangedParticipant({
      categoryId: 'cat-c',
      participantId: 'participant-1',
      recordSelectedCategories: new Set(['cat-a']),
      recordSelectedParticipants: new Set(['participant-1']),
      selectedCategories: new Set(['cat-a']),
    });

    expect(result.recordSelectedParticipants.size).toBe(0);
  });

  it('keeps both selection sets unchanged when the changed rider is not selected', () => {
    const selectedCategories = new Set(['cat-a']);
    const recordSelectedCategories = new Set(['cat-a', 'cat-b']);
    const recordSelectedParticipants = new Set(['participant-2']);

    const result = updateCategorySelectionsForChangedParticipant({
      categoryId: 'cat-c',
      participantId: 'participant-1',
      recordSelectedCategories,
      recordSelectedParticipants,
      selectedCategories,
    });

    expect(result.selectedCategories).toBe(selectedCategories);
    expect(result.recordSelectedCategories).toBe(recordSelectedCategories);
    expect(result.recordSelectedParticipants).toBe(recordSelectedParticipants);
  });
});
