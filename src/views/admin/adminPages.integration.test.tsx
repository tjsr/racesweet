// @vitest-environment jsdom

import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type SystemConfiguration, createDefaultSystemConfiguration } from '../../app/systemConfig.js';
import { type EventCatalogState } from '../../catalog/eventCatalog.js';
import { createSeedEventCatalogLedger } from '../../ledger/createSeedEventCatalogLedger.js';
import { type EventCatalogLedger } from '../../ledger/eventCatalogLedger.js';
import { type EventCatalogPersistence } from '../../persistence/eventCatalogPersistence.js';
import { EventCatalogService } from '../../service/eventCatalogService.js';
import { CategoriesPage } from '../context/Categories.js';
import { EntrantsPage } from '../display/entrantsPage.js';
import { EventsScreen } from '../display/events.js';
import { SessionsPage } from '../display/sessionsPage.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
type Page = 'events' | 'sessions' | 'categories' | 'entrants';

const Harness = ({ page, service }: { page: Page; service: EventCatalogService }): React.ReactElement => {
  const [catalog, setCatalog] = React.useState<EventCatalogState>(service.catalog);
  const eventId: string = catalog.events[0]!.id;
  const sessionId: string = catalog.sessions[0]!.id;
  const entrantId: string = catalog.entrants[0]!.id;
  const categoryId: string = catalog.categories[0]!.id;
  const config: SystemConfiguration = createDefaultSystemConfiguration();
  const write = (operation: Promise<EventCatalogState>): Promise<void> => operation.then((next: EventCatalogState): void => setCatalog(next));
  if (page === 'events') return <EventsScreen catalog={catalog} config={config} onActivateEvent={vi.fn()} onCreateEvent={vi.fn()}
    onCreateSession={vi.fn()} onDeleteEvent={vi.fn()} onMakeSessionActive={vi.fn()} onSaveEventAssignment={vi.fn()}
    onSelectEvent={vi.fn()} onSelectSession={vi.fn()} onUpdateEvent={(id, changes): Promise<void> => write(service.updateEvent(id, changes))}
    selectedEventId={eventId} />;
  if (page === 'sessions') return <SessionsPage catalog={catalog} config={config} onApplySessionSources={vi.fn()}
    onCreateSession={vi.fn()} onDeleteSession={vi.fn()} onMakeSessionActive={vi.fn()} onReloadSessionSources={vi.fn()}
    onSaveSessionAssignment={vi.fn()} onSaveSessionCategoryAssignment={vi.fn()} onSelectEvent={vi.fn()} onSelectSession={vi.fn()}
    onUpdateSession={(id, changes): Promise<void> => write(service.updateSession(id, changes))} selectedEventId={eventId} selectedSessionId={sessionId} />;
  if (page === 'categories') return <CategoriesPage catalog={catalog} entrants={catalog.entrants} onCreateCategory={vi.fn()}
    onDeleteCategory={vi.fn()} onSelectCategory={vi.fn()} onSelectEvent={vi.fn()}
    onUpdateCategory={(id, changes): Promise<void> => write(service.updateCategory(id, changes))}
    onUpdateCategorySessionAssignments={(id, ids): Promise<void> => write(service.updateCategorySessionAssignments(id, ids))}
    selectedCategoryId={categoryId} selectedEventId={eventId} />;
  return <EntrantsPage catalog={catalog} onCreateEntrant={vi.fn()} onDeleteEntrant={vi.fn()} onSelectEntrant={vi.fn()}
    onSelectEvent={vi.fn()} onUpdateEntrant={(id, changes): Promise<void> => write(service.updateEntrant(id, changes))}
    selectedEntrantId={entrantId} selectedEventId={eventId} />;
};

describe('shared admin pages across phone, tablet and desktop', (): void => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;
  afterEach((): void => {
    act((): void => root?.unmount()); container?.remove(); vi.unstubAllGlobals();
  });
  it.each([360, 768, 1280].flatMap((width: number): Array<[number, Page]> =>
    (['events', 'sessions', 'categories', 'entrants'] as Page[]).map((page: Page): [number, Page] => [width, page])))
  ('persists %s px %s edits with the shared service and preserves a draft on Back', async (width: number, page: Page): Promise<void> => {
    vi.stubGlobal('matchMedia', (query: string): MediaQueryList => ({
      addEventListener: (): void => undefined, addListener: (): void => undefined,
      dispatchEvent: (): boolean => false, matches: query.includes('min-width:960px') && width >= 960,
      media: query, onchange: null, removeEventListener: (): void => undefined, removeListener: (): void => undefined,
    }));
    let ledger: EventCatalogLedger = createSeedEventCatalogLedger();
    const persistence: EventCatalogPersistence = {
      load: (): Promise<EventCatalogLedger> => Promise.resolve(ledger),
      save: (next: EventCatalogLedger): Promise<void> => {
        ledger = next; return Promise.resolve(); 
      },
    };
    const upstream = vi.fn<(_ledger: EventCatalogLedger) => Promise<void>>().mockResolvedValue(undefined);
    const service: EventCatalogService = await EventCatalogService.create(persistence, { onPersistedLedger: upstream });
    upstream.mockClear();
    const before: number = ledger.mutations.length;
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
    await act(async (): Promise<void> => root?.render(<Harness page={page} service={service} />));
    const detailLabel: string = `${page === 'categories' ? 'category' : page === 'entrants' ? 'entrant' : page.slice(0, -1)} details`;
    const openButton: HTMLButtonElement | undefined = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button: HTMLButtonElement): boolean => button.textContent === `Open ${detailLabel}`);
    if (width < 960) await act(async (): Promise<void> => openButton?.click());
    const selector: string = page === 'events' ? 'input[aria-label="Event Name"]' : page === 'sessions'
      ? 'input[aria-label="Sessions Page Name"]' : page === 'categories' ? 'input[aria-label="Category Name"]' : 'textarea[aria-label="Entrant Notes"]';
    const field: HTMLInputElement | HTMLTextAreaElement = container.querySelector(selector)!;
    expect(field).toBeTruthy();
    await act(async (): Promise<void> => {
      Object.getOwnPropertyDescriptor(field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(field, 'Changed on device');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    if (width < 960) {
      const back: HTMLButtonElement = [...container.querySelectorAll<HTMLButtonElement>('button')]
        .find((button: HTMLButtonElement): boolean => button.textContent === `Back to ${page}`)!;
      await act(async (): Promise<void> => back.click());
      await act(async (): Promise<void> => openButton?.click());
      expect(container.querySelector(selector)).toBe(field);
      expect(field.value).toBe('Changed on device');
    }
    const label: string = page === 'events' ? 'Save Event Details' : page === 'sessions' ? 'Save Session' : page === 'categories' ? 'Save Category' : 'Save Entrant';
    const save: HTMLButtonElement | undefined = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button: HTMLButtonElement): boolean => button.textContent === label);
    expect(save).toBeTruthy();
    await act(async (): Promise<void> => save?.click());
    expect(ledger.mutations.length).toBeGreaterThan(before);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(ledger.mutations.slice(before).map((mutation) => JSON.stringify(mutation)).join(' ')).toContain('Changed on device');
    expect(container.querySelectorAll('button:not(.MuiButtonBase-root)')).toHaveLength(0);
  });
});
