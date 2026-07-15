import { createEventId, createSessionId } from '../../model/ids.js';
import { loadDorianCtcSrtCatalog, loadDorianCtcSrtCatalogForSession } from './srtCatalogImport.js';

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

  it('imports ERF records into the supplied event session and reports line progress', async () => {
    const eventId = createEventId('event-under-import');
    const sessionId = createSessionId('session-under-import');
    const progress: Array<{ completed: number; total: number }> = [];

    const raceState = await loadDorianCtcSrtCatalogForSession(
      'C:/timing/race-2.erf',
      Buffer.from([
        '040000000010000012340302064000',
        '040000000020000012340401063016',
      ].join('\r')),
      {
        eventDate: '2026-07-14',
        eventId,
        onProgress: (update) => {
          progress.push({ completed: update.completed, total: update.total });
        },
        sessionId,
      }
    );

    expect(raceState.records).toEqual([
      expect.objectContaining({ chipCode: 1234, eventId, sessionId }),
      expect.objectContaining({ chipCode: 1234, eventId, sessionId }),
    ]);
    expect(raceState.records?.every((record) => !('participantId' in record) || record.participantId === undefined)).toBe(true);
    expect(raceState.timeRecordSources).toEqual([expect.objectContaining({ name: 'race-2.erf' })]);
    expect(progress).toContainEqual({ completed: 0, total: 2 });
    expect(progress).toContainEqual({ completed: 2, total: 2 });
  });

  it('interprets SRT and ERF time-of-day records in the configured event time zone', async () => {
    const eventId = createEventId('time-zone-event');
    const sessionId = createSessionId('time-zone-session');

    const raceState = await loadDorianCtcSrtCatalogForSession(
      'C:/timing/race-3.erf',
      Buffer.from([
        '600881437728440008814377286801 021 19:48:48.6801 00',
        '040881438149697001300108255000002',
      ].join('\r')),
      {
        eventDate: '2026-07-14',
        eventId,
        sessionId,
        timeZone: 'Australia/Perth',
      }
    );

    expect(raceState.records?.[0]).toEqual(expect.objectContaining({
      time: new Date('2026-07-14T11:55:49.697Z'),
      timeTenthOfMillisecond: 0,
    }));
  });
});
