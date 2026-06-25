import { applyPulledRaceStateToSession, getCategoriesToAdd } from './sourceApplication.js';

import type { EventCategory } from '../model/eventcategory.js';
import type { EventParticipant } from '../model/eventparticipant.js';
import type { TimeRecord } from '../model/timerecord.js';
import { createCategoryId, createEventId, createEventParticipantId, createTimeRecordId, createTimeRecordSourceId } from '../model/ids.js';

const EXISTING_CATEGORY_ID = createCategoryId('cat-existing');
const NEW_CATEGORY_ID = createCategoryId('cat-new');

const existingCategories: EventCategory[] = [
  {
    code: 'EX',
    id: EXISTING_CATEGORY_ID,
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

const incomingCategoriesWithSeriesDuplicate: EventCategory[] = [
  {
    code: 'EX',
    id: 'cat-existing-v2',
    name: 'Existing Category',
  },
];

describe('sourceApplication', () => {
  it('filters out existing categories and deduplicates incoming category IDs', () => {
    const toAdd = getCategoriesToAdd(existingCategories, incomingCategoriesWithDuplicates);

    expect(toAdd).toHaveLength(1);
    expect(toAdd[0]?.id).toBe('cat-new');
  });

  it('filters out incoming categories that duplicate an existing category series by code and name', () => {
    const toAdd = getCategoriesToAdd(existingCategories, incomingCategoriesWithSeriesDuplicate);
    expect(toAdd).toHaveLength(0);
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
        records: [],
      },
      {
        categories: incomingCategoriesWithDuplicates,
        participants: [],
        records: [],
      }
    );

    expect(addCategories).toHaveBeenCalledTimes(1);
    expect(addCategories).toHaveBeenCalledWith([
      {
        code: 'NEW-2',
        id: NEW_CATEGORY_ID,
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
        records: [],
      },
        {
          categories: incomingCategoriesWithDuplicates,
          participants: [],
          records: [],
        }
      )
    ).resolves.toBeUndefined();

    expect(addParticipants).toHaveBeenCalledTimes(1);
    expect(addRecords).toHaveBeenCalledTimes(1);
  });

  it('does not add a synthetic start flag before pulled records when the target session has no flags', async () => {
    const addCategories = vi.fn(async (_categories: EventCategory[]) => null);
    const addParticipants = vi.fn((_participants: EventParticipant[]) => undefined);
    const addRecords = vi.fn(async (_records: TimeRecord[]) => undefined);
    const crossing = {
      chipCode: 200306,
      eventId: createEventId('event-a'),
      id: 'crossing-1',
      recordType: 2,
      source: 'test-source',
      time: new Date('2026-06-07T00:01:30.000Z'),
    } as TimeRecord;

    await applyPulledRaceStateToSession(
      {
        addCategories,
        addParticipants,
        addRecords,
        categories: existingCategories,
        records: [],
      },
      {
        categories: [],
        eventStartTime: new Date('2026-06-07T00:00:00.000Z'),
        participants: [],
        records: [crossing],
      }
    );

    const records = addRecords.mock.calls[0]?.[0] || [];
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual(expect.objectContaining({
      eventId: createEventId('event-a'),
      id: createTimeRecordId('crossing-1'),
      source: createTimeRecordSourceId('test-source'),
    }));
  });

  it('rejects pulled race state when participant category parents are unknown', async () => {
    const addCategories = vi.fn(async (_categories: EventCategory[]) => null);
    const addParticipants = vi.fn((_participants: EventParticipant[]) => undefined);
    const addRecords = vi.fn(async (_records: TimeRecord[]) => undefined);

    await expect(applyPulledRaceStateToSession(
      {
        addCategories,
        addParticipants,
        addRecords,
        categories: existingCategories,
        records: [],
      },
      {
        categories: [],
        participants: [
          {
            categoryId: 'missing-category',
            currentResult: undefined,
            entrantId: 'participant-a',
            firstname: 'Pat',
            id: 'participant-a',
            identifiers: [],
            lastRecordTime: null,
            resultDuration: null,
            surname: 'Rider',
          },
        ],
        records: [],
      }
    )).rejects.toThrow(/references missing category/);

    expect(addCategories).not.toHaveBeenCalled();
    expect(addParticipants).not.toHaveBeenCalled();
    expect(addRecords).not.toHaveBeenCalled();
  });
});
