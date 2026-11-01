import { describe, expect, it, vi, type Mock } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSeedEventCatalogLedger } from '../ledger/createSeedEventCatalogLedger.js';
import type { EventCatalogLedger } from '../ledger/eventCatalogLedger.js';
import type { DisplayComponent, DisplayScreenTemplate } from '../model/displayScreen.js';
import type { EventCatalogPersistence } from '../persistence/eventCatalogPersistence.js';
import { NodeJsonEventCatalogPersistence } from '../persistence/nodePersistence.js';
import { EventCatalogService } from './eventCatalogService.js';

const title: DisplayComponent = {
  height: 2, id: 'title', settings: { showSession: true }, type: 'event-title', width: 12, x: 0, y: 0, zIndex: 0,
};

const createService = async (): Promise<{
  getSaved: () => EventCatalogLedger;
  onPersistedLedger: Mock<(ledger: EventCatalogLedger) => Promise<void>>;
  persistence: EventCatalogPersistence;
  service: EventCatalogService;
}> => {
  let saved: EventCatalogLedger = createSeedEventCatalogLedger();
  const onPersistedLedger: Mock<(ledger: EventCatalogLedger) => Promise<void>> =
    vi.fn(async (_ledger: EventCatalogLedger): Promise<void> => undefined);
  const persistence: EventCatalogPersistence = {
    load: vi.fn(async (): Promise<EventCatalogLedger> => saved),
    save: vi.fn(async (ledger: EventCatalogLedger): Promise<void> => { saved = ledger; }),
  };
  const service: EventCatalogService = await EventCatalogService.create(persistence, { onPersistedLedger });
  return { getSaved: (): EventCatalogLedger => saved, onPersistedLedger, persistence, service };
};

describe('display screen catalog flow', () => {
  it('reloads a published link from split JSON persistence', async () => {
    const directory: string = await mkdtemp(path.join(os.tmpdir(), 'racesweet-display-'));
    try {
      const persistence = new NodeJsonEventCatalogPersistence(path.join(directory, 'event-catalog.json'));
      const service: EventCatalogService = await EventCatalogService.create(persistence);
      const event = service.catalog.events[0]!;
      await service.createDisplayTemplate('Persisted wall');
      const templateId: string = service.catalog.displayScreenTemplates![0]!.id;
      await service.saveDisplayDraft(templateId, 'Persisted wall', [title]);
      await service.publishDisplayTemplate(templateId);
      const created = await service.createDisplayShareLink(templateId, event.id);
      const reloaded: EventCatalogService = await EventCatalogService.create(persistence);
      expect((await reloaded.resolveDisplayShareToken(created.token))?.revision.items).toEqual([title]);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
  it('keeps drafts private, retains revision snapshots, and persists every mutation', async () => {
    const fixture = await createService();
    const service: EventCatalogService = fixture.service;
    await service.createDisplayTemplate('Results wall');
    const template: DisplayScreenTemplate = service.catalog.displayScreenTemplates![0]!;
    await expect(service.createDisplayTemplate('results WALL')).rejects.toThrow(/unique/);
    await expect(service.publishDisplayTemplate(template.id)).rejects.toThrow(/1 to 100/);
    await service.saveDisplayDraft(template.id, template.name, [title]);
    expect(service.catalog.displayScreenTemplates![0]?.publishedRevision).toBeUndefined();
    await service.publishDisplayTemplate(template.id);
    const revision: number = service.catalog.displayScreenTemplates![0]!.publishedRevision!;
    const event = service.catalog.events[0]!;
    const session = service.catalog.sessions.find((candidate) => candidate.eventId === event.id);
    const shared = await service.createDisplayShareLink(template.id, event.id, session?.id);
    expect(fixture.getSaved().mutations.some((mutation) => JSON.stringify(mutation).includes(shared.token))).toBe(false);
    expect((await service.resolveDisplayShareToken(shared.token))?.revision.revision).toBe(revision);
    await service.saveDisplayDraft(template.id, 'Results wall', [
      { ...title, settings: { showSession: false } },
    ]);
    expect((await service.resolveDisplayShareToken(shared.token))?.revision.items[0]).toEqual(title);
    await service.publishDisplayTemplate(template.id);
    expect((await service.resolveDisplayShareToken(shared.token))?.revision.revision).toBe(revision);
    expect(service.catalog.displayScreenTemplates![0]!.publishedRevisions).toHaveLength(2);
    expect(fixture.onPersistedLedger).toHaveBeenCalledTimes(6);
    const reloaded: EventCatalogService = await EventCatalogService.create(fixture.persistence);
    expect((await reloaded.resolveDisplayShareToken(shared.token))?.revision.items[0]).toEqual(title);
  });

  it('reuses one published template for independent session bindings', async () => {
    const { service } = await createService();
    await service.createDisplayTemplate('Shared results wall');
    const templateId: string = service.catalog.displayScreenTemplates![0]!.id;
    await service.saveDisplayDraft(templateId, 'Shared results wall', [title]);
    await service.publishDisplayTemplate(templateId);
    const eventId = service.catalog.events[0]!.id;
    const sessions = service.catalog.sessions.filter((session) => session.eventId === eventId);
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    const first = await service.createDisplayShareLink(templateId, eventId, sessions[0]!.id);
    const second = await service.createDisplayShareLink(templateId, eventId, sessions[1]!.id);
    expect((await service.resolveDisplayShareToken(first.token))?.sessionId).toBe(sessions[0]!.id);
    expect((await service.resolveDisplayShareToken(second.token))?.sessionId).toBe(sessions[1]!.id);
    expect(first.link.templateId).toBe(second.link.templateId);
    expect(first.link.revision).toBe(second.link.revision);
  });

  it('validates binding, rotates and revokes tokens, and hides archived or unpublished screens', async () => {
    const { service } = await createService();
    await service.createDisplayTemplate('Trackside');
    const templateId: string = service.catalog.displayScreenTemplates![0]!.id;
    await service.saveDisplayDraft(templateId, 'Trackside', [title]);
    await service.publishDisplayTemplate(templateId);
    const event = service.catalog.events[0]!;
    const wrongSession = service.catalog.sessions.find((candidate) => candidate.eventId !== event.id);
    if (wrongSession) await expect(service.createDisplayShareLink(templateId, event.id, wrongSession.id)).rejects.toThrow(/binding/);
    const first = await service.createDisplayShareLink(templateId, event.id);
    const rotated = await service.rotateDisplayShareLink(first.link.id);
    expect(await service.resolveDisplayShareToken(first.token)).toBeUndefined();
    expect(await service.resolveDisplayShareToken(rotated.token)).toBeDefined();
    await service.unpublishDisplayTemplate(templateId);
    expect(await service.resolveDisplayShareToken(rotated.token)).toBeUndefined();
    await service.publishDisplayTemplate(templateId);
    await service.archiveDisplayTemplate(templateId);
    expect(await service.resolveDisplayShareToken(rotated.token)).toBeUndefined();
    await service.archiveDisplayTemplate(templateId, false);
    await service.revokeDisplayShareLink(first.link.id);
    expect(await service.resolveDisplayShareToken(rotated.token)).toBeUndefined();
  });

  it('rejects invalid expiry and makes an expired token unavailable', async () => {
    const { service } = await createService();
    await service.createDisplayTemplate('Timed screen');
    const templateId: string = service.catalog.displayScreenTemplates![0]!.id;
    await service.saveDisplayDraft(templateId, 'Timed screen', [title]);
    await service.publishDisplayTemplate(templateId);
    const eventId = service.catalog.events[0]!.id;
    await expect(service.createDisplayShareLink(templateId, eventId, undefined, 'invalid')).rejects.toThrow(/expiry/);
    await expect(service.createDisplayShareLink(templateId, eventId, undefined, new Date(0).toISOString())).rejects.toThrow(/expiry/);
    const expiresAt: string = new Date(Date.now() + 60_000).toISOString();
    const shared = await service.createDisplayShareLink(templateId, eventId, undefined, expiresAt);
    expect(await service.resolveDisplayShareToken(shared.token)).toBeDefined();
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(Date.parse(expiresAt) + 1));
      expect(await service.resolveDisplayShareToken(shared.token)).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
