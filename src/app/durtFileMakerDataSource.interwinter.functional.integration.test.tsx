// @vitest-environment jsdom

import { existsSync } from 'node:fs';
import path from 'node:path';
import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { getCategoriesForEvent, getEntrantsForEvent, getEntriesForEvent } from '../catalog/eventCatalog.js';
import { createSeedEventCatalogLedger } from '../ledger/createSeedEventCatalogLedger.js';
import type { EventCatalogLedger } from '../ledger/eventCatalogLedger.js';
import { createEventId, createSessionId } from '../model/ids.js';
import { type RaceState, Session } from '../model/racestate.js';
import type { EventCatalogPersistence } from '../persistence/eventCatalogPersistence.js';
import { EventCatalogService } from '../service/eventCatalogService.js';
import { applyPulledRaceStateToSession } from '../service/sourceApplication.js';
import { useUiConsoleGuards } from '../testing/uiConsoleGuards.js';
import { ReportsPage, ResultsPage } from '../views/display/raceAnalyticsViews.js';
import { TimingContext } from '../views/context/Timing.js';
import { getBundledDurtFileMakerExtractorPath, loadDurtFileMakerRaceState } from './durtFileMakerDataSource.js';

const interWinterDirectory: string = 'C:/Users/tim/OneDrive/Archived Timing/2013 InterWinter Round 3';
const interWinterDatabasePath: string = path.join(interWinterDirectory, 'race event - with sectors.fmp12');
const interWinterReferencePdfPath: string = path.join(interWinterDirectory, '2013iw-sectors.pdf');
const extractorPath: string = getBundledDurtFileMakerExtractorPath();
const hasInterWinterFixture: boolean = [extractorPath, interWinterDatabasePath, interWinterReferencePdfPath].every(existsSync);

interface InspectableEventCatalogPersistence extends EventCatalogPersistence {
  getLedger: () => EventCatalogLedger;
}

const createPersistence = (initial: EventCatalogLedger): InspectableEventCatalogPersistence => {
  let ledger: EventCatalogLedger = initial;
  return {
    getLedger: (): EventCatalogLedger => ledger,
    load: vi.fn(async (): Promise<EventCatalogLedger> => ledger),
    save: vi.fn(async (nextLedger: EventCatalogLedger): Promise<void> => {
      ledger = nextLedger;
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

describe('DURT InterWinter functional import', () => {
  useUiConsoleGuards();
  const runInterWinterTest = hasInterWinterFixture ? it : it.skip;

  runInterWinterTest('hydrates Timing and renders category standings and generated lap times', async () => {
    const persistence: InspectableEventCatalogPersistence = createPersistence(createSeedEventCatalogLedger());
    const catalogService: EventCatalogService = await EventCatalogService.create(persistence);
    const eventId = catalogService.catalog.activeEventId!;
    const sessionId = catalogService.catalog.activeSessionId!;
    await catalogService.updateEvent(eventId, {
      date: '2013-08-18',
      discipline: 'cycling',
      name: '2013 InterWinter Round 3',
      timeZone: 'Australia/Sydney',
    });
    const importedRaceState: Partial<RaceState> = await loadDurtFileMakerRaceState({
      eventId: createEventId(eventId),
      executablePath: extractorPath,
      sessionId: createSessionId(sessionId),
      sourceFilePath: interWinterDatabasePath,
      timeZone: 'Australia/Sydney',
    });
    const scaffoldCatalog = await catalogService.syncEventScaffold(
      eventId,
      importedRaceState.categories || [],
      importedRaceState.participants || [],
      importedRaceState.entries || [],
      importedRaceState.teams || [],
      sessionId,
    );
    const importedSession: Session = new Session({
      categories: [],
      entries: [],
      participants: [],
      records: [],
      teams: [],
      timeRecordSources: [],
    });
    await applyPulledRaceStateToSession(importedSession, importedRaceState, {
      catalog: scaffoldCatalog,
      eventId,
      sessionId,
    });
    await catalogService.replaceImportedRaceState(eventId, sessionId, snapshotSession(importedSession));

    const catalog = catalogService.catalog;
    const event = catalog.events.find((candidate) => candidate.id === eventId)!;
    const session = catalog.sessions.find((candidate) => candidate.id === sessionId)!;
    const categories = getCategoriesForEvent(catalog, eventId);
    const catalogEntries = getEntriesForEvent(catalog, eventId);
    const catalogEntrants = getEntrantsForEvent(catalog, eventId);
    const aGrade = importedSession.categories.find((category) => category.name === 'A Grade')!;
    const aGradeRiders = importedSession.participants.filter((participant) => participant.categoryId === aGrade.id);
    const container: HTMLDivElement = document.createElement('div');
    document.body.append(container);
    const root: Root = createRoot(container);

    try {
      await act(async (): Promise<void> => {
        root.render(
          <TimingContext
            activeSession={session}
            categoryListSelected={(): void => undefined}
            eventTimeZone="Australia/Sydney"
            events={[event]}
            onAddRecord={(): void => undefined}
            onAssignFlagCategory={(): void => undefined}
            onChangeCategory={(): void => undefined}
            onEditRecord={(): void => undefined}
            onExclude={(): void => undefined}
            onMarkFlagDeleted={(): void => undefined}
            onRemoveFlagCategory={(): void => undefined}
            onSelectEvent={(): void => undefined}
            onSelectSession={(): void => undefined}
            onTimeDisplayZoneModeChange={(): void => undefined}
            participantSelected={(): void => undefined}
            raceState={importedSession}
            selectedCategories={new Set()}
            selectedParticipants={new Set()}
            sessions={[session]}
            timeDisplayZoneMode="event"
            timingEvent={event}
            timingSessionValue={sessionId}
          />,
        );
      });
      expect(container.querySelectorAll('tr[data-record-id]').length).toBeGreaterThan(0);

      await act(async (): Promise<void> => {
        root.render(
          <ResultsPage
            catalogEntries={catalogEntries}
            catalogEntrants={catalogEntrants}
            categories={categories}
            event={event}
            raceState={importedSession}
          />,
        );
      });
      const resultsTable = container.querySelector('table[aria-label="Results Table"]') as HTMLTableElement;
      expect(resultsTable.tBodies[0]?.rows).toHaveLength(importedSession.participants.length);
      const categorySelect = container.querySelector('select[aria-label="Race View Category"]') as HTMLSelectElement;
      for (const category of importedSession.categories) {
        await selectValue(categorySelect, category.id);
        const expectedRiderCount = importedSession.participants.filter((participant) => participant.categoryId === category.id).length;
        expect(resultsTable.tBodies[0]?.rows).toHaveLength(expectedRiderCount);
      }
      await selectValue(categorySelect, aGrade.id);
      const aGradeResultRows = Array.from(resultsTable.tBodies[0]!.rows).map((row) => row.textContent || '');
      expect(aGradeResultRows).toHaveLength(aGradeRiders.length);
      expect(aGradeResultRows.slice(0, 3)).toEqual([
        expect.stringContaining('Casper PETER PETERSEN'),
        expect.stringContaining('Andrew MOCK'),
        expect.stringContaining('A Grade'),
      ]);

      await act(async (): Promise<void> => {
        root.render(
          <ReportsPage
            catalogEntries={catalogEntries}
            catalogEntrants={catalogEntrants}
            categories={categories}
            event={event}
            raceState={importedSession}
          />,
        );
      });
      const reportTypeSelect = container.querySelector('select[aria-label="Reports View Type"]') as HTMLSelectElement;
      await selectValue(reportTypeSelect, 'lap-times');
      const participantSelect = container.querySelector('select[aria-label="Reports Participant"]') as HTMLSelectElement;
      const russellOption = Array.from(participantSelect.options).find((option) => option.textContent?.includes('Russell NANKERVIS'))!;
      await selectValue(participantSelect, russellOption.value);
      const lapTimesTable = container.querySelector('table[aria-label="Lap Times Report Table"]') as HTMLTableElement;
      const russell = importedSession.participants.find((participant) => participant.firstname === 'Russell' && participant.surname === 'Nankervis')!;
      const russellLaps = importedSession.getParticipantLaps(russell.id) || [];
      expect(lapTimesTable.tBodies[0]?.rows).toHaveLength(russellLaps.filter((lap) => (lap.lapNo || 0) > 0).length);
      expect(lapTimesTable.textContent).toContain('03:01:42.000');
    } finally {
      await act(async (): Promise<void> => {
        root.unmount();
      });
      container.remove();
    }
  }, 60_000);
});
