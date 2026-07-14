import { loadDorianCtcSrtCatalog } from './srtCatalogImport.js';

describe('Dorian CTC SRT catalog import', () => {
  it('creates one competitor-free session while preserving raw crossing metadata', () => {
    const catalog = loadDorianCtcSrtCatalog(
      'C:/timing/round-1.srt',
      Buffer.from([
        '600881437728440008814377286801 021 19:48:48.6801 00',
        '040881438149697001300108255000002',
        '4008814385499814',
      ].join('\r')),
      '2026-07-14'
    );

    expect(catalog.eventName).toBe('round-1');
    expect(catalog.sessions).toHaveLength(1);
    expect(catalog.sessions[0]).toEqual(expect.objectContaining({
      categoryIds: [],
      eventCode: 'round-1',
      name: 'round-1',
    }));
    expect(catalog.raceState.categories).toEqual([]);
    expect(catalog.raceState.participants).toEqual([]);
    expect(catalog.raceState.records).toEqual([
      expect.objectContaining({
        chipCode: 6008,
        confidenceFactor: undefined,
        dataLine: '600881437728440008814377286801 021 19:48:48.6801 00',
        originRecordNumber: 1,
        time: new Date('2026-07-14T19:48:48.680Z'),
      }),
      expect.objectContaining({
        chipCode: 130,
        confidenceFactor: 255,
        hitCount: 2,
        lineNumber: 1,
        loopNumber: 8,
        originRecordNumber: 2,
        time: new Date('2026-07-14T19:55:49.697Z'),
      }),
    ]);
  });
});
