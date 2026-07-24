import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEventId, createSessionId } from '../model/ids.js';
import type { ParticipantPassingRecord } from '../model/timerecord.js';
import { extractDurtFileMakerJson, getBundledDurtFileMakerExtractorPath, getDurtCompanionDatabasePaths, loadDurtFileMakerRaceState, parseFileMakerExtractorOutput } from './durtFileMakerDataSource.js';

const mtBeautyDirectory: string = 'C:/Users/tim/OneDrive/Archived Timing/2013 Mt Beauty 6hr';
const mtBeautyEventPath: string = path.join(mtBeautyDirectory, 'Enduro Event.fmp12');
const mtBeautyRidersPath: string = path.join(mtBeautyDirectory, 'Enduro Riders.fmp12');
const mtBeautyCategoryRangesPath: string = path.join(mtBeautyDirectory, 'Rider Category Nos Ranges.fmp12');
const extractorPath: string = getBundledDurtFileMakerExtractorPath();
const hasMtBeautyFixture: boolean = [extractorPath, mtBeautyEventPath, mtBeautyRidersPath, mtBeautyCategoryRangesPath].every(existsSync);

describe('DURT Mt Beauty FileMaker import', () => {
  const runMtBeautyTest = hasMtBeautyFixture ? it : it.skip;

  runMtBeautyTest('converts all required databases to readable JSON and imports entrants, categories, and crossings', async () => {
    const [eventOutput, ridersOutput, categoryRangesOutput] = await Promise.all([
      extractDurtFileMakerJson(mtBeautyEventPath, extractorPath),
      extractDurtFileMakerJson(mtBeautyRidersPath, extractorPath),
      extractDurtFileMakerJson(mtBeautyCategoryRangesPath, extractorPath),
    ]);
    const eventTables = parseFileMakerExtractorOutput(eventOutput);
    const riderTables = parseFileMakerExtractorOutput(ridersOutput);
    const categoryRangeTables = parseFileMakerExtractorOutput(categoryRangesOutput);

    expect(eventTables[0]?.values.length).toBeGreaterThanOrEqual(160);
    expect(riderTables[0]?.values.length).toBeGreaterThanOrEqual(116);
    expect(categoryRangeTables[0]?.values.length).toBeGreaterThanOrEqual(4);

    const companionPaths = await getDurtCompanionDatabasePaths(mtBeautyEventPath);
    expect(companionPaths).toEqual(expect.arrayContaining([mtBeautyRidersPath, mtBeautyCategoryRangesPath]));

    const raceState = await loadDurtFileMakerRaceState({
      eventId: createEventId('mt-beauty-6-hour'),
      executablePath: extractorPath,
      sessionId: createSessionId('mt-beauty-6-hour-session'),
      sourceFilePath: mtBeautyEventPath,
      timeZone: 'Australia/Sydney',
    });

    expect(raceState.participants?.length).toBeGreaterThanOrEqual(116);
    expect(raceState.categories?.length).toBeGreaterThanOrEqual(4);
    expect(raceState.records?.length).toBeGreaterThanOrEqual(800);
    expect(raceState.teams?.length).toBeGreaterThan(0);
    expect(raceState.teams?.every((team) => team.members.length > 0)).toBe(true);
    const andrewPorter = raceState.participants?.find((participant) => participant.firstname === 'Andrew' && participant.surname === 'Porter');
    const samWatts = raceState.participants?.find((participant) => participant.firstname === 'Sam' && participant.surname === 'Watts');
    expect(andrewPorter?.identifiers).toContainEqual(expect.objectContaining({ racePlate: '26' }));
    expect(samWatts?.identifiers).toContainEqual(expect.objectContaining({ racePlate: '35' }));
    const participantCrossings = (participantId: string | undefined): ParticipantPassingRecord[] => (raceState.records || [])
      .filter((record): record is ParticipantPassingRecord => 'participantId' in record)
      .filter((record) => record.participantId === participantId);
    expect(participantCrossings(andrewPorter?.id)).toHaveLength(7);
    expect(participantCrossings(samWatts?.id)).toHaveLength(6);
  }, 30_000);
});
