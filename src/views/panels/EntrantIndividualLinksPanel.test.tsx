// @vitest-environment jsdom

import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventCatalogState } from '../../catalog/eventCatalog.js';
import { createSeedEventCatalogLedger } from '../../ledger/createSeedEventCatalogLedger.js';
import type { EventCatalogLedger } from '../../ledger/eventCatalogLedger.js';
import type { EventCatalogPersistence } from '../../persistence/eventCatalogPersistence.js';
import { EventCatalogService } from '../../service/eventCatalogService.js';
import { EntrantIndividualLinksPanel } from './EntrantIndividualLinksPanel.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('EntrantIndividualLinksPanel', () => {
  let root: Root;
  let container: HTMLDivElement;
  afterEach(async (): Promise<void> => {
    if (root) await act(async (): Promise<void> => root.unmount());
    container?.remove();
  });

  it('links and unlinks a rider through catalog persistence and upstream callback', async () => {
    let saved: EventCatalogLedger = createSeedEventCatalogLedger();
    const persistence: EventCatalogPersistence = {
      load: vi.fn(async (): Promise<EventCatalogLedger> => saved),
      save: vi.fn(async (ledger: EventCatalogLedger): Promise<void> => {
        saved = ledger; 
      }),
    };
    const onPersistedLedger = vi.fn(async (_ledger: EventCatalogLedger): Promise<void> => undefined);
    const service: EventCatalogService = await EventCatalogService.create(persistence, { onPersistedLedger });
    await service.createOfficialProfile({
      displayName: 'Alex', notes: '',
    });
    onPersistedLedger.mockClear();
    const Harness = (): React.ReactElement => {
      const [catalog, setCatalog] = React.useState<EventCatalogState>(service.catalog);
      const write = (operation: () => Promise<EventCatalogState>): Promise<void> =>
        operation().then((next: EventCatalogState): void => setCatalog(next));
      return <EntrantIndividualLinksPanel catalog={catalog} entrant={catalog.entrants[0]!}
        onLink={(input): Promise<void> => write((): Promise<EventCatalogState> => service.linkIndividualToEntrant(input))}
        onUnlink={(linkId: string): Promise<void> =>
          write((): Promise<EventCatalogState> => service.unlinkIndividualFromEntrant(linkId))} />;
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async (): Promise<void> => root.render(<Harness />));
    const selector: HTMLElement = container.querySelector<HTMLElement>('[role="combobox"]')!;
    await act(async (): Promise<void> => {
      selector.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    const option: HTMLElement = [...document.querySelectorAll<HTMLElement>('[role="option"]')]
      .find((candidate: HTMLElement): boolean => candidate.textContent === 'Alex')!;
    await act(async (): Promise<void> => option.click());
    const button = (label: string): HTMLButtonElement => [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((candidate: HTMLButtonElement): boolean => candidate.textContent?.trim() === label)!;
    await act(async (): Promise<void> => button('Link individual').click());
    expect(service.catalog.individualLinks).toHaveLength(1);
    expect(container.textContent).toContain('→ Alex');
    await act(async (): Promise<void> => button('Unlink').click());
    expect(service.catalog.individualLinks![0]?.removed).toBe(true);
    expect(onPersistedLedger).toHaveBeenCalledTimes(2);
    expect(saved.mutations.slice(-3).map((mutation) => mutation.type)).toEqual([
      'individual-linked', 'entrant-updated', 'individual-unlinked',
    ]);
  });
});
