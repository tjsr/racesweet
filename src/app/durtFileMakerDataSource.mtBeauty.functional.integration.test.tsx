// @vitest-environment jsdom

import { existsSync } from 'node:fs';
import path from 'node:path';
import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { type SystemConfiguration, createDefaultSystemConfiguration } from './systemConfig.js';
import { getCategoriesForEvent, getEntriesForEvent, getEntrantsForEvent } from '../catalog/eventCatalog.js';
import { createSeedEventCatalogLedger } from '../ledger/createSeedEventCatalogLedger.js';
import type { EventCatalogLedger } from '../ledger/eventCatalogLedger.js';
import { type RaceState, Session } from '../model/racestate.js';
import type { EventCatalogPersistence } from '../persistence/eventCatalogPersistence.js';
import type { SystemConfigPersistence } from '../persistence/systemConfigPersistence.js';
import { EventCatalogService } from '../service/eventCatalogService.js';
import { applyPulledRaceStateToSession } from '../service/sourceApplication.js';
import { SystemConfigService } from '../service/systemConfigService.js';
import { useUiConsoleGuards } from '../testing/uiConsoleGuards.js';
import { ResultsPage, ReportsPage } from '../views/display/raceAnalyticsViews.js';
import { TimingContext } from '../views/context/Timing.js';
import { getBundledDurtFileMakerExtractorPath, loadDurtFileMakerRaceState } from './durtFileMakerDataSource.js';

const mtBeautyDirectory: string = 'C:/Users/tim/OneDrive/Archived Timing/2013 Mt Beauty 6hr';
const mtBeautyEventPath: string = path.join(mtBeautyDirectory, 'Enduro Event.fmp12');
const mtBeautyReferencePdfPath: string = path.join(mtBeautyDirectory, '2013-ves2-overall.pdf');
const extractorPath: string = getBundledDurtFileMakerExtractorPath();
const hasMtBeautyFixture: boolean = [extractorPath, mtBeautyEventPath, mtBeautyReferencePdfPath].every(existsSync);

const createCatalogPersistence = (initial: EventCatalogLedger): EventCatalogPersistence => {
  let ledger: EventCatalogLedger = initial;
  return {
    load: vi.fn(async (): Promise<EventCatalogLedger> => ledger),
    save: vi.fn(async (nextLedger: EventCatalogLedger): Promise<void> => {
      ledger = nextLedger;
    }),
  };
};

const createSystemConfigPersistence = (): SystemConfigPersistence => {
  let config: SystemConfiguration = createDefaultSystemConfiguration();
  return {
    load: vi.fn(async (): Promise<SystemConfiguration> => config),
    save: vi.fn(async (nextConfig: SystemConfiguration): Promise<void> => {
      config = nextConfig;
    }),
  };
};

const snapshotSession = (session: Session): RaceState => ({
  categories: [...session.categories],
  entries: [...session.entries],
  participants: [...session.participants],
  records: [...session.records],
  teams: [...session.teams],
  timeRecordSources: [...session.timeRecordSources],
});

const selectValue = async (element: HTMLSelectElement, value: string): Promise<void> => {
  await act(async (): Promise<void> => {
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

describe('DURT Mt Beauty functional import', () => {
  useUiConsoleGuards();
  const runMtBeautyTest = hasMtBeautyFixture ? it : it.skip;

  runMtBeautyTest('creates an event, source, and session before displaying imported crossings, results, and lap reports', async () => {
    const catalogService: EventCatalogService = await EventCatalogService.create(createCatalogPersistence(createSeedEventCatalogLedger()));
    await catalogService.createEvent();
    const event = catalogService.catalog.events.find((candidate) => candidate.name === 'New Event')!;
    await catalogService.updateEvent(event.id, {
      date: '2013-04-27',
      discipline: 'cycling',
      name: '2013 Mt Beauty 6 Hour',
      timeZone: 'Australia/Sydney',
    });
    await catalogService.createSession(event.id);
    const session = catalogService.catalog.sessions.find((candidate) => candidate.eventId === event.id)!;

    const systemConfigService: SystemConfigService = await SystemConfigService.create(createSystemConfigPersistence());
    await systemConfigService.createSource('file-durt-filemaker');
    const source = systemConfigService.state.dataSources[0]!;
    await systemConfigService.updateSource(source.id, {
      durtFileMakerConfig: {
        databaseFilePath: mtBeautyEventPath,
        importMode: 'import',
      },
    });
    await systemConfigService.assignSourcesToEvent(event.id, [source.id]);
    await systemConfigService.assignSourcesToSession(session.id, { mode: 'specific', sourceIds: [source.id] });

    const importedRaceState: Partial<RaceState> = await loadDurtFileMakerRaceState({
      eventId: event.id,
      executablePath: extractorPath,
      sessionId: session.id,
      sourceFilePath: mtBeautyEventPath,
      timeZone: 'Australia/Sydney',
    });
    const scaffoldCatalog = await catalogService.syncEventScaffold(event.id, importedRaceState.categories || [], importedRaceState.participants || [], [], importedRaceState.teams || [], session.id);
    const importedSession: Session = new Session({ categories: [], entries: [], participants: [], records: [], teams: [], timeRecordSources: [] });
    await applyPulledRaceStateToSession(importedSession, importedRaceState, { catalog: scaffoldCatalog, eventId: event.id, sessionId: session.id });
    await catalogService.replaceImportedRaceState(event.id, session.id, snapshotSession(importedSession));

    const catalog = catalogService.catalog;
    const importedEvent = catalog.events.find((candidate) => candidate.id === event.id)!;
    const importedSessionCatalog = catalog.sessions.find((candidate) => candidate.id === session.id)!;
    const categories = getCategoriesForEvent(catalog, event.id);
    const container: HTMLDivElement = document.createElement('div');
    document.body.append(container);
    const root: Root = createRoot(container);

    try {
      expect(systemConfigService.state.sessionSourceAssignments[session.id]?.sourceIds).toEqual([source.id]);
      expect(importedSession.participants.length).toBeGreaterThanOrEqual(116);
      expect(importedSession.categories.length).toBeGreaterThanOrEqual(4);
      expect(importedSession.teams.length).toBeGreaterThan(0);
      expect(importedSession.teams.every((team) => team.members.length > 0)).toBe(true);
      const importedEntrantIds = new Set(importedSession.participants.map((participant) => participant.entrantId));
      expect(importedEntrantIds.size).toBeLessThan(importedSession.participants.length);
      await act(async (): Promise<void> => {
        root.render(<TimingContext activeSession={importedSessionCatalog} categoryListSelected={(): void => undefined} eventTimeZone="Australia/Sydney" events={[importedEvent]} onAddRecord={(): void => undefined} onAssignFlagCategory={(): void => undefined} onChangeCategory={(): void => undefined} onEditRecord={(): void => undefined} onExclude={(): void => undefined} onMarkFlagDeleted={(): void => undefined} onRemoveFlagCategory={(): void => undefined} onSelectEvent={(): void => undefined} onSelectSession={(): void => undefined} onTimeDisplayZoneModeChange={(): void => undefined} participantSelected={(): void => undefined} raceState={importedSession} selectedCategories={new Set()} selectedParticipants={new Set()} sessions={[importedSessionCatalog]} timeDisplayZoneMode="event" timingEvent={importedEvent} timingSessionValue={session.id} />);
      });
      expect(container.querySelectorAll('tr[data-record-id]').length).toBeGreaterThan(0);

      await act(async (): Promise<void> => {
        root.render(<ResultsPage catalogEntries={getEntriesForEvent(catalog, event.id)} catalogEntrants={getEntrantsForEvent(catalog, event.id)} categories={categories} event={importedEvent} raceState={importedSession} />);
      });
      const resultsTable = container.querySelector('table[aria-label="Results Table"]') as HTMLTableElement;
      expect(resultsTable.tBodies[0]?.rows).toHaveLength(importedEntrantIds.size);
      const categorySelect = container.querySelector('select[aria-label="Race View Category"]') as HTMLSelectElement;
      await selectValue(categorySelect, categories[0]!.id);
      expect(resultsTable.tBodies[0]?.rows).toHaveLength(new Set(importedSession.participants
        .filter((participant) => participant.categoryId === categories[0]!.id)
        .map((participant) => participant.entrantId)).size);

      await act(async (): Promise<void> => {
        root.render(<ReportsPage catalogEntries={getEntriesForEvent(catalog, event.id)} catalogEntrants={getEntrantsForEvent(catalog, event.id)} categories={categories} event={importedEvent} raceState={importedSession} />);
      });
      await selectValue(container.querySelector('select[aria-label="Reports View Type"]') as HTMLSelectElement, 'lap-times');
      const participantSelect = container.querySelector('select[aria-label="Reports Participant"]') as HTMLSelectElement;
      const participantWithLaps = importedSession.participants.find((participant) => (importedSession.getParticipantLaps(participant.id) || []).some((lap) => (lap.lapNo || 0) > 0))!;
      const participantOption = Array.from(participantSelect.options).find((option) => (
        option.textContent?.includes(`${participantWithLaps.firstname} ${participantWithLaps.surname.toUpperCase()}`)
      ))!;
      await selectValue(participantSelect, participantOption.value);
      const lapTimesTable = container.querySelector('table[aria-label="Lap Times Report Table"]') as HTMLTableElement;
      expect(lapTimesTable.tBodies[0]?.rows).toHaveLength((importedSession.getParticipantLaps(participantWithLaps.id) || []).filter((lap) => (lap.lapNo || 0) > 0).length);
    } finally {
      await act(async (): Promise<void> => {
        root.unmount();
      });
      container.remove();
    }
  }, 60_000);
});
