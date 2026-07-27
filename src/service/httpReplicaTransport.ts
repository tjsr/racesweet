import type { EventCatalogMutation } from '../ledger/eventCatalogLedger.js';
import type { ReplicaTransport } from './replicaSyncService.js';

interface ReplicaPullResponse {
  cursor?: string;
  mutations: EventCatalogMutation[];
}

interface ReplicaPushResponse {
  acknowledgedMutationIds: string[];
  cursor?: string;
}

export class HttpReplicaTransport implements ReplicaTransport {
  private readonly baseUrl: string;

  public constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  public async pull(cursor: string | undefined): Promise<ReplicaPullResponse> {
    const url = new URL(`${this.baseUrl}/api/v1/mutations`);
    if (cursor) {
      url.searchParams.set('cursor', cursor);
    }
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`RaceSweet remote server returned ${response.status} while pulling mutations.`);
    }
    return response.json() as Promise<ReplicaPullResponse>;
  }

  public async push(mutations: EventCatalogMutation[]): Promise<ReplicaPushResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/mutations`, {
      body: JSON.stringify({ mutations }),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    });
    if (!response.ok) {
      throw new Error(`RaceSweet remote server returned ${response.status} while pushing mutations.`);
    }
    return response.json() as Promise<ReplicaPushResponse>;
  }
}
