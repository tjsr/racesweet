import type { EventCategoryId } from '../model/eventcategory.js';
import type { FlagRecord } from '../model/flag.js';
import { createGreenFlagEvent } from './flag.js';
import { findSessionStart, isStartRecord } from './session.js';

const categoryA = 'category-a' as EventCategoryId;
const categoryB = 'category-b' as EventCategoryId;

describe('session start helpers', () => {
  it('returns undefined when there are no start flags at all', () => {
    expect(findSessionStart([], categoryA)).toBeUndefined();
    expect(findSessionStart([], categoryB)).toBeUndefined();
  });

  it('recognises ordinary green flags as start records for their assigned category', () => {
    const startFlag = createGreenFlagEvent({
      categoryIds: [categoryA],
      flagValue: 'course',
      id: 'flag-start',
      sequence: 1,
      source: 'test',
      time: new Date('2026-05-30T10:00:00.000Z'),
    });

    expect(isStartRecord(startFlag, categoryA)).toBe(true);
    expect(isStartRecord(startFlag, categoryB)).toBe(false);
    expect(findSessionStart([startFlag], categoryA)?.id).toBe(startFlag.id);
    expect(findSessionStart([startFlag], categoryB)).toBeUndefined();
  });

  it.each([undefined, []] as const)('treats an unscoped green flag with categoryIds %s as applying to every category', (categoryIds) => {
    const startFlag = createGreenFlagEvent({
      categoryIds: categoryIds ? [...categoryIds] : undefined,
      flagValue: 'course',
      id: 'flag-session-wide-start',
      sequence: 1,
      source: 'test',
      time: new Date('2026-05-30T10:00:00.000Z'),
    });

    expect(isStartRecord(startFlag, categoryA)).toBe(true);
    expect(isStartRecord(startFlag, categoryB)).toBe(true);
    expect(findSessionStart([startFlag], categoryA)?.id).toBe(startFlag.id);
    expect(findSessionStart([startFlag], categoryB)?.id).toBe(startFlag.id);
  });

  it('ignores deleted green flags when finding a session start', () => {
    const deletedStart = createGreenFlagEvent({
      categoryIds: [categoryA],
      deleted: true,
      flagValue: 'course',
      id: 'flag-deleted',
      sequence: 1,
      source: 'test',
      time: new Date('2026-05-30T10:00:00.000Z'),
    });

    expect(isStartRecord(deletedStart, categoryA)).toBe(false);
    expect(findSessionStart([deletedStart], categoryA)).toBeUndefined();
  });

  it('uses the latest applicable start record for the category without leaking other categories', () => {
    const earlierStart = createGreenFlagEvent({
      categoryIds: [categoryA],
      flagValue: 'course',
      id: 'flag-earlier',
      sequence: 1,
      source: 'test',
      time: new Date('2026-05-30T10:00:00.000Z'),
    });
    const laterOtherCategory = createGreenFlagEvent({
      categoryIds: [categoryB],
      flagValue: 'course',
      id: 'flag-other',
      sequence: 2,
      source: 'test',
      time: new Date('2026-05-30T10:10:00.000Z'),
    });
    const laterCategoryStart = createGreenFlagEvent({
      categoryIds: [categoryA],
      flagValue: 'course',
      id: 'flag-later',
      sequence: 3,
      source: 'test',
      time: new Date('2026-05-30T10:12:00.000Z'),
    });
    const records: FlagRecord[] = [earlierStart, laterOtherCategory, laterCategoryStart];

    expect(findSessionStart(records, categoryA)?.id).toBe(laterCategoryStart.id);
    expect(findSessionStart(records, categoryB)?.id).toBe(laterOtherCategory.id);
  });
});
