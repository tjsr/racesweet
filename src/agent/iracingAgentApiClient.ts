import type { IracingAgentApi } from './iracingAgent.js';
import type { IracingRelayRecord } from '../utils/iracingRelay.js';

export const createIracingAgentApi = (baseUrl: string): IracingAgentApi => {
  let cookie: string | undefined;
  const request = async (path: string, init: RequestInit): Promise<Response> => {
    const headers: Headers = new Headers(init.headers);
    headers.set('content-type', 'application/json');
    if (cookie) {
      headers.set('cookie', cookie);
    }
    const response: Response = await fetch(new URL(path, baseUrl), { ...init, headers });
    if (!response.ok) {
      throw new Error(`RaceSweet request ${path} returned HTTP ${response.status}.`);
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
      await request('/api/v1/timing/iracing', {
        body: JSON.stringify({ records, sessionId, sourceId }),
        method: 'POST',
      });
    },
  };
};
