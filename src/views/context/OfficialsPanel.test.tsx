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

  it('assigns event roles through the catalog ledger without profile editing controls', async () => {
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
      displayName: 'Alex Marshal', notes: '',
    });
    await service.createOfficialProfile({
      displayName: 'Taylor Timekeeper', notes: '',
    });
    const individualId: string = service.catalog.officials![0]!.id;
    onPersistedLedger.mockClear();
    const onOpenIndividual = vi.fn();
    const Harness = (): React.ReactElement => {
      const [catalog, setCatalog] = React.useState<EventCatalogState>(service.catalog);
      const [selectedId, setSelectedId] = React.useState<string | undefined>(individualId);
      const write = (operation: () => Promise<EventCatalogState>): Promise<void> =>
        operation().then((next: EventCatalogState): void => setCatalog(next));
      return <OfficialsPanel catalog={catalog} eventId={catalog.events[0]?.id}
        onCreateAssignment={(input): Promise<void> => write((): Promise<EventCatalogState> => service.createOfficialAssignment(input))}
        onOpenIndividual={onOpenIndividual}
        onRemoveAssignment={(assignmentId: string): Promise<void> =>
          write((): Promise<EventCatalogState> => service.removeOfficialAssignment(assignmentId))}
        onSelectIndividual={setSelectedId}
        onUpdateAssignment={(assignmentId: string, input): Promise<void> =>
          write((): Promise<EventCatalogState> => service.updateOfficialAssignment(assignmentId, input))}
        selectedIndividualId={selectedId} />;
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async (): Promise<void> => root.render(<Harness />));
    expect(container.textContent).not.toContain('License numbers');
    expect(container.textContent).not.toContain('Create individual');
    expect(inputByLabel(container, 'Search and select individual')).toBeTruthy();
    expect(container.textContent).not.toContain('Matching individuals');
    await act(async (): Promise<void> => click(container, 'Edit individual details'));
    expect(onOpenIndividual).toHaveBeenCalledTimes(1);
    await act(async (): Promise<void> => enter(inputByLabel(container, 'Position / duty'), 'Start line'));
    await act(async (): Promise<void> => click(container, 'Add availability slot'));
    await act(async (): Promise<void> => click(container, 'Add assignment'));
    expect(service.catalog.officialAssignments).toHaveLength(1);
    expect(service.catalog.officialAssignments![0]?.availability).toEqual([{ status: 'available' }]);
    expect(container.textContent).toContain('Start line');
    await act(async (): Promise<void> => click(container, 'New assignment'));
    await act(async (): Promise<void> => enter(inputByLabel(container, 'Position / duty'), 'Finish line'));
    await act(async (): Promise<void> => click(container, 'Add assignment'));
    expect(service.catalog.officialAssignments).toHaveLength(2);
    expect(onPersistedLedger).toHaveBeenCalledTimes(2);
    expect(saved.mutations.slice(-2).map((mutation) => mutation.type)).toEqual([
      'official-assignment-created', 'official-assignment-created',
    ]);
  });
});
