import { type EventCategory, NoUnknownEntrantCategoryError } from '../model/eventcategory.ts';

export const validateCategoriesToCreate = (
  categories: EventCategory[] | undefined,
  createUnknownEntrants: boolean
): void => {
  const len = categories?.length || 0;
  if (createUnknownEntrants && !len) {
    throw new NoUnknownEntrantCategoryError('No categories available to create unknown entrants');
  }
};
