import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEventId, createSessionId } from '../model/ids.js';
import { Session } from '../model/racestate.js';
import { getBundledDurtFileMakerExtractorPath, loadDurtFileMakerRaceState } from './durtFileMakerDataSource.js';

const interWinterDirectory: string = 'C:/Users/tim/OneDrive/Archived Timing/2013 InterWinter Round 3';
const interWinterDatabasePath: string = path.join(interWinterDirectory, 'race event - with sectors.fmp12');
const interWinterReferencePdfPath: string = path.join(interWinterDirectory, '2013iw-sectors.pdf');
const extractorPath: string = getBundledDurtFileMakerExtractorPath();
const hasInterWinterFixture: boolean = [extractorPath, interWinterDatabasePath, interWinterReferencePdfPath].every(existsSync);

describe('DURT InterWinter FileMaker import', () => {
  const runInterWinterTest = hasInterWinterFixture ? it : it.skip;

  runInterWinterTest('imports the event data and reproduces the published A Grade leading durations', async () => {
    const raceState = await loadDurtFileMakerRaceState({
      eventId: createEventId('interwinter-round-3'),
      executablePath: extractorPath,
      sessionId: createSessionId('interwinter-round-3-session'),
      sourceFilePath: interWinterDatabasePath,
      timeZone: 'Australia/Sydney',
    });
    const session = new Session({
      categories: raceState.categories || [],
      participants: raceState.participants || [],
      records: raceState.records || [],
      teams: [],
    });
    const durationFor = (firstName: string, surname: string): number | undefined => {
      const participant = raceState.participants?.find((candidate) => candidate.firstname === firstName && candidate.surname === surname);
      return participant ? session.getParticipantLaps(participant.id)?.at(-1)?.elapsedTime || undefined : undefined;
    };

    expect(raceState.categories?.map((category) => category.name).sort()).toEqual(['A Grade', 'B Grade', 'C Grade', 'Women']);
    expect(raceState.participants).toHaveLength(198);
    expect(durationFor('Russell', 'Nankervis')).toBe(10_902_000);
    expect(durationFor('Tasman', 'Nankervis')).toBe(11_092_000);
    expect(durationFor('Steven', 'Cusworth')).toBe(11_737_000);
  }, 30_000);
});
