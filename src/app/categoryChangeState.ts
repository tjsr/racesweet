import type { EventCategoryId } from '../model/eventcategory.js';
import type { EventParticipantId } from '../model/eventparticipant.js';

export type CategorySelectionUpdateInput = {
  categoryId: EventCategoryId;
  participantId: EventParticipantId;
  recordSelectedCategories: Set<EventCategoryId>;
  recordSelectedParticipants: Set<EventParticipantId>;
  selectedCategories: Set<EventCategoryId>;
};

export type CategorySelectionUpdateResult = {
  recordSelectedCategories: Set<EventCategoryId>;
  recordSelectedParticipants: Set<EventParticipantId>;
  selectedCategories: Set<EventCategoryId>;
};

export const updateCategorySelectionsForChangedParticipant = (
  input: CategorySelectionUpdateInput,
  preserveSelectedParticipants: boolean = false
): CategorySelectionUpdateResult => {
  if (!input.recordSelectedParticipants.has(input.participantId)) {
    return {
      recordSelectedCategories: input.recordSelectedCategories,
      recordSelectedParticipants: input.recordSelectedParticipants,
      selectedCategories: input.selectedCategories,
    };
  }

  const updatedCategorySelection = new Set<EventCategoryId>([input.categoryId]);

  return {
    recordSelectedCategories: new Set<EventCategoryId>(updatedCategorySelection),
    recordSelectedParticipants: preserveSelectedParticipants
      ? input.recordSelectedParticipants
      : new Set<EventParticipantId>(),
    selectedCategories: updatedCategorySelection,
  };
};
