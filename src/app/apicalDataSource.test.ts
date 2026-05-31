import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchApicalEvents, pullApicalRaceState } from './apicalDataSource.js';
import type { DataSourceConfig } from './systemConfig.js';

const convertDataToRaceState = vi.fn();

vi.mock('../parsers/apical.js', () => ({
  convertDataToRaceState: (...args: unknown[]) => convertDataToRaceState(...args),
}));

const createApicalSource = (): DataSourceConfig => ({
  apiConfig: {
    authHeaderName: 'Authorization',
    authHeaderValue: 'Bearer test-token',
    baseUrl: 'https://apical.example.com',
    companyId: 12,
    httpTimeoutSeconds: 5,
    live: false,
    pollIntervalSeconds: 30,
    selectedEventIds: [301],
  },
  enabled: true,
  id: 'source-apical',
  listedEvents: [],
  name: 'Apical Source',
  type: 'api-apical-data-file',
});

describe('apicalDataSource', () => {
  beforeEach(() => {
    convertDataToRaceState.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('authenticates first and maps returned Apical event list payload', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', {
        headers: {
          'set-cookie': 'session=abc123',
        },
        status: 200,
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        {
          CompanyName: 'Acme Timing',
          EventDate: '2026-08-01',
          Id: 301,
          Name: 'Round 3',
        },
      ]), { status: 200 }));

    const events = await fetchApicalEvents(createApicalSource());

    expect(events).toEqual([
      {
        companyName: 'Acme Timing',
        eventDate: '2026-08-01',
        id: 301,
        name: 'Round 3',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0] || '')).toContain('/raceresult/event/getall');
  });

  it('throws clear error when Apical event list request fails', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401, statusText: 'Unauthorized' }));

    await expect(fetchApicalEvents(createApicalSource())).rejects.toThrow('Failed to fetch Apical events: 401 Unauthorized');
  });

  it('throws clear error when pulling race state without a selected Apical event id', async () => {
    const source = createApicalSource();
    source.apiConfig!.apicalEventId = undefined;
    source.apiConfig!.selectedEventIds = [];

    await expect(pullApicalRaceState(source, 'event-1')).rejects.toThrow('No Apical event id is configured for this source.');
  });

  it('pulls selected Apical event data file and converts to race state', async () => {
    const converted = {
      categories: [{ id: 'cat-1', name: 'Category 1' }],
      participants: [{ entrantId: 'ent-1', id: 'p-1' }],
      records: [{ crossingId: 'x-1' }],
    };
    convertDataToRaceState.mockReturnValue(converted);

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', {
        headers: {
          'set-cookie': 'session=xyz',
        },
        status: 200,
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

    const result = await pullApicalRaceState(createApicalSource(), 'event-2026-round-1');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0] || '')).toContain('/raceresult/event/datafile?eventId=301');
    expect(convertDataToRaceState).toHaveBeenCalledWith('event-2026-round-1', expect.any(Date), [], 200000);
    expect(result).toBe(converted);
  });
});
