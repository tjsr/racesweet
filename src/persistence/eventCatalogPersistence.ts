import { RendererApiUnavailableError, getRendererApi } from '../app/rendererApi.js';
import { FileWriteFailureError, getFileWriteFailure } from '../app/fileWriteDiagnostics.js';
import {
  type EventCatalogMutation,
  type EventCatalogLedger,
  createDefaultEventCatalogLedger,
} from '../ledger/eventCatalogLedger.js';
import { incrementLoadingMetric } from '../loadingMetrics.js';
import { rewriteImportedObjectIds } from '../model/ids.js';

export interface EventCatalogPersistence {
  load(): Promise<EventCatalogLedger>;
  save(ledger: EventCatalogLedger, mutations?: EventCatalogMutation[]): Promise<void>;
}

interface EventCatalogEventFileReference {
  eventId: string;
  fileName: string;
}

interface EventCatalogTrackMapFileReference {
  eventId: string;
  fileName: string;
}

interface SplitEventCatalogManifest {
  eventFiles: EventCatalogEventFileReference[];
  globalMutations: EventCatalogMutation[];
  mutationOrder: Array<{
    eventId?: string;
    mutationId: string;
  }>;
  schemaVersion: 2;
  trackMapFiles?: EventCatalogTrackMapFileReference[];
}

interface SplitEventCatalogFile {
  eventId: string;
  mutations: EventCatalogMutation[];
  schemaVersion: 1;
}

const isFileNotFoundError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('ENOENT') || message.includes('no such file');
};

const isPermissionDeniedError = (error: unknown): boolean => {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return message.includes('eacces') ||
    message.includes('eperm') ||
    message.includes('access is denied') ||
    message.includes('permission denied');
};

const createPermissionWarning = (filePath: string, action: 'read' | 'write'): string => {
  const verb = action === 'read' ? 'read from' : 'write to';
  return `RaceSweet cannot ${verb} ${filePath} because Windows denied file access. Close any app locking that file/folder and ensure your user account has read/write permission.`;
};

const reportRecoverableError = (
  onError: ((error: unknown) => void) | undefined,
  message: string,
  error: unknown
): void => {
  if (onError) {
    onError(error);
    return;
  }
  console.error(message, error);
};

const reportRecoverableWarning = (
  onError: ((error: unknown) => void) | undefined,
  warning: string
): void => {
  if (onError) {
    onError(warning);
    return;
  }
  console.warn(warning);
};

const normalizeDirectorySeparators = (filePath: string): string => filePath.replace(/\\/g, '/');

const getDirectoryPath = (filePath: string): string => {
  const normalizedPath = normalizeDirectorySeparators(filePath);
  const slashIndex = normalizedPath.lastIndexOf('/');
  return slashIndex < 0 ? '' : filePath.slice(0, slashIndex);
};

const joinPath = (directoryPath: string, fileName: string): string => {
  if (directoryPath.length === 0) {
    return fileName;
  }

  return `${directoryPath.replace(/[\\/]$/u, '')}/${fileName}`;
};

const getEventFileName = (eventId: string): string => `${eventId}.json`;

const getTrackMapFileName = (eventId: string): string => `${eventId}.track-map.json`;

const isDedicatedTrackMapMutation = (mutation: EventCatalogMutation): mutation is Extract<EventCatalogMutation, { type: 'event-updated' }> => {
  return mutation.type === 'event-updated' &&
    Object.keys(mutation.changes).length === 1 &&
    Object.hasOwn(mutation.changes, 'trackMap');
};

const isSplitEventCatalogManifest = (value: Partial<EventCatalogLedger> | Partial<SplitEventCatalogManifest>): value is SplitEventCatalogManifest => {
  return value.schemaVersion === 2 && Array.isArray((value as SplitEventCatalogManifest).eventFiles);
};

const getMutationId = (mutation: EventCatalogMutation): string => mutation.id.toString();

const getMutationEventId = (
  mutation: EventCatalogMutation,
  idsByReference: {
    categoryIds: Map<string, string>;
    entryIds: Map<string, string>;
    entrantIds: Map<string, string>;
    sessionIds: Map<string, string>;
  }
): string | undefined => {
  switch (mutation.type) {
  case 'event-created':
    return mutation.event.id.toString();
  case 'event-updated':
  case 'event-deleted':
  case 'event-activated':
  case 'race-state-imported':
  case 'session-activated':
    return mutation.eventId.toString();
  case 'session-created':
    return mutation.session.eventId.toString();
  case 'session-updated':
  case 'session-deleted':
    return idsByReference.sessionIds.get(mutation.sessionId.toString());
  case 'category-created':
    return mutation.category.eventId.toString();
  case 'category-updated':
  case 'category-deleted':
    return idsByReference.categoryIds.get(mutation.categoryId.toString());
  case 'entrant-created':
    return mutation.entrant.eventId.toString();
  case 'entrant-updated':
  case 'entrant-deleted':
    return idsByReference.entrantIds.get(mutation.entrantId.toString());
  case 'entry-created':
    return mutation.entry.eventId.toString();
  case 'entry-updated':
  case 'entry-deleted':
    return idsByReference.entryIds.get(mutation.entryId.toString());
  default:
    return undefined;
  }
};

const updateMutationReferenceMaps = (
  mutation: EventCatalogMutation,
  eventId: string | undefined,
  idsByReference: {
    categoryIds: Map<string, string>;
    entryIds: Map<string, string>;
    entrantIds: Map<string, string>;
    sessionIds: Map<string, string>;
  }
): void => {
  if (!eventId) {
    return;
  }

  switch (mutation.type) {
  case 'category-created':
    idsByReference.categoryIds.set(mutation.category.id.toString(), eventId);
    break;
  case 'entrant-created':
    idsByReference.entrantIds.set(mutation.entrant.id.toString(), eventId);
    break;
  case 'entry-created':
    idsByReference.entryIds.set(mutation.entry.id.toString(), eventId);
    break;
  case 'session-created':
    idsByReference.sessionIds.set(mutation.session.id.toString(), eventId);
    break;
  default:
    break;
  }
};

const splitLedgerByEvent = (
  ledger: EventCatalogLedger,
  inlineTrackMapMutationIdsByEvent: ReadonlyMap<string, ReadonlySet<string>>,
  persistedTrackMapMutationIdsByEvent: ReadonlyMap<string, ReadonlySet<string>>,
): {
  eventFiles: EventCatalogEventFileReference[];
  eventLedgersById: Map<string, SplitEventCatalogFile>;
  globalMutations: EventCatalogMutation[];
  mutationOrder: SplitEventCatalogManifest['mutationOrder'];
  trackMapFiles: EventCatalogTrackMapFileReference[];
  trackMapLedgersById: Map<string, SplitEventCatalogFile>;
  trackMapMutationIdsByEvent: Map<string, Set<string>>;
} => {
  const idsByReference = {
    categoryIds: new Map<string, string>(),
    entryIds: new Map<string, string>(),
    entrantIds: new Map<string, string>(),
    sessionIds: new Map<string, string>(),
  };
  const eventMutationsById = new Map<string, EventCatalogMutation[]>();
  const globalMutations: EventCatalogMutation[] = [];
  const mutationOrder: SplitEventCatalogManifest['mutationOrder'] = [];
  const trackMapMutationIdsByEvent = new Map(Array.from(persistedTrackMapMutationIdsByEvent.entries()).map(([eventId, mutationIds]) => [
    eventId,
    new Set(mutationIds),
  ]));

  ledger.mutations.forEach((mutation) => {
    const eventId = getMutationEventId(mutation, idsByReference);
    if (eventId) {
      const eventMutations = eventMutationsById.get(eventId) || [];
      eventMutations.push(mutation);
      eventMutationsById.set(eventId, eventMutations);
      mutationOrder.push({
        eventId,
        mutationId: getMutationId(mutation),
      });
    } else {
      globalMutations.push(mutation);
      mutationOrder.push({
        mutationId: getMutationId(mutation),
      });
    }

    updateMutationReferenceMaps(mutation, eventId, idsByReference);
    if (eventId && isDedicatedTrackMapMutation(mutation) && !inlineTrackMapMutationIdsByEvent.get(eventId)?.has(getMutationId(mutation))) {
      const trackMapMutationIds = trackMapMutationIdsByEvent.get(eventId) || new Set<string>();
      trackMapMutationIds.add(getMutationId(mutation));
      trackMapMutationIdsByEvent.set(eventId, trackMapMutationIds);
    }
  });

  const eventFiles = Array.from(eventMutationsById.keys()).map((eventId) => ({
    eventId,
    fileName: getEventFileName(eventId),
  }));
  const eventLedgersById = new Map(Array.from(eventMutationsById.entries()).map(([eventId, mutations]) => [
    eventId,
    {
      eventId,
      mutations: mutations.filter((mutation) => !trackMapMutationIdsByEvent.get(eventId)?.has(getMutationId(mutation))),
      schemaVersion: 1 as const,
    },
  ]));
  const mutationsById = new Map(ledger.mutations.map((mutation) => [getMutationId(mutation), mutation]));
  const trackMapLedgersById = new Map(Array.from(trackMapMutationIdsByEvent.entries()).map(([eventId, mutationIds]) => [
    eventId,
    {
      eventId,
      mutations: Array.from(mutationIds).map((mutationId) => mutationsById.get(mutationId)).filter((mutation): mutation is EventCatalogMutation => mutation !== undefined),
      schemaVersion: 1 as const,
    },
  ]));
  const trackMapFiles = Array.from(trackMapLedgersById.keys()).map((eventId) => ({
    eventId,
    fileName: getTrackMapFileName(eventId),
  }));

  return {
    eventFiles,
    eventLedgersById,
    globalMutations,
    mutationOrder,
    trackMapFiles,
    trackMapLedgersById,
    trackMapMutationIdsByEvent,
  };
};

const mergeSplitLedger = (
  manifest: SplitEventCatalogManifest,
  eventLedgers: SplitEventCatalogFile[]
): EventCatalogLedger => {
  const mutationsById = new Map<string, EventCatalogMutation>();
  (manifest.globalMutations || []).forEach((mutation) => {
    mutationsById.set(getMutationId(mutation), mutation);
  });
  eventLedgers.forEach((eventLedger) => {
    eventLedger.mutations.forEach((mutation) => {
      mutationsById.set(getMutationId(mutation), mutation);
    });
  });

  const mutations = manifest.mutationOrder
    .map((entry) => mutationsById.get(entry.mutationId))
    .filter((mutation): mutation is EventCatalogMutation => mutation !== undefined);

  return {
    mutations,
    schemaVersion: 1,
  };
};

export class ElectronJsonEventCatalogPersistence implements EventCatalogPersistence {
  private readonly eventFileContentById = new Map<string, string>();
  private readonly filePath: string;
  private readonly inlineTrackMapMutationIdsByEvent = new Map<string, Set<string>>();
  private readonly onError: ((error: unknown) => void) | undefined;
  private readonly trackMapFileContentById = new Map<string, string>();
  private readonly trackMapMutationIdsByEvent = new Map<string, Set<string>>();

  public constructor(filePath: string, onError?: (error: unknown) => void) {
    this.filePath = filePath;
    this.onError = onError;
  }

  public async load(): Promise<EventCatalogLedger> {
    try {
      incrementLoadingMetric('Load event catalog persistence', this.filePath);
      const api = getRendererApi(['requestFileContent']);
      const content = await api.requestFileContent<string>(this.filePath, 'utf8');
      const parsed = JSON.parse(content) as Partial<EventCatalogLedger> | Partial<SplitEventCatalogManifest>;
      const mappedParsedData: EventCatalogLedger = isSplitEventCatalogManifest(parsed)
        ? await this.loadSplitLedger(parsed)
        : rewriteImportedObjectIds(parsed).value as EventCatalogLedger;
      const mutations = mappedParsedData.mutations || [];
      mutations.forEach((mutation: EventCatalogMutation) => {
        incrementLoadingMetric('Read event catalog mutation', mutation.type);
      });

      return {
        ...createDefaultEventCatalogLedger(),
        ...mappedParsedData,
        mutations,
        schemaVersion: 1,
      };
    } catch (error: unknown) {
      if (error instanceof RendererApiUnavailableError) {
        throw error;
      }
      if (isFileNotFoundError(error)) {
        console.info(`Event catalog file not found at ${this.filePath}, using defaults.`);
      } else if (isPermissionDeniedError(error)) {
        const warning = createPermissionWarning(this.filePath, 'read');
        reportRecoverableWarning(this.onError, warning);
      } else {
        reportRecoverableError(this.onError, `Failed to load event catalog from ${this.filePath}:`, error);
      }
      return createDefaultEventCatalogLedger();
    }
  }

  private async loadSplitLedger(manifest: SplitEventCatalogManifest): Promise<EventCatalogLedger> {
    const api = getRendererApi(['requestFileContent']);
    const directoryPath = getDirectoryPath(this.filePath);
    const eventLedgers = await Promise.all(manifest.eventFiles.map(async (eventFile) => {
      const eventFilePath = joinPath(directoryPath, eventFile.fileName);
      incrementLoadingMetric('Load event catalog event file', eventFilePath);
      const content = await api.requestFileContent<string>(eventFilePath, 'utf8');
      const parsed = JSON.parse(content) as SplitEventCatalogFile;
      this.eventFileContentById.set(eventFile.eventId, JSON.stringify(parsed, null, 2));
      this.inlineTrackMapMutationIdsByEvent.set(eventFile.eventId, new Set(parsed.mutations
        .filter(isDedicatedTrackMapMutation)
        .map(getMutationId)));
      return parsed;
    }));

    const trackMapLedgers = await Promise.all((manifest.trackMapFiles || []).map(async (trackMapFile) => {
      const trackMapFilePath = joinPath(directoryPath, trackMapFile.fileName);
      incrementLoadingMetric('Load event catalog track-map file', trackMapFilePath);
      const content = await api.requestFileContent<string>(trackMapFilePath, 'utf8');
      const parsed = JSON.parse(content) as SplitEventCatalogFile;
      this.trackMapFileContentById.set(trackMapFile.eventId, JSON.stringify(parsed, null, 2));
      this.trackMapMutationIdsByEvent.set(trackMapFile.eventId, new Set(parsed.mutations.map(getMutationId)));
      return parsed;
    }));

    return mergeSplitLedger(manifest, [...eventLedgers, ...trackMapLedgers]);
  }

  public async save(ledger: EventCatalogLedger): Promise<void> {
    try {
      const api = getRendererApi(['writeFileContent']);
      const directoryPath = getDirectoryPath(this.filePath);
      const splitLedger = splitLedgerByEvent(ledger, this.inlineTrackMapMutationIdsByEvent, this.trackMapMutationIdsByEvent);
      const manifest: SplitEventCatalogManifest = {
        eventFiles: splitLedger.eventFiles,
        globalMutations: splitLedger.globalMutations,
        mutationOrder: splitLedger.mutationOrder,
        schemaVersion: 2,
        ...(splitLedger.trackMapFiles.length > 0 ? { trackMapFiles: splitLedger.trackMapFiles } : {}),
      };

      for (const trackMapFile of splitLedger.trackMapFiles) {
        const trackMapLedger = splitLedger.trackMapLedgersById.get(trackMapFile.eventId);
        const trackMapFileContent = JSON.stringify(trackMapLedger, null, 2);
        if (this.trackMapFileContentById.get(trackMapFile.eventId) === trackMapFileContent) {
          continue;
        }

        const trackMapFilePath = joinPath(directoryPath, trackMapFile.fileName);
        await api.writeFileContent(trackMapFilePath, trackMapFileContent, 'utf8', {
          context: { eventId: trackMapFile.eventId, operation: 'event catalog track-map persistence' },
        });
        this.trackMapFileContentById.set(trackMapFile.eventId, trackMapFileContent);
        this.trackMapMutationIdsByEvent.set(trackMapFile.eventId, new Set(trackMapLedger?.mutations.map(getMutationId)));
      }
      for (const eventFile of splitLedger.eventFiles) {
        const eventLedger = splitLedger.eventLedgersById.get(eventFile.eventId);
        const eventFileContent = JSON.stringify(eventLedger, null, 2);
        if (this.eventFileContentById.get(eventFile.eventId) === eventFileContent) {
          continue;
        }

        const eventFilePath = joinPath(directoryPath, eventFile.fileName);
        try {
          await api.writeFileContent(eventFilePath, eventFileContent, 'utf8', {
            context: {
              eventId: eventFile.eventId,
              operation: 'event catalog event persistence',
            },
          });
          this.eventFileContentById.set(eventFile.eventId, eventFileContent);
        } catch (error: unknown) {
          const fileWriteFailure = getFileWriteFailure(error);
          if (fileWriteFailure) {
            throw new FileWriteFailureError({
              diagnostics: {
                ...fileWriteFailure.diagnostics,
                operation: {
                  ...fileWriteFailure.diagnostics.operation,
                  eventId: eventFile.eventId,
                },
              },
              guidance: fileWriteFailure.guidance,
            }, `Could not save event data for ${eventFile.eventId} to ${eventFilePath}. ${fileWriteFailure.message}`);
          }
          const reason = error instanceof Error ? error.message : String(error);
          throw new Error(`Could not save event data for ${eventFile.eventId} to ${eventFilePath}. ${reason}`);
        }
      }
      await api.writeFileContent(this.filePath, JSON.stringify(manifest, null, 2), 'utf8', {
        context: { operation: 'event catalog manifest persistence' },
      });
    } catch (error: unknown) {
      if (isPermissionDeniedError(error)) {
        const warning = createPermissionWarning(this.filePath, 'write');
        reportRecoverableWarning(this.onError, warning);
      }
      throw error;
    }
  }
}
