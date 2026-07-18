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
});
