// @vitest-environment jsdom

import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSeedEventCatalogLedger } from '../../ledger/createSeedEventCatalogLedger.js';
import type { EventCatalogLedger } from '../../ledger/eventCatalogLedger.js';
import type { DisplayComponent, DisplayScreenTemplate } from '../../model/displayScreen.js';
import type { EventCatalogPersistence } from '../../persistence/eventCatalogPersistence.js';
import type { DisplayProjection } from '../../processing/displayProjection.js';
import { EventCatalogService } from '../../service/eventCatalogService.js';
import { DisplayScreenCanvas } from '../display/DisplayScreenCanvas.js';
import { DisplayScreensPanel, type DisplayScreensPanelProps } from './DisplayScreensPanel.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const title: DisplayComponent = {
  height: 2, id: 'title', settings: { showSession: true }, type: 'event-title', width: 12, x: 0, y: 0, zIndex: 0,
};
const projection: DisplayProjection = {
  eventName: 'Winter Round', eventTimeZone: 'UTC', generatedAt: '2026-01-01T00:00:00.000Z',
  rows: [{ categoryName: 'Premier', entrantId: 'entrant-1', entrantName: 'Rider One', laps: 3, position: 1 }],
  sessionName: 'Feature Race',
};
const template: DisplayScreenTemplate = {
  archived: false, createdAt: '2026-01-01T00:00:00.000Z',
  draft: { items: [title], revision: 1, savedAt: '2026-01-01T00:00:00.000Z' },
  id: 'template-1', name: 'Results wall', publishedRevisions: [], updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('DisplayScreensPanel', () => {
  let root: Root;
  let container: HTMLDivElement;
  afterEach(async () => {
    if (root) await act(async (): Promise<void> => root.unmount());
    container?.remove();
  });

  it('edits a responsive canvas, saves through callbacks, and publishes explicitly', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const onSave = vi.fn(async (_id: string, _name: string, _items: DisplayComponent[]): Promise<void> => undefined);
    const onPublish = vi.fn(async (_id: string): Promise<void> => undefined);
    const onSelectEventSession = vi.fn();
    const props: DisplayScreensPanelProps = {
      categories: [], eventId: 'event-1',
      eventSessionOptions: [{ eventId: 'event-1', eventName: 'Winter Round', sessionId: 'session-1',
        sessionName: 'Feature Race', value: 'session:event-1:session-1' },
      { eventId: 'event-1', eventName: 'Winter Round', sessionId: 'session-2',
        sessionName: 'Sprint Race', value: 'session:event-1:session-2' }], links: [],
      onArchive: vi.fn(async (): Promise<void> => undefined),
      onCreate: vi.fn(async (): Promise<string> => 'template-2'),
      onCreateLink: vi.fn(async (): Promise<string> => 'token'),
      onPublish,
      onRevokeLink: vi.fn(async (): Promise<void> => undefined),
      onRotateLink: vi.fn(async (): Promise<string> => 'token'),
      onSave,
      onSelectEventSession,
      onUnpublish: vi.fn(async (): Promise<void> => undefined),
      projection, selectedEventSessionValue: 'session:event-1:session-1', sessionId: 'session-1',
      shareBaseUrl: 'http://localhost:3000', templates: [template],
    };
    await act(async (): Promise<void> => root.render(<DisplayScreensPanel {...props} />));
    const selector: HTMLElement = container.querySelector<HTMLElement>('[aria-label="Display screen template"]')!;
    await act(async (): Promise<void> => {
      selector.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    const option: HTMLElement | undefined = [...document.querySelectorAll<HTMLElement>('[role="option"]')]
      .find((candidate: HTMLElement): boolean => candidate.textContent === 'Results wall');
    expect(option).toBeDefined();
    await act(async (): Promise<void> => option!.click());
    expect(container.textContent).toContain('Winter Round');
    const sessionSelector: HTMLSelectElement = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Race View Event Session"]',
    )!;
    await act(async (): Promise<void> => {
      sessionSelector.value = 'session:event-1:session-2';
      sessionSelector.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onSelectEventSession).toHaveBeenCalledWith('session:event-1:session-2');
    await act(async (): Promise<void> => root.render(<DisplayScreensPanel {...props}
      projection={{ ...projection, sessionName: 'Sprint Race' }}
      selectedEventSessionValue="session:event-1:session-2" sessionId="session-2" />));
    expect(container.textContent).toContain('Sprint Race');
    const add: HTMLButtonElement = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button: HTMLButtonElement): boolean => button.textContent === 'Add')!;
    await act(async (): Promise<void> => add.click());
    const save: HTMLButtonElement = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button: HTMLButtonElement): boolean => button.textContent === 'Save draft')!;
    await act(async (): Promise<void> => save.click());
    expect(onSave).toHaveBeenCalledWith('template-1', 'Results wall', expect.any(Array));
    const savedItems: DisplayComponent[] = onSave.mock.calls[0]![2];
    expect(savedItems).toHaveLength(2);
    expect(onPublish).not.toHaveBeenCalled();
    await act(async (): Promise<void> => root.render(<DisplayScreensPanel {...props} templates={[{
      ...template, draft: { items: savedItems, revision: 2, savedAt: '2026-01-01T01:00:00.000Z' },
    }]} />));
    const publish: HTMLButtonElement = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button: HTMLButtonElement): boolean => button.textContent === 'Publish')!;
    await act(async (): Promise<void> => publish.click());
    expect(onPublish).toHaveBeenCalledWith('template-1');
  });

  it('renders the public canvas without editor selection controls', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async (): Promise<void> => root.render(<DisplayScreenCanvas items={[title]} projection={projection} />));
    expect(container.textContent).toContain('Winter Round');
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('saves and publishes from the UI through catalog persistence and its callback', async () => {
    let saved: EventCatalogLedger = createSeedEventCatalogLedger();
    const persistence: EventCatalogPersistence = {
      load: vi.fn(async (): Promise<EventCatalogLedger> => saved),
      save: vi.fn(async (ledger: EventCatalogLedger): Promise<void> => {
        saved = ledger; 
      }),
    };
    const onPersistedLedger = vi.fn(async (_ledger: EventCatalogLedger): Promise<void> => undefined);
    const service: EventCatalogService = await EventCatalogService.create(persistence, { onPersistedLedger });
    await service.createDisplayTemplate('Live wall');
    onPersistedLedger.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const templateId: string = service.catalog.displayScreenTemplates![0]!.id;
    const props: DisplayScreensPanelProps = {
      categories: [], eventId: service.catalog.events[0]!.id,
      eventSessionOptions: [{ eventId: service.catalog.events[0]!.id, eventName: 'Seed event',
        sessionId: 'session-1', sessionName: 'Feature Race',
        value: `session:${service.catalog.events[0]!.id}:session-1` }], links: [],
      onArchive: async (id: string): Promise<void> => {
        await service.archiveDisplayTemplate(id); 
      },
      onCreate: async (name: string): Promise<string> => {
        await service.createDisplayTemplate(name);
        return service.catalog.displayScreenTemplates!.at(-1)!.id;
      },
      onCreateLink: async (id: string, eventId: string, sessionId?: string): Promise<string> =>
        (await service.createDisplayShareLink(id, eventId, sessionId)).token,
      onPublish: async (id: string): Promise<void> => {
        await service.publishDisplayTemplate(id); 
      },
      onRevokeLink: async (id: string): Promise<void> => {
        await service.revokeDisplayShareLink(id); 
      },
      onRotateLink: async (id: string): Promise<string> => (await service.rotateDisplayShareLink(id)).token,
      onSave: async (id: string, name: string, items: DisplayComponent[]): Promise<void> => {
        await service.saveDisplayDraft(id, name, items);
      },
      onSelectEventSession: vi.fn(),
      onUnpublish: async (id: string): Promise<void> => {
        await service.unpublishDisplayTemplate(id); 
      },
      projection,
      selectedEventSessionValue: `session:${service.catalog.events[0]!.id}:session-1`,
      sessionId: 'session-1',
      shareBaseUrl: 'http://localhost:3000',
      templates: service.catalog.displayScreenTemplates || [],
    };
    await act(async (): Promise<void> => root.render(<DisplayScreensPanel {...props} />));
    const selector: HTMLElement = container.querySelector<HTMLElement>('[aria-label="Display screen template"]')!;
    await act(async (): Promise<void> => {
      selector.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); 
    });
    const option: HTMLElement = [...document.querySelectorAll<HTMLElement>('[role="option"]')]
      .find((candidate: HTMLElement): boolean => candidate.textContent === 'Live wall')!;
    await act(async (): Promise<void> => option.click());
    const add: HTMLButtonElement = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button: HTMLButtonElement): boolean => button.textContent === 'Add')!;
    await act(async (): Promise<void> => add.click());
    const saveButton: HTMLButtonElement = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button: HTMLButtonElement): boolean => button.textContent === 'Save draft')!;
    await act(async (): Promise<void> => saveButton.click());
    expect(saved.mutations.some((mutation) => mutation.type === 'display-template-draft-updated')).toBe(true);
    expect(onPersistedLedger).toHaveBeenCalledOnce();
    await act(async (): Promise<void> => root.render(<DisplayScreensPanel {...props} templates={service.catalog.displayScreenTemplates || []} />));
    const publishButton: HTMLButtonElement = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button: HTMLButtonElement): boolean => button.textContent === 'Publish')!;
    await act(async (): Promise<void> => publishButton.click());
    expect(saved.mutations.some((mutation) => mutation.type === 'display-template-published' && mutation.templateId === templateId)).toBe(true);
    expect(onPersistedLedger).toHaveBeenCalledTimes(2);
  });
});
