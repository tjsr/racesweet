import { describe, expect, it } from 'vitest';
import { buildManualFlagRecord, buildManualPassingRecord } from './manualRecords.js';
import { EVENT_FLAG_DISPLAYED, EVENT_SESSION_END, type EventTimeRecord } from '../model/timerecord.js';

const anchorRecord = {
  eventId: 'event-1',
  id: 'record-1',
  recordType: 0,
  sequence: 4,
  sessionId: 'session-1',
  source: 'import',
  time: new Date('2026-01-01T10:00:00.000Z'),
} as unknown as EventTimeRecord;

describe('manual record processing', () => {
  it('builds the same scoped green-flag record shape outside the view', () => {
    const record = buildManualFlagRecord(
      anchorRecord,
      'event-2' as never,
      'session-2' as never,
      [anchorRecord],
      new Date('2026-01-01T10:05:00.000Z'),
      'green',
      [],
    );

    expect(record).toEqual(expect.objectContaining({
      eventId: 'event-2',
      flagType: 'green',
      indicatesRaceStart: true,
      sequence: 5,
      sessionId: 'session-2',
    }));
  });

  it('builds the same normalized manual passing fields outside the view', () => {
    const record = buildManualPassingRecord(
      anchorRecord,
      undefined,
      undefined,
      [anchorRecord],
      new Date('2026-01-01T10:05:00.000Z'),
      ' 42 ',
      ' 18 ',
      ' 1 ',
      ' 2 ',
    );

    expect(record).toEqual(expect.objectContaining({
      chipCode: 42,
      lineNumber: 1,
      loopNumber: 2,
      plateNumber: '18',
      sequence: 5,
    }));
  });

  it('preserves the chequered session-end record type when editing its timestamp', () => {
    const existingRecord = {
      ...anchorRecord,
      flagType: 'chequered',
      flagValue: 'course',
      recordType: EVENT_FLAG_DISPLAYED | EVENT_SESSION_END,
    } as EventTimeRecord;

    const record = buildManualFlagRecord(
      anchorRecord,
      undefined,
      undefined,
      [existingRecord],
      new Date('2026-01-01T10:05:00.000Z'),
      'chequered',
      [],
      existingRecord,
    );

    expect(record).toEqual(expect.objectContaining({
      id: existingRecord.id,
      recordType: EVENT_FLAG_DISPLAYED | EVENT_SESSION_END,
      time: new Date('2026-01-01T10:05:00.000Z'),
    }));
  });

  it('creates a chequered flag as a session-end record at the supplied time', () => {
    const time = new Date('2026-01-01T10:05:00.000Z');

    const record = buildManualFlagRecord(
      anchorRecord,
      undefined,
      undefined,
      [anchorRecord],
      time,
      'chequered',
      [],
    );

    expect(record).toEqual(expect.objectContaining({
      flagType: 'chequered',
      recordType: EVENT_FLAG_DISPLAYED | EVENT_SESSION_END,
      time,
    }));
  });
});
