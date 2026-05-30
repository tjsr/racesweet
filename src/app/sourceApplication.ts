import type { EventCategory } from '../model/eventcategory.js';
import type { EventParticipant } from '../model/eventparticipant.js';
import type { RaceState } from '../model/racestate.js';
import type { TimeRecord } from '../model/timerecord.js';

interface SessionSourceSink {
  addCategories(categories: EventCategory[]): Promise<unknown>;
  addParticipants(participants: EventParticipant[]): void;
  addRecords(records: TimeRecord[], validate?: boolean): Promise<void>;
  categories: EventCategory[];
}

const getUniqueCategories = (categories: EventCategory[]): EventCategory[] => {
  const byId = new Map<string, EventCategory>();
  categories.forEach((category) => {
    byId.set(category.id.toString(), category);
  });
  return Array.from(byId.values());
};

export const getCategoriesToAdd = (
  existingCategories: EventCategory[],
  incomingCategories: EventCategory[],
): EventCategory[] => {
  const existingIds = new Set(existingCategories.map((category) => category.id.toString()));
  return getUniqueCategories(incomingCategories).filter((category) => !existingIds.has(category.id.toString()));
};

export const applyPulledRaceStateToSession = async (
  sessionState: SessionSourceSink,
  raceState: Partial<RaceState>,
): Promise<void> => {
  const categoriesToAdd = getCategoriesToAdd(sessionState.categories, raceState.categories || []);
  if (categoriesToAdd.length > 0) {
    try {
      await sessionState.addCategories(categoriesToAdd);
    } catch (error: unknown) {
      const message = (error as Error)?.message || '';
      if (!message.includes('already exists')) {
        throw error;
      }
    }
  }

  sessionState.addParticipants(raceState.participants || []);
  await sessionState.addRecords((raceState.records as TimeRecord[]) || [], false);
};
