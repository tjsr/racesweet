import { existsSync, readFileSync } from 'node:fs';

import { getCategoriesForEvent, getEntriesForEvent, getSessionsForEvent } from '../catalog/eventCatalog.js';
import { parseEntrantImportBuffer } from '../controllers/entrantImport.js';
import { isCountedLapPassing } from '../controllers/laps.js';
import { createSeedEventCatalogLedger } from '../ledger/createSeedEventCatalogLedger.js';
import type { EventCatalogLedger } from '../ledger/eventCatalogLedger.js';
import { getEffectiveParticipantCategoryId, Session, type RaceState } from '../model/racestate.js';
import { loadDorianCtcSrtCatalogForSession } from '../parsers/ctc/srtCatalogImport.js';
import { parseCtcTrackConfig } from '../parsers/ctc/trackConfig.js';
import type { EventCatalogPersistence } from '../persistence/eventCatalogPersistence.js';
import { EventCatalogService } from './eventCatalogService.js';
import { applyPulledRaceStateToSession } from './sourceApplication.js';

const INDY_DIRECTORY = 'C:/Users/tim/OneDrive/RaceTime/timing/DORIAN/INDY';
const INDY_ERF_PATH = `${INDY_DIRECTORY}/INDY500.ERF`;
const INDY_ENTRANTS_PATH = `${INDY_DIRECTORY}/entrants.xlsx`;
const INDY_TRACK_PATH = `${INDY_DIRECTORY}/TRACK.CFG`;
const maybeIndyIt = [INDY_ERF_PATH, INDY_ENTRANTS_PATH, INDY_TRACK_PATH].every(existsSync) ? it : it.skip;

const createPersistence = (initial: EventCatalogLedger): EventCatalogPersistence => {
  let ledger = initial;
  return {
    load: vi.fn(async () => ledger),
    save: vi.fn(async (nextLedger: EventCatalogLedger) => {
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

describe('INDY SRT and entrant import workflow', () => {
  maybeIndyIt('keeps event/category identity and produces category-valid Timing competitors', async () => {
    const service = await EventCatalogService.create(createPersistence(createSeedEventCatalogLedger()));
    const eventId = service.catalog.activeEventId!;
    const sessionId = service.catalog.activeSessionId!;
    await service.updateEvent(eventId, {
      date: '1991-05-26',
      discipline: 'motorsport',
      minimumLapTimeMilliseconds: 5_000,
      timeZone: 'America/Indiana/Indianapolis',
    });
    await service.createCategory(eventId);
    const indyCategoryId = getCategoriesForEvent(service.catalog, eventId)
      .find((category) => category.name === 'New Category')!.id;
    await service.updateCategory(indyCategoryId, { code: 'INDY', name: 'Indy' });

    const importedFromErf = await loadDorianCtcSrtCatalogForSession(
      INDY_ERF_PATH,
      readFileSync(INDY_ERF_PATH),
      {
        eventDate: '1991-05-26',
        eventId,
        importPlaceholderEntrantsForUnknownTransmitters: true,
        sessionId,
        timeZone: 'America/Indiana/Indianapolis',
        trackConfig: parseCtcTrackConfig(readFileSync(INDY_TRACK_PATH)),
      },
    );
    const scaffoldCatalog = await service.syncEventScaffold(
      eventId,
      importedFromErf.categories || [],
      importedFromErf.participants || [],
      [],
      importedFromErf.teams || [],
      sessionId,
    );
    const importedSession = new Session({
      categories: [],
      entries: [],
      participants: [],
      records: [],
      teams: [],
      timeRecordSources: [],
    });
    await applyPulledRaceStateToSession(importedSession, importedFromErf, {
      catalog: scaffoldCatalog,
      eventId,
      finishLineNumbers: [1, 2],
      sessionId,
    });
    await service.replaceImportedRaceState(eventId, sessionId, snapshotSession(importedSession));

    const eventIdBeforeEntrants = service.catalog.events.find((event) => event.id === eventId)!.id;
    await service.importEntrants(
      eventId,
      parseEntrantImportBuffer(readFileSync(INDY_ENTRANTS_PATH)),
      indyCategoryId,
    );

    const catalog = service.catalog;
    const persistedRaceState = service.getImportedRaceState(eventId, sessionId)!;
    const finalSession = new Session({
      categories: persistedRaceState.categories || [],
      entries: persistedRaceState.entries || [],
      participants: persistedRaceState.participants || [],
      records: persistedRaceState.records || [],
      teams: persistedRaceState.teams || [],
      timeRecordSources: persistedRaceState.timeRecordSources || [],
    });
    const sessionCategoryIds = new Set(getSessionsForEvent(catalog, eventId)
      .find((session) => session.id === sessionId)!.categoryIds);
    finalSession.setFinishLineNumbers([1, 2]);
    finalSession.setMinimumLapTimeMilliseconds(5_000);
    finalSession.setSessionValidCategoryIds(sessionCategoryIds);

    const lapCounts = finalSession.participants.map((participant) => ({
      categoryId: getEffectiveParticipantCategoryId(finalSession, participant),
      laps: (finalSession.getParticipantLaps(participant.id) || [])
        .filter((passing) => isCountedLapPassing(passing, [1, 2]))
        .at(-1)?.lapNo || 0,
      name: `${participant.firstname} ${participant.surname}`.trim(),
    }));
    const leaders = lapCounts.filter((result) => result.laps >= 190);

    expect(catalog.events.find((event) => event.id === eventId)?.id).toBe(eventIdBeforeEntrants);
    expect(getCategoriesForEvent(catalog, eventId).filter((category) => category.id === indyCategoryId)).toEqual([
      expect.objectContaining({ code: 'INDY', name: 'Indy' }),
    ]);
    expect(sessionCategoryIds).toContain(indyCategoryId);
    expect(persistedRaceState.categories).toContainEqual(expect.objectContaining({ id: indyCategoryId, name: 'Indy' }));
    expect(getEntriesForEvent(catalog, eventId)).toHaveLength(33);
    expect(finalSession.participants.every((participant) => {
      const categoryId = getEffectiveParticipantCategoryId(finalSession, participant);
      return !!categoryId && finalSession.categories.some((category) => category.id === categoryId);
    })).toBe(true);
    expect(finalSession.participants
      .filter((participant) => participant.firstname.trim() || participant.surname.trim())
      .every((participant) => getEffectiveParticipantCategoryId(finalSession, participant) === indyCategoryId)).toBe(true);
    expect(leaders.length).toBeGreaterThan(0);
    expect(Math.max(...lapCounts.map((result) => result.laps))).toBeLessThanOrEqual(200);
    expect(leaders.map((leader) => leader.name)).toEqual(expect.arrayContaining(['Rick Mears', 'Michael Andretti']));
    expect(lapCounts.find((result) => result.name === 'Rick Mears')?.laps).toBeGreaterThanOrEqual(190);
    expect(lapCounts.find((result) => result.name === 'Michael Andretti')?.laps).toBeGreaterThanOrEqual(190);
  }, 60_000);
});
