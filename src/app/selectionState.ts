import type { EventCategoryId } from '../model/eventcategory.js';
import type { EventParticipant, EventParticipantId } from '../model/eventparticipant.js';

export const selectedCategoriesForParticipants = (
  participantIds: Set<EventParticipantId>,
  participantLookup: (participantId: EventParticipantId) => EventParticipant | undefined
): Set<EventCategoryId> => {
  const categories = new Set<EventCategoryId>();

  participantIds.forEach((participantId) => {
    const participant = participantLookup(participantId);
    if (participant?.categoryId) {
      categories.add(participant.categoryId);
    }
  });

  return categories;
};