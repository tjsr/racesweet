import type { EventCategory, EventCategoryId, PlaceholderCategory } from '../model/eventcategory.ts';
import type { EventId, IdType } from "../model/types.ts";
import type { ParticipantPassingRecord, PassingRecordId, TimeRecord } from '../model/timerecord.ts';
import { elapsedTimeMilliseconds, getElapsedTimeStart, millisecondsToTime } from '../app/utils/timeutils.ts';
import type { FlagRecord } from '../model/flag.ts';
import { type PathLike } from "fs";
import fs from 'fs/promises';
import { v5 as uuidv5 } from 'uuid';

type CategoryId = IdType;

const categories: Partial<EventCategory>[] = [
  { id: 'cat1', name: 'Test category' },
  { id: 'cat2', name: 'Another category' },
];

class CategoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CategoryError";
  }
}

class CategoryCreateError extends CategoryError {
  constructor(message: string) {
    super(message);
    this.name = "CategoryCreateError";
  }
}

export const findCategoryById = (categories: EventCategory[], categoryId: CategoryId): EventCategory | null =>
  categories.find((cat) => cat.id === categoryId) || null;

export const findCategoryByName = (categories: EventCategory[], categoryName: string): EventCategory | null =>
  categories.find((cat) => cat.name === categoryName) || null;

export const createCategory = (values: Partial<EventCategory>): Partial<EventCategory> => {
  if (!values.name) {
    throw new CategoryCreateError("Category name is required");
  }
  if (values.id) {
    throw new CategoryCreateError("Category ID should not be provided when creating category.");
  }
  const categoryId = `category-${values.name}`;
  const createdCategory: Partial<EventCategory> = {
    id: categoryId,
    ...values,
  };
  return createdCategory;
};

export const getCategoryId = (categories: EventCategory[], categoryName: string): CategoryId | null => 
  findCategoryByName(categories, categoryName)?.id || null;

export const findOrCreateCategory  = (
  categories: EventCategory[],
  data: Partial<EventCategory>
): EventCategory => {
  const existingCategory = categories.find((cat) => cat.name === data.name);
  if (existingCategory) {
    return existingCategory;
  }

  const newCategory: EventCategory = createCategory(data) as EventCategory;
  if (!newCategory) {
    throw new CategoryCreateError("Failed to create category");
  }

  categories.push(newCategory);
  return newCategory;
};

export const getCategoryList = (): EventCategory[] => {
  return categories as EventCategory[];
};

export const loadCategoriesFromJsonFile = async (path: PathLike): Promise<EventCategory[]> =>
  fs.readFile(path, 'utf8').then(cats => JSON.parse(cats) as EventCategory[]);

export const calculateCategoryElapsedTime = (
  lap: TimeRecord,
  eventFlagEvents: FlagRecord[],
  categoryId: EventCategoryId
  // categoryList: Map<EventCategoryId, EventCategory>
): number | undefined => {
  if (lap.time === undefined) {
    console.debug(`Tried to calculate elapsed time for @${lap.id} with no event time`);
    return undefined;
  }

  const startTime: Date | undefined = getElapsedTimeStart(eventFlagEvents, categoryId);
  if (!startTime) {
    return;
  }

  const elapsed: number = elapsedTimeMilliseconds(startTime, lap.time);
  return elapsed;
};

export const getElapsedTimeForCategory = (cat: EventCategory, time: Date): string | undefined => {
  if (cat.startTime === undefined) {
    return undefined;
  }
  const duration = elapsedTimeMilliseconds(new Date(cat.startTime), time);
  const formattedTime = millisecondsToTime(duration);
  return formattedTime;
};

export const isPlaceholderCatgegory = (
  category: EventCategory
): category is PlaceholderCategory => (category as PlaceholderCategory).isPlaceholder === true;

// const addParticipantCrossings = (
//   allPassingRecords: ParticipantPassingRecord[],
//   participantTimes: Map<EventParticipantId, ParticipantPassingRecord[]>
// ): void => {
//   allPassingRecords.forEach((passingRecord) => {
//     if (passingRecord.participantId === undefined) {
//       return;
//     }
//     // if (isFlagEvent(passingRecord)) {
//     //   // Should not get here if record does not have a participantId, but checking for safety.
//     //   console.warn('Flag event found with participantId, but not a crossing event:', passingRecord);
//     //   return;
//     // }
//     if (passingRecord.time === undefined) {
//       console.error(`Crossing for ${getTimeRecordIdentifier(passingRecord)} has no time`);
//       return;
//     }
//     if (passingRecord.time.getTime() < eventStartTime.getTime()) {
//       console.error(`Crossing for ${getTimeRecordIdentifier(passingRecord)} is before event start time`);
//       return;
//     }
//     if (passingRecord.time.getTime() > eventEndTime.getTime()) {
//       console.error(`Crossing for ${getTimeRecordIdentifier(passingRecord)} is after event end time`);
//       return;
//     }
//     addCachedParticipantLap(participantTimes, passingRecord);
//   });
// };
export const setCategoryStartForPassings = (
  id: PassingRecordId | undefined,
  passings: ParticipantPassingRecord[]
): void => {
  passings.forEach((passing) => {
    passing.participantStartRecordId = id;
  });
};

export const categoryTextString = (
  selectedCategories: EventCategoryId[],
  categories: EventCategory[]
): string => {
  if ((selectedCategories?.length || 0) === 0) {
    return 'All categories';
  }
  return selectedCategories.map((catId: EventCategoryId) => {
    const category = categories.find(
      (search: EventCategory) => search.id?.toString() === catId.toString()
    );
    if (category) {
      return category.name;
    } else {
      console.trace(`Category with ID ${catId} not found in categories list.`);
    }
    return `&${catId}`;
  }).join(', ');
};

export const createEventCategoryIdFromCategoryCode = (eventId: EventId, categoryCode: string): EventCategoryId => {
  if (!categoryCode) {
    throw new Error("Category code must not be empty.");
  }
  return uuidv5(categoryCode, eventId);
};

