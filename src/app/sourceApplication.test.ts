import { describe, expect, it, vi } from 'vitest';

import type { EventCategory } from '../model/eventcategory.js';
import type { EventParticipant } from '../model/eventparticipant.js';
import type { TimeRecord } from '../model/timerecord.js';
import { applyPulledRaceStateToSession, getCategoriesToAdd } from './sourceApplication.js';

const existingCategories: EventCategory[] = [
  {
    code: 'EX',
    id: 'cat-existing',
    name: 'Existing Category',
  },
];

const incomingCategoriesWithDuplicates: EventCategory[] = [
  {
    code: 'EX',
    id: 'cat-existing',
    name: 'Existing Category',
  },
  {
    code: 'NEW',
    id: 'cat-new',
    name: 'New Category',
  },
  {
    code: 'NEW-2',
    id: 'cat-new',
    name: 'New Category Duplicate Payload Row',
  },
];

describe('sourceApplication', () => {
  it('filters out existing categories and deduplicates incoming category IDs', () => {
    const toAdd = getCategoriesToAdd(existingCategories, incomingCategoriesWithDuplicates);

    expect(toAdd).toHaveLength(1);
    expect(toAdd[0]?.id).toBe('cat-new');
  });

  it('applies pulled race state without duplicate category insert attempts', async () => {
    const addCategories = vi.fn(async (_categories: EventCategory[]) => null);
    const addParticipants = vi.fn((_participants: EventParticipant[]) => undefined);
    const addRecords = vi.fn(async (_records: TimeRecord[]) => undefined);

    await applyPulledRaceStateToSession(
      {
        addCategories,
        addParticipants,
        addRecords,
        categories: existingCategories,
      },
      {
        categories: incomingCategoriesWithDuplicates,
        participants: [],
        records: [],
      },
    );

    expect(addCategories).toHaveBeenCalledTimes(1);
    expect(addCategories).toHaveBeenCalledWith([
      {
        code: 'NEW-2',
        id: 'cat-new',
        name: 'New Category Duplicate Payload Row',
      },
    ]);
    expect(addParticipants).toHaveBeenCalledTimes(1);
    expect(addRecords).toHaveBeenCalledTimes(1);
  });

  it('continues participant and record merge when category add collides with existing data', async () => {
    const addCategories = vi.fn(async () => {
      throw new Error('Category cat-new already exists.');
    });
    const addParticipants = vi.fn((_participants: EventParticipant[]) => undefined);
    const addRecords = vi.fn(async (_records: TimeRecord[]) => undefined);

    await expect(
      applyPulledRaceStateToSession(
        {
          addCategories,
          addParticipants,
          addRecords,
          categories: existingCategories,
        },
        {
          categories: incomingCategoriesWithDuplicates,
          participants: [],
          records: [],
        },
      ),
    ).resolves.toBeUndefined();

    expect(addParticipants).toHaveBeenCalledTimes(1);
    expect(addRecords).toHaveBeenCalledTimes(1);
  });
});
