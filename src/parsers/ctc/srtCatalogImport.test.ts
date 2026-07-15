import { processAllParticipantLaps } from '../../controllers/laps.js';
import type { EventParticipant } from '../../model/eventparticipant.js';
import { createEventId, createSessionId } from '../../model/ids.js';
import { EVENT_FLAG_DISPLAYED, EVENT_SESSION_START, isPassingValid } from '../../model/timerecord.js';
import { loadDorianCtcSrtCatalog, loadDorianCtcSrtCatalogForSession } from './srtCatalogImport.js';
import { parseCtcTrackConfig } from './trackConfig.js';

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

  it('creates and links placeholder participants for unknown CTC transmitters when configured', async () => {
    const eventId = createEventId('placeholder-event');
    const sessionId = createSessionId('placeholder-session');

    const raceState = await loadDorianCtcSrtCatalogForSession(
      'C:/timing/race-4.erf',
      Buffer.from([
        '040000000010000012340302064000',
        '040000000020000012340401063016',
      ].join('\r')),
      {
        eventDate: '2026-07-14',
        eventId,
        importPlaceholderEntrantsForUnknownTransmitters: true,
        sessionId,
      }
    );

    expect(raceState.categories).toEqual([expect.objectContaining({ name: 'Unknown participants' })]);
    expect(raceState.participants).toEqual([expect.objectContaining({
      firstname: '',
      identifiers: [expect.objectContaining({ txNo: 1234 })],
      surname: '',
    })]);
    expect(raceState.records?.every((record) => 'participantId' in record && record.participantId === raceState.participants?.[0]?.id)).toBe(true);

    const updatedRaceState = await loadDorianCtcSrtCatalogForSession(
      'C:/timing/race-4.erf',
      Buffer.from('040000000010000012340302064000\r'),
      {
        eventDate: '2026-07-14',
        eventId,
        importPlaceholderEntrantsForUnknownTransmitters: true,
        knownTransmitterNumbers: [1234],
        sessionId,
      }
    );

    expect(updatedRaceState.participants).toEqual([]);
    expect(updatedRaceState.records?.[0] && 'participantId' in updatedRaceState.records[0]
      ? updatedRaceState.records[0].participantId
      : undefined).toBeUndefined();
  });

  it('imports configured CTC event codes as semantic flag records with source descriptions', async () => {
    const eventId = createEventId('ctc-event-code-event');
    const sessionId = createSessionId('ctc-event-code-session');
    const trackConfig = parseCtcTrackConfig([
      '40 Green Flag Light',
      '41 Yellow Flag Light',
      '51 Caution Light',
    ].join('\n'));

    const raceState = await loadDorianCtcSrtCatalogForSession(
      'C:/timing/race-5.erf',
      Buffer.from([
        '4000000000100000',
        '4100000000200000',
        '5100000000300000',
        '4000000000400000',
      ].join('\r')),
      {
        eventDate: '2026-07-14',
        eventId,
        sessionId,
        trackConfig,
      }
    );

    expect(raceState.records).toEqual([
      expect.objectContaining({
      description: 'Green Flag Light',
      eventId,
        flagType: 'green',
        flagValue: 'course',
        indicatesRaceStart: true,
        recordType: EVENT_FLAG_DISPLAYED | EVENT_SESSION_START,
      sessionId,
      }),
      expect.objectContaining({
        description: 'Yellow Flag Light',
        eventId,
        flagType: 'yellow',
        flagValue: 'caution',
        recordType: EVENT_FLAG_DISPLAYED,
        sessionId,
      }),
      expect.objectContaining({
        description: 'Caution Light',
        eventId,
        flagType: 'yellow',
        flagValue: 'caution',
        recordType: EVENT_FLAG_DISPLAYED,
        sessionId,
      }),
      expect.objectContaining({
        description: 'Green Flag Light',
        eventId,
        flagType: 'green',
        flagValue: 'course',
        indicatesRaceStart: false,
        recordType: EVENT_FLAG_DISPLAYED,
        sessionId,
      }),
    ]);
    expect(raceState.timeRecordSources).toEqual([expect.objectContaining({ ctcTrackConfig: trackConfig })]);
  });

  it('uses imported Green Flag Light records as the race start for lap calculation', async () => {
    const eventId = createEventId('ctc-green-start-event');
    const sessionId = createSessionId('ctc-green-start-session');
    const trackConfig = parseCtcTrackConfig([
      '#***************** Start/Finish : Track ******* North Network *****#',
      'A     31     1       2               1,1     1,2     1,3     1,4',
      '40 Green Flag Light',
    ].join('\n'));

    const raceState = await loadDorianCtcSrtCatalogForSession(
      'C:/timing/race-6.erf',
      Buffer.from([
        '040000000005000012343101064000',
        '4000000000100000',
        '040000000020000012343101064000',
      ].join('\r')),
      {
        eventDate: '2026-07-14',
        eventId,
        importPlaceholderEntrantsForUnknownTransmitters: true,
        sessionId,
        trackConfig,
      }
    );
    const participant = raceState.participants?.[0] as EventParticipant;
    const participantLaps = processAllParticipantLaps(
      raceState.records || [],
      new Map([[participant.id, participant]]),
      0,
      true,
      'race'
    ).get(participant.id);

    expect(participantLaps?.[0]).toEqual(expect.objectContaining({
      lapNo: undefined,
      time: new Date('2026-07-14T00:00:05.000Z'),
    }));
    expect(isPassingValid(participantLaps?.[0]!)).toBe(false);
    expect(participantLaps?.[1]).toEqual(expect.objectContaining({
      lineNumber: 1,
      lapNo: 1,
      lapTime: 10000,
      loopNumber: 1,
      startingLapRecordId: raceState.records?.find((record) => 'flagType' in record)?.id,
      time: new Date('2026-07-14T00:00:20.000Z'),
    }));
    expect(isPassingValid(participantLaps?.[1]!)).toBe(true);
  });

});
