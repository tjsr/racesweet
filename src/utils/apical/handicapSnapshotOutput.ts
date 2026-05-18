import { mkdir, writeFile } from 'fs/promises';

import { ExtendedApicalEventListData } from './apicalEventList.js';
import { HandicapSnapshotEvent } from '../../model/handicapSnapshot.js';
import { dirname } from 'path';

export const mapSnapshotEvents = (events: ExtendedApicalEventListData[]): HandicapSnapshotEvent[] => events.map((event: ExtendedApicalEventListData) => ({
  eventDate: event.EventDate,
  eventId: event.Id,
  name: event.Name,
}));

export const writeHandicapSnapshot = async (filePath: string, jsonContent: string): Promise<void> => {
  const outputDirectory = dirname(filePath);
  if (outputDirectory.length > 0) {
    await mkdir(outputDirectory, { recursive: true });
  }
  await writeFile(filePath, jsonContent, 'utf-8');
};
