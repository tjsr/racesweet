import React from 'react';
import type { EventCatalogState } from '../catalog/eventCatalog.js';
import type { ManualCrossingCommand } from '../model/manualCrossing.js';
import type { ManualTimingOutboxConnection } from '../model/manualCrossingOutbox.js';
import { IndexedDbManualCrossingOutboxPersistence } from '../persistence/indexedDbManualCrossingOutboxPersistence.js';
import { JsonManualCrossingOutboxPersistence } from '../persistence/jsonManualCrossingOutboxPersistence.js';
import type { ManualCrossingOutboxPersistence } from '../persistence/manualCrossingOutboxPersistence.js';
import type { EventCatalogService } from '../service/eventCatalogService.js';
import type { ManualCrossingOutboxService } from '../service/manualCrossingOutboxService.js';
import { createManualTimingOutbox } from '../service/manualTimingRuntime.js';

interface ManualTimingOutboxOptions {
  onCatalog: (catalog: EventCatalogState, command: ManualCrossingCommand) => void;
  serverUrl?: string;
  service?: EventCatalogService;
  storageDirectory: string;
}

/** Recovers and retries pending delivery while any application section is open. */
export const useManualTimingOutbox = (props: ManualTimingOutboxOptions): ManualTimingOutboxConnection => {
  const [outbox, setOutbox] = React.useState<ManualCrossingOutboxService | undefined>(undefined);
  const [error, setError] = React.useState<string>('');
  const onCatalogRef: React.RefObject<ManualTimingOutboxOptions['onCatalog']> = React.useRef(props.onCatalog);
  onCatalogRef.current = props.onCatalog;
  React.useEffect((): (() => void) => {
    let disposed: boolean = false;
    setError(''); setOutbox(undefined);
    const service: EventCatalogService | undefined = props.service;
    if (!service) return (): void => undefined;
    let ready: ManualCrossingOutboxService | undefined;
    const retry = (): void => { ready?.retry(false).catch((failure: Error): void => { if (!disposed) setError(failure.message); }); };
    const timer: ReturnType<typeof setInterval> = setInterval(retry, 5_000);
    window.addEventListener('online', retry);
    Promise.resolve().then(async (): Promise<void> => {
      const persistence: ManualCrossingOutboxPersistence = window.api?.persistenceMode === 'native'
        ? new JsonManualCrossingOutboxPersistence(`${props.storageDirectory.replace(/[\\/]$/u, '')}/manual-crossing-outbox.json`,
          (path: string): Promise<string> => window.api.requestFileContent<string>(path, 'utf8'),
          (path: string, contents: string): Promise<void> => window.api.writeFileContent(path, contents, 'utf8', {
            atomic: true, context: { operation: 'manual-crossing-outbox' },
          }))
        : new IndexedDbManualCrossingOutboxPersistence();
      const next: ManualCrossingOutboxService = createManualTimingOutbox(service, persistence,
        (catalog: EventCatalogState, command: ManualCrossingCommand): void => onCatalogRef.current(catalog, command),
        `${props.serverUrl?.replace(/\/$/u, '') || ''}/api/v1/timing/manual-crossings`);
      await next.initialize();
      if (!disposed) { ready = next; setOutbox(next); }
    }).catch((failure: Error): void => { if (!disposed) setError(`Manual timing storage: ${failure.message}`); });
    return (): void => { disposed = true; clearInterval(timer); window.removeEventListener('online', retry); };
  }, [props.service, props.storageDirectory, props.serverUrl]);
  return { error, outbox };
};
