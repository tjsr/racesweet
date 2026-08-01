import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  type EventCatalogLedger,
  type EventCatalogMutation,
  createDefaultEventCatalogLedger,
} from '../ledger/eventCatalogLedger.js';
import {
  type AdministrativeChanges,
  type RaceAdminPersistence,
  createDefaultAdministrativeChanges,
  reviveAdministrativeChanges,
} from './raceAdminPersistence.js';
import {
  type SystemConfigPersistence,
} from './systemConfigPersistence.js';
import {
  type SystemConfiguration,
  createDefaultSystemConfiguration,
  normalizeSystemConfiguration,
} from '../app/systemConfig.js';
import type { EventCatalogPersistence } from './eventCatalogPersistence.js';

interface SplitCatalogManifest {
  eventFiles: Array<{ eventId: string; fileName: string }>;
  globalMutations: EventCatalogMutation[];
  mutationOrder: Array<{ eventId?: string; mutationId: string }>;
  schemaVersion: 2;
  trackMapFiles?: Array<{ eventId: string; fileName: string }>;
}

interface SplitCatalogFile {
  eventId: string;
  mutations: EventCatalogMutation[];
  schemaVersion: 1;
}

const readJson = async <TValue>(filePath: string, fallback: TValue): Promise<TValue> => {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as TValue;
  } catch (error: unknown) {
    const nodeError: NodeJS.ErrnoException = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
};

const writeJsonAtomically = async <TValue>(filePath: string, value: TValue): Promise<void> => {
  const directoryPath: string = path.dirname(filePath);
  const temporaryPath: string = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(directoryPath, { recursive: true });
  await writeFile(temporaryPath, JSON.stringify(value, null, 2), 'utf8');
  await rename(temporaryPath, filePath);
};

const isSplitManifest = (
  value: EventCatalogLedger | SplitCatalogManifest,
): value is SplitCatalogManifest => value.schemaVersion === 2 && 'eventFiles' in value;

export class NodeJsonEventCatalogPersistence implements EventCatalogPersistence {
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  public load = async (): Promise<EventCatalogLedger> => {
    const value: EventCatalogLedger | SplitCatalogManifest = await readJson<
      EventCatalogLedger | SplitCatalogManifest
    >(this.filePath, createDefaultEventCatalogLedger());
    if (!isSplitManifest(value)) {
      return value;
    }

    const references: Array<{ eventId: string; fileName: string }> = [
      ...value.eventFiles,
      ...(value.trackMapFiles || []),
    ];
    const files: SplitCatalogFile[] = await Promise.all(
      references.map(
        (reference: { eventId: string; fileName: string }): Promise<SplitCatalogFile> =>
          readJson<SplitCatalogFile>(
            path.resolve(path.dirname(this.filePath), reference.fileName),
            { eventId: reference.eventId, mutations: [], schemaVersion: 1 },
          ),
      ),
    );
    const mutationsById: Map<string, EventCatalogMutation> = new Map<string, EventCatalogMutation>();
    value.globalMutations.forEach((mutation: EventCatalogMutation): void => {
      mutationsById.set(mutation.id.toString(), mutation);
    });
    files.forEach((file: SplitCatalogFile): void => {
      file.mutations.forEach((mutation: EventCatalogMutation): void => {
        mutationsById.set(mutation.id.toString(), mutation);
      });
    });
    return {
      mutations: value.mutationOrder
        .map((item: { eventId?: string; mutationId: string }): EventCatalogMutation | undefined =>
          mutationsById.get(item.mutationId),
        )
        .filter((mutation: EventCatalogMutation | undefined): mutation is EventCatalogMutation =>
          mutation !== undefined,
        ),
      schemaVersion: 1,
    };
  };

  public save = async (ledger: EventCatalogLedger): Promise<void> => {
    await writeJsonAtomically(this.filePath, ledger);
  };
}

export class NodeJsonRaceAdminPersistence implements RaceAdminPersistence {
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  public load = (): Promise<AdministrativeChanges> =>
    readJson<Partial<AdministrativeChanges>>(this.filePath, createDefaultAdministrativeChanges())
      .then(reviveAdministrativeChanges);

  public save = (changes: AdministrativeChanges): Promise<void> =>
    writeJsonAtomically(this.filePath, changes);
}

export class NodeJsonSystemConfigPersistence implements SystemConfigPersistence {
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  public load = async (): Promise<SystemConfiguration> =>
    normalizeSystemConfiguration(
      await readJson(this.filePath, createDefaultSystemConfiguration()),
    );

  public save = (config: SystemConfiguration): Promise<void> =>
    writeJsonAtomically(this.filePath, normalizeSystemConfiguration(config));
}
