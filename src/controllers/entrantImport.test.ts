import { parseEntrantImportRows } from './entrantImport.js';

describe('parseEntrantImportRows', () => {
  it('detects category headers alongside entrant matching fields', () => {
    const records = parseEntrantImportRows([
      ['Class', 'Driver Name', 'Transponder Number'],
      ['Premier', 'Alex Driver', '101'],
    ]);

    expect(records).toEqual([{
      category: 'Premier',
      entrantName: undefined,
      firstName: 'Alex',
      fullName: 'Alex Driver',
      lastName: 'Driver',
      raceNumber: undefined,
      startOrder: undefined,
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
});
