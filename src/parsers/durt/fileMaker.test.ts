import { describe, expect, it } from 'vitest';
import { createEventId, createSessionId } from '../../model/ids.js';
import { type FileMakerTable, convertDurtFileMakerTablesToRaceState } from './fileMaker.js';

describe('convertDurtFileMakerTablesToRaceState', () => {
  it('converts DURT entrants and crossings into deterministic RaceSweet records', () => {
    const tables: FileMakerTable[] = [
      {
        columns: [{ name: 'TX No' }, { name: 'First Name' }, { name: 'Last Name' }, { name: 'Category' }, { name: 'Rider Number' }],
        name: 'Enduro Riders',
        values: [{ Category: 'A Grade', 'First Name': 'Rohin', 'Last Name': 'Adams', 'Rider Number': '189', 'TX No': '1169' }],
      },
      {
        columns: [{ name: 'TX No' }, { name: 'Crossing Date' }, { name: 'Crossing Time' }, { name: 'Line No' }],
        name: 'Crossings',
        values: [{ 'Crossing Date': '27/4/2013', 'Crossing Time': '10:24:54', 'Line No': '1', 'TX No': '1169' }],
      },
    ];
    const eventId = createEventId('durt-event');
    const sessionId = createSessionId('durt-session');
    const imported = convertDurtFileMakerTablesToRaceState(tables, { eventId, sessionId, sourceFilePath: 'C:/DURT/Enduro Event.fmp12', timeZone: 'Australia/Sydney' });

    expect(imported.categories).toMatchObject([{ code: 'A Grade', name: 'A Grade' }]);
    expect(imported.participants).toMatchObject([{ firstname: 'Rohin', identifiers: [{ racePlate: '189' }, { txNo: 1169 }], surname: 'Adams' }]);
    expect(imported.records).toMatchObject([{ chipCode: 1169, lineNumber: 1, participantId: imported.participants?.[0]?.id, sessionId }]);
    expect(imported.records?.[0]?.time?.toISOString()).toBe('2013-04-27T00:24:54.000Z');
  });

  it('keeps unknown transmitter crossings without inventing a participant', () => {
    const imported = convertDurtFileMakerTablesToRaceState([{ columns: [{ name: 'TX' }, { name: 'Date' }, { name: 'Time' }], name: 'Crossings', values: [{ Date: '01/01/2026', TX: '999', Time: '09:00:00' }] }], {
      eventId: createEventId('durt-event'), sessionId: createSessionId('durt-session'), sourceFilePath: 'C:/DURT/Enduro Event.fp7', timeZone: 'UTC',
    });
    expect(imported.participants).toEqual([]);
    expect(imported.records).toMatchObject([{ chipCode: 999, participantId: undefined }]);
  });
});
