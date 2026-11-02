// @vitest-environment jsdom

import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventCatalogState } from '../../catalog/eventCatalog.js';
import { createSeedEventCatalogLedger } from '../../ledger/createSeedEventCatalogLedger.js';
import type { EventCatalogLedger } from '../../ledger/eventCatalogLedger.js';
import type { EventCatalogPersistence } from '../../persistence/eventCatalogPersistence.js';
import { EventCatalogService } from '../../service/eventCatalogService.js';
import { IndividualLinksEditor } from './IndividualLinksEditor.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('IndividualLinksEditor', () => {
  let root: Root;
  let container: HTMLDivElement;
  afterEach(async (): Promise<void> => {
    if (root) await act(async (): Promise<void> => root.unmount());
    container?.remove();
  });

  it('links and unlinks an entrant through catalog persistence and upstream callback', async () => {
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
      availability: [], displayName: 'Alex', notes: '', position: '', responsibilities: [],
    });
    onPersistedLedger.mockClear();
    const Harness = (): React.ReactElement => {
      const [catalog, setCatalog] = React.useState<EventCatalogState>(service.catalog);
      const write = (operation: () => Promise<EventCatalogState>): Promise<void> =>
        operation().then((next: EventCatalogState): void => setCatalog(next));
      return <IndividualLinksEditor catalog={catalog} eventId={catalog.events[0]!.id}
        selected={catalog.officials![0]}
        onLink={(input): Promise<void> => write((): Promise<EventCatalogState> => service.linkIndividualToEntrant(input))}
        onUnlink={(linkId: string): Promise<void> =>
          write((): Promise<EventCatalogState> => service.unlinkIndividualFromEntrant(linkId))} />;
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async (): Promise<void> => root.render(<Harness />));
    const select: HTMLElement = container.querySelector<HTMLElement>('[role="combobox"]')!;
    await act(async (): Promise<void> => {
      select.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    const entrantName: string = service.catalog.entrants[0]!.name;
    const option: HTMLElement = [...document.querySelectorAll<HTMLElement>('[role="option"]')]
      .find((candidate: HTMLElement): boolean => candidate.textContent === entrantName)!;
    expect(option).toBeDefined();
    await act(async (): Promise<void> => option.click());
    const linkButton: HTMLButtonElement = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button: HTMLButtonElement): boolean => button.textContent?.trim() === 'Link participant')!;
    await act(async (): Promise<void> => linkButton.click());
    expect(service.catalog.individualLinks).toHaveLength(1);
    expect(container.textContent).toContain(entrantName);
    const unlinkButton: HTMLButtonElement = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button: HTMLButtonElement): boolean => button.textContent?.trim() === 'Unlink')!;
    await act(async (): Promise<void> => unlinkButton.click());
    expect(service.catalog.individualLinks![0]?.removed).toBe(true);
    expect(onPersistedLedger).toHaveBeenCalledTimes(2);
    expect(saved.mutations.slice(-2).map((mutation) => mutation.type)).toEqual([
      'individual-linked', 'individual-unlinked',
    ]);
  });
});
