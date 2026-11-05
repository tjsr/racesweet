// @vitest-environment jsdom

import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventCatalogState } from '../../catalog/eventCatalog.js';
import { createSeedEventCatalogLedger } from '../../ledger/createSeedEventCatalogLedger.js';
import type { EventCatalogLedger } from '../../ledger/eventCatalogLedger.js';
import type { IndividualLinkInput } from '../../model/individualLink.js';
import type { EventCatalogPersistence } from '../../persistence/eventCatalogPersistence.js';
import { EventCatalogService } from '../../service/eventCatalogService.js';
import { IndividualsPanel } from './IndividualsPanel.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const inputByLabel = (container: HTMLElement, label: string): HTMLInputElement => {
  const element: HTMLLabelElement | undefined = [...container.querySelectorAll<HTMLLabelElement>('label')]
    .find((candidate: HTMLLabelElement): boolean => candidate.textContent?.startsWith(label) === true);
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

describe('IndividualsPanel', () => {
  let root: Root;
  let container: HTMLDivElement;
  afterEach(async (): Promise<void> => {
    if (root) await act(async (): Promise<void> => root.unmount());
    container?.remove();
  });

  it('shows unlinked participant cards and saves shared license and emergency details', async () => {
    let saved: EventCatalogLedger = createSeedEventCatalogLedger();
    const persistence: EventCatalogPersistence = {
      load: vi.fn(async (): Promise<EventCatalogLedger> => saved),
      save: vi.fn(async (ledger: EventCatalogLedger): Promise<void> => {
        saved = ledger; 
      }),
    };
    const onPersistedLedger = vi.fn(async (_ledger: EventCatalogLedger): Promise<void> => undefined);
    const service: EventCatalogService = await EventCatalogService.create(persistence, { onPersistedLedger });
    const rider = service.catalog.entrants[0]!;
    let updateCatalog: React.Dispatch<React.SetStateAction<EventCatalogState>>;
    const Harness = (): React.ReactElement => {
      const [catalog, setCatalog] = React.useState<EventCatalogState>(service.catalog);
      updateCatalog = setCatalog;
      const [selectedId, setSelectedId] = React.useState<string | undefined>(undefined);
      const create = (operation: () => Promise<EventCatalogState>, getId: (next: EventCatalogState) => string): Promise<string> =>
        operation().then((next: EventCatalogState): string => {
          setCatalog(next); return getId(next); 
        });
      const write = (operation: () => Promise<EventCatalogState>): Promise<void> =>
        operation().then((next: EventCatalogState): void => setCatalog(next));
      return <IndividualsPanel catalog={catalog} eventId={catalog.events[0]?.id}
        onArchiveProfile={(individualId: string, archived: boolean): Promise<void> =>
          write((): Promise<EventCatalogState> => service.archiveOfficialProfile(individualId, archived))}
        onCreateFromEntrant={(target): Promise<string> => create(
          (): Promise<EventCatalogState> => service.createIndividualFromEntrant(target),
          (next: EventCatalogState): string => next.individualLinks!.at(-1)!.individualId)}
        onCreateProfile={(input): Promise<string> => create(
          (): Promise<EventCatalogState> => service.createOfficialProfile(input),
          (next: EventCatalogState): string => next.officials!.at(-1)!.id)}
        onLinkIndividual={(input: IndividualLinkInput): Promise<void> =>
          write((): Promise<EventCatalogState> => service.linkIndividualToEntrant(input))}
        onSelectProfile={setSelectedId}
        onUpdateProfile={(individualId: string, input): Promise<void> =>
          write((): Promise<EventCatalogState> => service.updateOfficialProfile(individualId, input))}
        selectedProfileId={selectedId} />;
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async (): Promise<void> => root.render(<Harness />));
    expect(container.textContent).toContain(rider.name);
    expect(container.textContent).toContain('Needs profile');
    const card: HTMLButtonElement = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button: HTMLButtonElement): boolean => button.textContent?.includes(rider.name) === true)!;
    await act(async (): Promise<void> => card.click());
    expect(container.textContent).toContain('First name: Rider');
    expect(container.textContent).toContain('Surname: 101');
    expect(container.textContent).toContain('These entrant details will prefill the new linked profile.');
    await act(async (): Promise<void> => click(container, 'Create profile and link'));
    expect(service.catalog.officials![0]?.displayName).toBe(rider.name);
    expect(service.catalog.individualLinks![0]?.individualId).toBe(service.catalog.officials![0]?.id);
    expect(container.textContent).not.toContain('Needs profile');
    expect(inputByLabel(container, 'First name').value).toBe('Rider');
    expect(inputByLabel(container, 'Surname').value).toBe('101');
    await act(async (): Promise<void> => {
      enter(inputByLabel(container, 'First name'), 'Alex');
      enter(inputByLabel(container, 'Surname'), 'Rider');
      enter(inputByLabel(container, 'Gender'), 'female');
      enter(inputByLabel(container, 'Date of birth'), '2001-01-15');
    });
    await act(async (): Promise<void> => enter(inputByLabel(container, 'License number'), 'LIC-42'));
    await act(async (): Promise<void> => click(container, 'Add emergency contact'));
    await act(async (): Promise<void> => {
      enter(inputByLabel(container, 'Contact name'), 'Casey Rider');
      enter(inputByLabel(container, 'Contact phone'), '+61 400 111 222');
    });
    await act(async (): Promise<void> => click(container, 'Save individual'));
    expect(service.catalog.officials![0]?.licenses?.[0]?.number).toBe('LIC-42');
    expect(service.catalog.officials![0]?.emergencyContacts?.[0]?.name).toBe('Casey Rider');
    expect(service.catalog.officials![0]).toMatchObject({ dateOfBirth: '2001-01-15', displayName: 'Alex Rider',
      firstName: 'Alex', gender: 'female', lastName: 'Rider' });
    expect(service.catalog.entrants.find((entrant): boolean => entrant.id === rider.id)).toMatchObject({
      dateOfBirth: '2001-01-15', firstName: 'Alex', gender: 'female', lastName: 'Rider', name: 'Alex Rider',
    });
    await act(async (): Promise<void> => click(container, 'New individual'));
    await act(async (): Promise<void> => {
      enter(inputByLabel(container, 'First name'), 'Morgan');
      enter(inputByLabel(container, 'Surname'), 'Official');
    });
    await act(async (): Promise<void> => click(container, 'Create individual'));
    expect(service.catalog.officials![1]?.displayName).toBe('Morgan Official');
    expect(container.textContent).toContain('Morgan Official');
    await act(async (): Promise<void> => {
      const next: EventCatalogState = await service.unlinkIndividualFromEntrant(service.catalog.individualLinks![0]!.id);
      updateCatalog(next);
    });
    const unlinkedCard: HTMLButtonElement = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button: HTMLButtonElement): boolean => button.textContent?.includes('Needs profile') === true)!;
    await act(async (): Promise<void> => unlinkedCard.click());
    const profileSelect: HTMLElement = container.querySelector<HTMLElement>('[role="combobox"][aria-labelledby*="Link"]') ||
      [...container.querySelectorAll<HTMLElement>('[role="combobox"]')].at(-1)!;
    await act(async (): Promise<void> => {
      profileSelect.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    const profileOption: HTMLElement = [...document.querySelectorAll<HTMLElement>('[role="option"]')]
      .find((option: HTMLElement): boolean => option.textContent === 'Morgan Official')!;
    await act(async (): Promise<void> => profileOption.click());
    await act(async (): Promise<void> => click(container, 'Link existing profile'));
    expect(service.catalog.individualLinks!.at(-1)?.individualId).toBe(service.catalog.officials![1]?.id);
    expect(container.textContent).not.toContain('Needs profile');
    expect(onPersistedLedger).toHaveBeenCalledTimes(5);
    expect(saved.mutations.slice(-8).map((mutation) => mutation.type)).toEqual([
      'official-profile-created', 'individual-linked', 'official-profile-updated', 'entrant-updated',
      'official-profile-created', 'individual-unlinked', 'individual-linked', 'entrant-updated',
    ]);
  });
});
