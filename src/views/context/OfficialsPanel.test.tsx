// @vitest-environment jsdom

import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventCatalogState } from '../../catalog/eventCatalog.js';
import { createSeedEventCatalogLedger } from '../../ledger/createSeedEventCatalogLedger.js';
import type { EventCatalogLedger } from '../../ledger/eventCatalogLedger.js';
import type { EventCatalogPersistence } from '../../persistence/eventCatalogPersistence.js';
import { EventCatalogService } from '../../service/eventCatalogService.js';
import { OfficialsPanel } from './OfficialsPanel.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const inputByLabel = (container: HTMLElement, label: string): HTMLInputElement => {
  const element: HTMLLabelElement | undefined = [...container.querySelectorAll<HTMLLabelElement>('label')]
    .find((candidate: HTMLLabelElement): boolean => candidate.textContent?.includes(label) === true);
  const input: HTMLInputElement | null = element ? container.querySelector<HTMLInputElement>(`#${element.htmlFor}`) : null;
  if (!input) throw new Error(`Missing ${label} input`);
  return input;
};

const enter = (input: HTMLInputElement, value: string): void => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

const click = (container: HTMLElement, label: string): void => {
  const button: HTMLButtonElement | undefined = [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find((candidate: HTMLButtonElement): boolean => candidate.textContent?.trim() === label);
  if (!button) throw new Error(`Missing ${label} button`);
  button.click();
};

describe('OfficialsPanel', () => {
  let root: Root;
  let container: HTMLDivElement;
  afterEach(async (): Promise<void> => {
    if (root) await act(async (): Promise<void> => root.unmount());
    container?.remove();
  });

  it('creates, assigns, searches, and archives through persisted catalog services', async () => {
    let saved: EventCatalogLedger = createSeedEventCatalogLedger();
    const persistence: EventCatalogPersistence = {
      load: vi.fn(async (): Promise<EventCatalogLedger> => saved),
      save: vi.fn(async (ledger: EventCatalogLedger): Promise<void> => {
        saved = ledger; 
      }),
    };
    const onPersistedLedger = vi.fn(async (_ledger: EventCatalogLedger): Promise<void> => undefined);
    const service: EventCatalogService = await EventCatalogService.create(persistence, { onPersistedLedger });
    const Harness = (): React.ReactElement => {
      const [catalog, setCatalog] = React.useState<EventCatalogState>(service.catalog);
      const write = (operation: () => Promise<EventCatalogState>): Promise<void> =>
        operation().then((next: EventCatalogState): void => setCatalog(next));
      return <OfficialsPanel catalog={catalog} selectedEventId={catalog.events[0]?.id}
        onArchiveProfile={(officialId: string, archived: boolean): Promise<void> =>
          write((): Promise<EventCatalogState> => service.archiveOfficialProfile(officialId, archived))}
        onCreateAssignment={(input): Promise<void> =>
          write((): Promise<EventCatalogState> => service.createOfficialAssignment(input))}
        onCreateProfile={(input): Promise<void> =>
          write((): Promise<EventCatalogState> => service.createOfficialProfile(input))}
        onLinkIndividual={(input): Promise<void> =>
          write((): Promise<EventCatalogState> => service.linkIndividualToEntrant(input))}
        onRemoveAssignment={(assignmentId: string): Promise<void> =>
          write((): Promise<EventCatalogState> => service.removeOfficialAssignment(assignmentId))}
        onUnlinkIndividual={(linkId: string): Promise<void> =>
          write((): Promise<EventCatalogState> => service.unlinkIndividualFromEntrant(linkId))}
        onUpdateAssignment={(assignmentId: string, input): Promise<void> =>
          write((): Promise<EventCatalogState> => service.updateOfficialAssignment(assignmentId, input))}
        onUpdateProfile={(officialId: string, input): Promise<void> =>
          write((): Promise<EventCatalogState> => service.updateOfficialProfile(officialId, input))} />;
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async (): Promise<void> => root.render(<Harness />));
    await act(async (): Promise<void> => {
      enter(inputByLabel(container, 'Name'), 'Alex Marshal');
      enter(inputByLabel(container, 'Position'), 'Chief marshal');
    });
    await act(async (): Promise<void> => click(container, 'Create individual'));
    expect(service.catalog.officials).toHaveLength(1);
    expect(onPersistedLedger).toHaveBeenCalledTimes(1);
    await act(async (): Promise<void> => click(container, 'Alex Marshal'));
    await act(async (): Promise<void> => enter(inputByLabel(container, 'Position'), 'Senior marshal'));
    await act(async (): Promise<void> => click(container, 'Save individual'));
    expect(service.catalog.officials![0]?.position).toBe('Senior marshal');
    await act(async (): Promise<void> => enter(inputByLabel(container, 'Role'), 'Start marshal'));
    await act(async (): Promise<void> => click(container, 'Add assignment'));
    expect(service.catalog.officialAssignments).toHaveLength(1);
    expect(container.textContent).toContain('1 assignment in contact list');
    await act(async (): Promise<void> => click(container, 'New assignment'));
    await act(async (): Promise<void> => enter(inputByLabel(container, 'Role'), 'Finish marshal'));
    await act(async (): Promise<void> => click(container, 'Add assignment'));
    expect(service.catalog.officialAssignments).toHaveLength(2);
    await act(async (): Promise<void> => enter(inputByLabel(container, 'Search individuals'), 'nobody'));
    expect(container.textContent).toContain('0 assignments in contact list');
    await act(async (): Promise<void> => enter(inputByLabel(container, 'Search individuals'), 'Alex'));
    await act(async (): Promise<void> => click(container, 'Archive individual'));
    expect(service.catalog.officials![0]?.archived).toBe(true);
    expect(container.textContent).toContain('Alex Marshal (archived)');
    const addAssignment: HTMLButtonElement = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button: HTMLButtonElement): boolean => button.textContent?.trim() === 'Add assignment')!;
    expect(addAssignment.disabled).toBe(true);
    expect(onPersistedLedger).toHaveBeenCalledTimes(5);
    expect(saved.mutations.slice(-5).map((mutation) => mutation.type)).toEqual([
      'official-profile-created', 'official-profile-updated', 'official-assignment-created',
      'official-assignment-created', 'official-profile-archived',
    ]);
  });
});
