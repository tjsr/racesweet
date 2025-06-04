import type { GreenFlagRecord } from '../model/flag.ts';
import { createGreenFlagEvent } from '../controllers/flag.ts';

export const createGreenFlagTestRecords = (): GreenFlagRecord[] => {
  console.log(createGreenFlagTestRecords.name, 'Creating test green flag records');
  const startFlagA = createGreenFlagEvent({
    categoryIds: ['1'],
    time: new Date('2025-03-03T19:02:42+11:00'),
  });
  const startFlagB = createGreenFlagEvent({
    categoryIds: ['2'],
    time: new Date('2025-03-03T19:03:02+11:00'),
  });
  const startFlagC = createGreenFlagEvent({
    categoryIds: ['3'],
    time: new Date('2025-03-03T19:03:22+11:00'),
  });
  return [startFlagA, startFlagB, startFlagC];
};
