import { existsSync, readFileSync } from 'node:fs';

import { parseEntrantImportBuffer, parseEntrantImportRows } from './entrantImport.js';

describe('parseEntrantImportRows', () => {
  it('detects category headers alongside entrant matching fields', () => {
    const records = parseEntrantImportRows([
      ['Class', 'Driver Name', 'Transponder Number'],
      ['Premier', 'Alex Driver', '101'],
    ]);

    expect(records).toEqual([{
      category: 'Premier',
      classifiedLaps: undefined,
      entrantName: undefined,
      finishPosition: undefined,
      firstName: 'Alex',
      fullName: 'Alex Driver',
      lastName: 'Driver',
      raceNumber: undefined,
      startOrder: undefined,
      teamName: undefined,
      transponderNumber: '101',
      vehicle: undefined,
    }]);
  });

  it.each([
    'Car Num.',
    'Race Number',
    'Race Plate',
    'Number',
    'No',
    'Race No',
  ])('maps %s to the race number', (raceNumberHeader) => {
    const records = parseEntrantImportRows([
      ['Driver Name', raceNumberHeader],
      ['Alex Driver', '42'],
    ]);

    expect(records).toEqual([
      expect.objectContaining({
        raceNumber: '42',
      }),
    ]);
  });

  it('keeps entrant ownership separate from explicit team entry grouping', () => {
    const records = parseEntrantImportRows([
      ['Driver', 'Entrant', 'Team', 'Car Num.'],
      ['Rick Mears', 'Penske Racing', 'Car 3', '3'],
    ]);

    expect(records[0]).toEqual(expect.objectContaining({
      entrantName: 'Penske Racing',
      raceNumber: '3',
      teamName: 'Car 3',
    }));
  });

  const indyEntrantsPath = 'C:/Users/tim/OneDrive/RaceTime/timing/DORIAN/INDY/entrants.xlsx';
  const maybeIt = existsSync(indyEntrantsPath) ? it : it.skip;
  maybeIt('imports all 33 INDY Entries and preserves the authoritative classification', () => {
    const records = parseEntrantImportBuffer(readFileSync(indyEntrantsPath));
    const classifiedEntries = records.filter((record) => (record.classifiedLaps || 0) > 1);
    const mears = records.find((record) => record.fullName === 'Rick Mears');
    const andretti = records.find((record) => record.fullName === 'Michael Andretti');
    const fittipaldi = records.find((record) => record.fullName === 'Emerson Fittipaldi');

    expect(records).toHaveLength(33);
    expect(classifiedEntries).toHaveLength(32);
    expect(mears).toEqual(expect.objectContaining({ classifiedLaps: 200, entrantName: 'Penske Racing', finishPosition: 1, raceNumber: '3' }));
    expect(andretti).toEqual(expect.objectContaining({ classifiedLaps: 200, finishPosition: 2, raceNumber: '10' }));
    expect(fittipaldi).toEqual(expect.objectContaining({ classifiedLaps: 171, entrantName: 'Penske Racing', finishPosition: 11, raceNumber: '5' }));
  });
});
