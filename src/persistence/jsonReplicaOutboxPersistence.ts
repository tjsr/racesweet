import { type EventCatalogMutation } from '../ledger/eventCatalogLedger.js';
import { createDefaultReplicaOutboxState, type ReplicaOutboxPersistence, type ReplicaOutboxState } from './replicaOutboxPersistence.js';

interface JsonReplicaOutboxPersistenceOptions {
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, contents: string) => Promise<void>;
}

const isReplicaOutboxState = (value: unknown): value is ReplicaOutboxState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<ReplicaOutboxState>;
  return Array.isArray(candidate.acknowledgedMutationIds) && Array.isArray(candidate.pendingMutations);
};

export class JsonReplicaOutboxPersistence implements ReplicaOutboxPersistence {
  private readonly filePath: string;
  private readonly readFile: (filePath: string) => Promise<string>;
  private readonly writeFile: (filePath: string, contents: string) => Promise<void>;

  public constructor(filePath: string, options: JsonReplicaOutboxPersistenceOptions) {
    this.filePath = filePath;
    this.readFile = options.readFile;
    this.writeFile = options.writeFile;
  }

  public async load(): Promise<ReplicaOutboxState> {
    try {
      const parsed: unknown = JSON.parse(await this.readFile(this.filePath));
      if (!isReplicaOutboxState(parsed)) {
        throw new Error('Replica outbox file has an invalid shape.');
      }
      return {
        acknowledgedMutationIds: [...parsed.acknowledgedMutationIds],
        cursor: parsed.cursor,
        pendingMutations: [...parsed.pendingMutations] as EventCatalogMutation[],
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('ENOENT') || message.includes('not found')) {
        return createDefaultReplicaOutboxState();
      }
      throw error;
    }
  }

  public async save(state: ReplicaOutboxState): Promise<void> {
    await this.writeFile(this.filePath, JSON.stringify(state));
  }
}
