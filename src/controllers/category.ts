import type { EventCategory } from "../model/eventcategory.ts";
import type { IdType } from "../model/types.ts";
import { type PathLike } from "fs";
import fs from 'fs';

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

export const loadCategoriesFromFile = (path: PathLike): EventCategory[] => {
  const loadedCategoriesFile = fs.readFileSync(path, 'utf8');
  const loadedCategories = JSON.parse(loadedCategoriesFile) as EventCategory[];
  return loadedCategories;
};export class CategoryNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CategoryNotFoundError";
  }
}

