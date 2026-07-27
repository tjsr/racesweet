import { describe, expect, it } from 'vitest';
import { createIracingRelayRecords } from './iracingRelay.js';

describe('createIracingRelayRecords', () => {
  it('creates interpolated sector and pit records for every observed car', () => {
    const records = createIracingRelayRecords(
      { cars: [{ customerId: 7, lapDistancePercent: 0.2, lapNumber: 4, onPitRoad: false }], sessionId: 'session', sessionTimeSeconds: 10 },
      { cars: [{ customerId: 7, lapDistancePercent: 0.4, lapNumber: 4, onPitRoad: true }], sessionId: 'session', sessionTimeSeconds: 12 },
      [{ id: 'sector-1', kind: 'sector', lapDistancePercent: 0.3 }],
    );
    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'sector', sessionTimeSeconds: 11 }),
      expect.objectContaining({ kind: 'pit-entry' }),
    ]));
  });
});
