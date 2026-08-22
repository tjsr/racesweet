import type { IracingAgentApi } from './iracingAgent.js';
import { createIracingCrossingRecords, type IracingRelayRecord } from '../utils/iracingRelay.js';

export const createIracingAgentApi = (baseUrl: string): IracingAgentApi => {
  let cookie: string | undefined;
  const request = async (path: string, init: RequestInit): Promise<Response> => {
    const endpoint: URL = new URL(path, baseUrl);
    const method: string = init.method || 'GET';
    const headers: Headers = new Headers(init.headers);
    headers.set('content-type', 'application/json');
    if (cookie) {
      headers.set('cookie', cookie);
    }
    const response: Response = await fetch(endpoint, { ...init, headers }).catch((error: unknown): never => {
      const reason: string = error instanceof Error ? error.message : String(error);
      throw new Error(
        `RaceSweet request ${method} ${endpoint.toString()} could not reach the server: ${reason}. `
        + 'Confirm RACESWEET_URL points to a running RaceSweet server.',
      );
    });
    if (!response.ok) {
      throw new Error(
        `RaceSweet request ${method} ${endpoint.toString()} returned HTTP ${response.status} ${response.statusText}. `
        + 'The server is reachable, but this RaceSweet endpoint was not found or does not accept this request. '
        + 'Confirm RACESWEET_URL points to the RaceSweet application root and that any reverse proxy forwards this endpoint.',
      );
    }
    return response;
  };
  return {
    login: async (credentials): Promise<void> => {
      const response: Response = await request('/api/v1/auth/login', {
        body: JSON.stringify(credentials),
        method: 'POST',
      });
      const setCookie: string[] = response.headers.getSetCookie();
      cookie = setCookie[0]?.split(';', 1)[0];
      if (!cookie) {
        throw new Error('RaceSweet login did not return a session cookie.');
      }
    },
    sendRecords: async (sourceId: string, sessionId: string, records: IracingRelayRecord[]): Promise<void> => {
      const crossings = createIracingCrossingRecords(sourceId, records);
      const payload: { crossings: ReturnType<typeof createIracingCrossingRecords>; sessionId: string; sourceId: string } = {
        crossings,
        sessionId,
        sourceId,
      };
      console.log('Sending RaceSweet crossing records:', JSON.stringify(payload));
      await request('/api/v1/timing/crossing', {
        body: JSON.stringify(payload),
        method: 'POST',
      });
    },
  };
};
