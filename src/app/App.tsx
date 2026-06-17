import './index.css';

import { type DataSourceConfig, type SystemConfiguration, createDefaultSystemConfiguration, getMasterEntrantProfilesForEvent, getSessionAssignedSourceIds } from './systemConfig.ts';
import { EventCatalogState, getCategoriesForEvent, getEntrantsForCategory, getEntrantsForEvent, getSessionsForEvent } from './eventCatalog.ts';
import { RaceStateLookup, Session } from '../model/racestate.ts';
import React, { useEffect, useState } from 'react';
import { ReportsPage, ResultsPage } from '../views/display/raceAnalyticsViews.tsx';
import { fetchApicalEvents, fetchApicalRaceStateNow, pullApicalRaceState } from './apicalDataSource.ts';

import { ApicalElectronFile } from '../testdata/apicalElectronFile.ts';
import { CategoriesPage } from '../views/display/categoriesPage.tsx';
import { CategoryList } from '../views/display/categories.tsx';
import { ElectronJsonEventCatalogPersistence } from './eventCatalogPersistence.ts';
import { ElectronJsonRaceAdminPersistence } from './raceAdminPersistence.ts';
import { ElectronJsonSystemConfigPersistence } from './systemConfigPersistence.ts';
import { EntrantsPage } from '../views/display/entrantsPage.tsx';
import { EventCatalogService } from './eventCatalogService.ts';
import { EventCategoryId } from '../model/eventcategory.ts';
import type { EventParticipantId } from '../model/eventparticipant.ts';
import type { EventTimeRecord } from '../model/timerecord.ts';
import { EventsScreen } from '../views/display/events.tsx';
import { RaceAdminService } from './raceAdminService.ts';
import { RecentRecords } from '../views/display/recent.tsx';
import { SessionsPage } from '../views/display/sessionsPage.tsx';
import { SystemConfigService } from './systemConfigService.ts';
import { SystemPage } from '../views/display/systemPage.tsx';
import { TestSession } from '../testdata/testsession.ts';
import { applyPulledRaceStateToSession } from './sourceApplication.ts';
import { formatErrorForDisplay } from './stackTrace.ts';
import { selectedCategoriesForParticipants } from './selectionState.ts';
import { updateCategorySelectionsForChangedParticipant } from './categoryChangeState.ts';

type AppSection = 'System' | 'Events' | 'Entrants' | 'Categories' | 'Sessions' | 'Timing' | 'Results' | 'Reports';
type UnsavedChangesGuard = (action: () => void | Promise<void>) => void;
type TimingSessionSelection = 'active' | 'session';

const appSections: Array<{ icon: string; id: AppSection; label: string }> = [
  { icon: 'SYS', id: 'System', label: 'System' },
  { icon: 'EVT', id: 'Events', label: 'Events' },
  { icon: 'ENT', id: 'Entrants', label: 'Entrants' },
  { icon: 'CAT', id: 'Categories', label: 'Categories' },
  { icon: 'SES', id: 'Sessions', label: 'Sessions' },
  { icon: 'TIM', id: 'Timing', label: 'Timing' },
  { icon: 'RES', id: 'Results', label: 'Results' },
  { icon: 'RPT', id: 'Reports', label: 'Reports' },
];

const loadAdminService = async (onError?: (error: unknown) => void): Promise<RaceAdminService> => {
  const apicalSession: TestSession = new ApicalElectronFile();
  const eventSession: TestSession = apicalSession; // undefined!; // rfidSession;

  const persistence = new ElectronJsonRaceAdminPersistence('../../src/generated/admin-overrides.json', onError);

  return RaceAdminService.create(async () => {
    await eventSession.loadTestData(false);
    console.log("Test data loaded successfully.");
    return eventSession as Session & RaceStateLookup;
  }, persistence);
};

const loadEventCatalogService = async (onError?: (error: unknown) => void): Promise<EventCatalogService> => {
  const persistence = new ElectronJsonEventCatalogPersistence('../../src/generated/event-catalog.json', onError);
  return EventCatalogService.create(persistence);
};

const loadSystemConfigService = async (onError?: (error: unknown) => void): Promise<SystemConfigService> => {
  const persistence = new ElectronJsonSystemConfigPersistence('../../src/generated/system-config.json', onError);
  return SystemConfigService.create(persistence);
};

const createEmptySessionState = (): Session & RaceStateLookup => {
  return new Session({
    categories: [],
    participants: [],
    records: [],
    teams: [],
  }) as Session & RaceStateLookup;
};

export const RaceSweetMainApp = () => {
  const [activeSection, setActiveSection] = useState<AppSection>('System');
  const [adminService, setAdminService] = useState<RaceAdminService|undefined>(undefined);
  const [eventCatalogService, setEventCatalogService] = useState<EventCatalogService|undefined>(undefined);
  const [eventCatalogState, setEventCatalogState] = useState<EventCatalogState|undefined>(undefined);
  const [systemConfigService, setSystemConfigService] = useState<SystemConfigService|undefined>(undefined);
  const [systemConfigState, setSystemConfigState] = useState<SystemConfiguration>(createDefaultSystemConfiguration());
  const [sessionState, setSessionState] = useState<(Session&RaceStateLookup)|undefined>(undefined);
  const [, setRenderTick] = useState(0);
  const [errorState, setErrorState] = useState<Error|undefined>(undefined);
  const [loadWarnings, setLoadWarnings] = useState<string[]>([]);
  const [selectedCategories, setCategorySelected] = useState<Set<EventCategoryId>>(new Set<EventCategoryId>());
  const [selectedCategoryId, setSelectedCategoryId] = useState<string|undefined>(undefined);
  const [selectedCategoriesEventId, setSelectedCategoriesEventId] = useState<string|undefined>(undefined);
  const [selectedEventId, setSelectedEventId] = useState<string|undefined>(undefined);
  const [selectedEntrantId, setSelectedEntrantId] = useState<string|undefined>(undefined);
  const [selectedEntrantsEventId, setSelectedEntrantsEventId] = useState<string|undefined>(undefined);
  const [recordSelectedCategories, setRecordSelectedCategories] = useState<Set<EventCategoryId>>(new Set<EventCategoryId>());
  const [recordSelectedParticipants, setRecordSelectedParticipants] = useState<Set<EventParticipantId>>(new Set<EventParticipantId>());
  const [selectedSessionsEventId, setSelectedSessionsEventId] = useState<string|undefined>(undefined);
  const [selectedSessionId, setSelectedSessionId] = useState<string|undefined>(undefined);
  const [selectedTimingEventId, setSelectedTimingEventId] = useState<string|undefined>(undefined);
  const [selectedTimingSessionId, setSelectedTimingSessionId] = useState<string|undefined>(undefined);
  const [timingRaceState, setTimingRaceState] = useState<(Session&RaceStateLookup)|undefined>(undefined);
  const [timingSessionSelection, setTimingSessionSelection] = useState<TimingSessionSelection>('active');
  const categoryUnsavedChangesGuard = React.useRef<UnsavedChangesGuard | undefined>(undefined);
  const setCategoryUnsavedChangesGuard = React.useCallback((guard: UnsavedChangesGuard | undefined): void => {
    categoryUnsavedChangesGuard.current = guard;
  }, []);

  const changeActiveSection = (section: AppSection): void => {
    if (activeSection === 'Categories' && section !== activeSection && categoryUnsavedChangesGuard.current) {
      categoryUnsavedChangesGuard.current(() => setActiveSection(section));
      return;
    }

    setActiveSection(section);
  };

  useEffect(() => {
    if (!sessionState && !eventCatalogState && !errorState) {
      const onLoadError = (error: unknown): void => {
        const message = error instanceof Error ? error.message : String(error);
        setLoadWarnings((existing) => existing.includes(message) ? existing : [...existing, message]);
      };

      Promise.all([loadAdminService(onLoadError), loadEventCatalogService(onLoadError), loadSystemConfigService(onLoadError)]).then(([raceService, catalogService, systemService]) => {
        const session = raceService.raceState;
        const initialCatalog = catalogService.catalog;
        const initialSystemConfig = systemService.state;
        const initialEventId = initialCatalog.activeEventId || initialCatalog.events[0]?.id;
        const participantCategoryIds = new Set(session.participants.map((participant) => participant.categoryId.toString()));
        const participantEntrantIds = new Set(session.participants.map((participant) => participant.entrantId.toString()));
        const catalogCategoryIds = new Set(getCategoriesForEvent(initialCatalog, initialEventId).map((category) => category.id.toString()));
        const catalogEntrantIds = new Set(getEntrantsForEvent(initialCatalog, initialEventId).map((entrant) => entrant.id.toString()));
        const expectedCategoryCount = Math.max(session.categories.length, participantCategoryIds.size, catalogCategoryIds.size);
        const missingCategoryIds = Array.from(participantCategoryIds).filter((categoryId) => !catalogCategoryIds.has(categoryId));
        const missingEntrantIds = Array.from(participantEntrantIds).filter((entrantId) => !catalogEntrantIds.has(entrantId));
        const shouldSyncScaffold = !!initialEventId && (
          getCategoriesForEvent(initialCatalog, initialEventId).length !== expectedCategoryCount || 
          (initialCatalog.events.find((event) => event.id === initialEventId)?.entrantIds.length || 0) !== participantEntrantIds.size ||
          missingCategoryIds.length > 0 ||
          missingEntrantIds.length > 0
        );

        const finalizeLoad = (catalog: EventCatalogState) => {
          const sessionList = getSessionsForEvent(catalog, initialEventId);
          const categoryList = getCategoriesForEvent(catalog, initialEventId);
          const entrantList = getEntrantsForEvent(catalog, initialEventId);
          const initialSessionId = sessionList.find((session) => session.id === catalog.activeSessionId)?.id || sessionList[0]?.id;

          setAdminService(raceService);
          setEventCatalogService(catalogService);
          setSystemConfigService(systemService);
          setSystemConfigState(initialSystemConfig);
          setSessionState(session);
          setEventCatalogState(catalog);
          setSelectedCategoriesEventId(initialEventId);
          setSelectedCategoryId(categoryList[0]?.id.toString());
          setSelectedEventId(initialEventId);
          setSelectedEntrantsEventId(initialEventId);
          setSelectedEntrantId(entrantList[0]?.id);
          setSelectedSessionsEventId(initialEventId);
          setSelectedSessionId(initialSessionId);
          setSelectedTimingEventId(initialEventId);
          setSelectedTimingSessionId(initialSessionId);
          setTimingRaceState(session);
          setErrorState(undefined);
        };

        if (shouldSyncScaffold) {
          const masterProfiles = getMasterEntrantProfilesForEvent(initialSystemConfig, initialEventId!);

          catalogService.syncEventScaffold(initialEventId!, session.categories, session.participants, masterProfiles).then((catalog) => {
            finalizeLoad(catalog);
          }).catch((error: unknown) => {
            setErrorState(error as Error);
          });
          return;
        }

        finalizeLoad(initialCatalog);
      }).catch((error: unknown) => {
        setErrorState(error as Error);
      });
    }
  }, [sessionState, eventCatalogState, errorState]);
  
  const selectEvent = (eventId: string) => {
    if (!eventCatalogState) {
      return;
    }
    setSelectedEventId(eventId);
    const nextSessions = getSessionsForEvent(eventCatalogState, eventId);
    setSelectedSessionId((current) => nextSessions.find((session) => session.id === current)?.id || nextSessions[0]?.id);
    const nextEntrants = getEntrantsForEvent(eventCatalogState, eventId);
    setSelectedEntrantId((current) => nextEntrants.find((entrant) => entrant.id === current)?.id || nextEntrants[0]?.id);
  };

  const selectSessionsEvent = (eventId: string) => {
    if (!eventCatalogState) {
      return;
    }
    setSelectedSessionsEventId(eventId);
    const nextSessions = getSessionsForEvent(eventCatalogState, eventId);
    setSelectedSessionId(nextSessions[0]?.id);
  };

  const selectCategoriesEvent = (eventId: string) => {
    if (!eventCatalogState) {
      return;
    }
    setSelectedCategoriesEventId(eventId);
    const nextCategories = getCategoriesForEvent(eventCatalogState, eventId);
    setSelectedCategoryId(nextCategories[0]?.id.toString());
  };

  const selectEntrantsEvent = (eventId: string) => {
    if (!eventCatalogState) {
      return;
    }
    setSelectedEntrantsEventId(eventId);
    const nextEntrants = getEntrantsForEvent(eventCatalogState, eventId);
    setSelectedEntrantId(nextEntrants[0]?.id);
  };

  const updateEventCatalogState = (catalog: EventCatalogState, preferredEventId?: string, preferredSessionId?: string, preferredCategoryId?: string) => {
    setEventCatalogState(catalog);
    const nextEventId = preferredEventId || catalog.activeEventId || catalog.events[0]?.id;
    const nextSessions = getSessionsForEvent(catalog, nextEventId);
    const nextCategories = getCategoriesForEvent(catalog, nextEventId);
    const activeSessionId = nextSessions.find((session) => session.id === catalog.activeSessionId)?.id;
    const nextSessionId = preferredSessionId || activeSessionId || nextSessions.find((session) => session.id === selectedSessionId)?.id || nextSessions[0]?.id;
    const nextCategoryId = preferredCategoryId || nextCategories.find((category) => category.id.toString() === selectedCategoryId)?.id?.toString() || nextCategories[0]?.id?.toString();
    const nextEntrants = getEntrantsForEvent(catalog, nextEventId);
    const nextEntrantId = nextEntrants.find((entrant) => entrant.id === selectedEntrantId)?.id || nextEntrants[0]?.id;
    setSelectedEventId(nextEventId);
    setSelectedEntrantsEventId(nextEventId);
    setSelectedEntrantId(nextEntrantId);
    setSelectedSessionsEventId(nextEventId);
    setSelectedSessionId(nextSessionId);
    setSelectedCategoriesEventId(nextEventId);
    setSelectedCategoryId(nextCategoryId);
  };

  const updateSystemConfigState = (config: SystemConfiguration) => {
    setSystemConfigState(config);
  };

  const applySourceToSessionState = async (eventId: string, source: DataSourceConfig, targetSessionState?: Session & RaceStateLookup): Promise<void> => {
    const sessionTarget = targetSessionState || sessionState;
    if (source.type !== 'api-apical-data-file' || !sessionTarget) {
      return;
    }

    const raceState = await pullApicalRaceState(source, eventId);
    await applyPulledRaceStateToSession(sessionTarget, raceState);
    setRenderTick((tick) => tick + 1);
  };

  const applySessionSources = async (
    eventId: string,
    sessionId: string,
    options?: {
      clearSelections?: boolean;
      replaceSessionState?: boolean;
      targetSessionState?: Session & RaceStateLookup;
    }
  ): Promise<(Session & RaceStateLookup) | undefined> => {
    let targetSessionState = options?.targetSessionState || sessionState;
    if (options?.replaceSessionState) {
      targetSessionState = createEmptySessionState();
      setSessionState(targetSessionState);
    }

    if (options?.clearSelections || options?.replaceSessionState) {
      setRecordSelectedParticipants(new Set<EventParticipantId>());
      setCategorySelected(new Set<EventCategoryId>());
      setRecordSelectedCategories(new Set<EventCategoryId>());
    }

    const sourceIds = getSessionAssignedSourceIds(systemConfigState, eventId, sessionId);
    const sources = systemConfigState.dataSources.filter((source) => source.enabled && sourceIds.includes(source.id));

    for (const source of sources) {
      await applySourceToSessionState(eventId, source, targetSessionState);
    }

    if (targetSessionState && adminService) {
      adminService.applyChangesToSession(targetSessionState);
    }

    return targetSessionState;
  };

  const loadTimingSession = async (eventId: string, sessionId: string): Promise<void> => {
    const targetSessionState = createEmptySessionState();
    const loadedState = await applySessionSources(eventId, sessionId, {
      clearSelections: true,
      targetSessionState,
    });
    setTimingRaceState(loadedState || targetSessionState);
    setRenderTick((tick) => tick + 1);
  };

  const selectTimingEvent = (eventId: string): void => {
    if (!eventCatalogState) {
      return;
    }

    const nextSessions = getSessionsForEvent(eventCatalogState, eventId);
    const nextSessionId = nextSessions.find((session) => session.id === selectedTimingSessionId)?.id || nextSessions[0]?.id;
    setTimingSessionSelection('session');
    setSelectedTimingEventId(eventId);
    setSelectedTimingSessionId(nextSessionId);

    if (nextSessionId) {
      loadTimingSession(eventId, nextSessionId).catch((error: unknown) => {
        setErrorState(error as Error);
      });
    }
  };

  const selectTimingSession = (sessionId: string): void => {
    if (sessionId === 'active') {
      setTimingSessionSelection('active');
      setSelectedTimingEventId(eventCatalogState?.activeEventId);
      setSelectedTimingSessionId(eventCatalogState?.activeSessionId);
      setTimingRaceState(sessionState);
      return;
    }

    const eventId = selectedTimingEventId || eventCatalogState?.activeEventId;
    if (!eventId) {
      return;
    }

    setTimingSessionSelection('session');
    setSelectedTimingSessionId(sessionId);
    loadTimingSession(eventId, sessionId).catch((error: unknown) => {
      setErrorState(error as Error);
    });
  };

  useEffect(() => {
    if (timingSessionSelection !== 'active') {
      return;
    }

    setSelectedTimingEventId(eventCatalogState?.activeEventId);
    setSelectedTimingSessionId(eventCatalogState?.activeSessionId);
    setTimingRaceState(sessionState);
  }, [eventCatalogState?.activeEventId, eventCatalogState?.activeSessionId, sessionState, timingSessionSelection]);

  useEffect(() => {
    if (!eventCatalogState || !sessionState || !selectedSessionsEventId || !selectedSessionId) {
      return;
    }

    const sourceIds = getSessionAssignedSourceIds(systemConfigState, selectedSessionsEventId, selectedSessionId);
    const liveSources = systemConfigState.dataSources.filter((source) => {
      return sourceIds.includes(source.id) &&
        source.enabled &&
        source.type === 'api-apical-data-file' &&
        !!source.apiConfig?.live;
    });

    const timers = liveSources.map((source) => {
      applySourceToSessionState(selectedSessionsEventId, source).catch((error: unknown) => {
        setErrorState(error as Error);
      });
      const intervalMs = Math.max(1, source.apiConfig!.pollIntervalSeconds) * 1000;
      return window.setInterval(() => {
        applySourceToSessionState(selectedSessionsEventId, source).catch((error: unknown) => {
          setErrorState(error as Error);
        });
      }, intervalMs);
    });

    return () => {
      timers.forEach((timer) => clearInterval(timer));
    };
  }, [eventCatalogState, selectedSessionId, selectedSessionsEventId, systemConfigState]);

  if (errorState) {
    return <>
      <h1>Error loading content</h1>
      <div className="error">
        <p>There was an error loading the content:</p>
        <pre>{formatErrorForDisplay(errorState)}</pre>
      </div>
    </>;
  }
  if (!sessionState || !eventCatalogState) {
    return <>Loading...</>;
  }

  const handleExcludeCrossing = (crossingId: string, exclude: boolean) => {
    if (!adminService) {
      return;
    }
    const targetRaceState = timingRaceState || sessionState;
    adminService.excludeCrossingForSession(targetRaceState, crossingId, exclude)
      .then(() => setRenderTick((tick) => tick + 1))
      .catch((error: unknown) => setErrorState(error as Error));
  };

  const handleChangeCategory = (participantId: string, categoryId: EventCategoryId) => {
    if (!adminService) {
      return;
    }

    const targetRaceState = timingRaceState || sessionState;
    const entrantId = targetRaceState.getEntrantIdForParticipant(participantId);
    if (!entrantId) {
      return;
    }

    adminService.updateEntrantCategoryForSession(targetRaceState, entrantId, categoryId).catch((error: unknown) => {
      setErrorState(error as Error);
    });

    const updatedSelections = updateCategorySelectionsForChangedParticipant({
      categoryId,
      participantId,
      recordSelectedCategories,
      recordSelectedParticipants,
      selectedCategories,
    });
    setCategorySelected(updatedSelections.selectedCategories);
    setRecordSelectedCategories(updatedSelections.recordSelectedCategories);
    setRecordSelectedParticipants(updatedSelections.recordSelectedParticipants);

    setRenderTick((tick) => tick + 1);
  };

  const handleParticipantSelected = (participantIds: Set<EventParticipantId>) => {
    const targetRaceState = timingRaceState || sessionState;
    const participantCategories = selectedCategoriesForParticipants(
      participantIds,
      targetRaceState.getParticipantById.bind(targetRaceState)
    );

    setRecordSelectedParticipants(participantIds);
    setCategorySelected(participantCategories);
    setRecordSelectedCategories(participantCategories);
  };

  const handleCategoryListSelected = (categoryIds: Set<EventCategoryId>) => {
    setCategorySelected(categoryIds);
    setRecordSelectedParticipants(new Set());
    setRecordSelectedCategories(new Set());
  };

  const hilightCategories = new Set<EventCategoryId>();
  if (recordSelectedCategories && recordSelectedCategories.size > 0) {
    recordSelectedCategories.forEach((categoryId: EventCategoryId) => {
      hilightCategories.add(categoryId);
    });
  }
  if (selectedCategories && selectedCategories.size > 0) {
    selectedCategories.forEach((categoryId: EventCategoryId) => {
      hilightCategories.add(categoryId);
    });
  }

  const displayedTimingRaceState = timingRaceState || sessionState;
  const timingEventId = timingSessionSelection === 'active'
    ? eventCatalogState.activeEventId
    : selectedTimingEventId || eventCatalogState.activeEventId;
  const timingEvent = eventCatalogState.events.find((event) => event.id === timingEventId) ??
    eventCatalogState.events.find((event) => event.id === eventCatalogState.activeEventId) ??
    eventCatalogState.events[0];
  const timingSessions = getSessionsForEvent(eventCatalogState, timingEvent?.id);
  const timingSessionValue = timingSessionSelection === 'active'
    ? 'active'
    : selectedTimingSessionId || timingSessions[0]?.id || '';
  const activeSession = eventCatalogState.sessions.find((session) => session.id === eventCatalogState.activeSessionId);

  const timingPage = (
    <>
      <h1>Timing</h1>
      <div className="timing-context-row">
        <label className="page-filter-label">
          Event
          <select
            aria-label="Timing Event"
            value={timingEvent?.id || ''}
            onChange={(event) => selectTimingEvent(event.target.value)}
          >
            {eventCatalogState.events.map((event) => (
              <option key={event.id} value={event.id}>{event.name}</option>
            ))}
          </select>
        </label>
        <label className="page-filter-label">
          Session
          <select
            aria-label="Timing Session"
            value={timingSessionValue}
            onChange={(event) => selectTimingSession(event.target.value)}
          >
            <option value="active">
              {activeSession ? `Active session (${activeSession.name})` : 'Active session'}
            </option>
            {timingSessions.map((session) => (
              <option key={session.id} value={session.id}>{session.name}</option>
            ))}
          </select>
        </label>
      </div>
      <CategoryList categories={displayedTimingRaceState.categories || []} categorySelected={handleCategoryListSelected} />
      <RecentRecords
        records={(displayedTimingRaceState.records as EventTimeRecord[]) || []}
        raceStateLookup={displayedTimingRaceState}
        selectedCategories={hilightCategories}
        selectedParticipants={recordSelectedParticipants}
        categorySelected={setRecordSelectedCategories}
        participantSelected={handleParticipantSelected}
        onExclude={handleExcludeCrossing}
        onChangeCategory={handleChangeCategory}
      />
    </>
  );

  const activeEvent = eventCatalogState.events.find((event) => event.id === eventCatalogState.activeEventId) ??
    eventCatalogState.events.find((event) => event.id === selectedEventId) ??
    eventCatalogState.events[0];
  const activeEventSessions = getSessionsForEvent(eventCatalogState, activeEvent?.id);
  const selectedCategoryEventId = selectedCategoriesEventId || eventCatalogState.activeEventId || eventCatalogState.events[0]?.id;
  const selectedCategoryEntrants = getEntrantsForCategory(eventCatalogState, selectedCategoryEventId, selectedCategoryId);
  const selectedResultsEventId = selectedSessionsEventId || selectedEventId || eventCatalogState.activeEventId || eventCatalogState.events[0]?.id;
  const sessionScopedCategories = (() => {
    const normalizeCategoryText = (value: string): string => value.trim().toLowerCase();
    const categorySeriesKey = (_id: string, name: string): string => normalizeCategoryText(name);
    const sessionId = selectedSessionId;
    const candidates = getCategoriesForEvent(eventCatalogState, selectedResultsEventId);
    const fromCatalog = candidates.filter((category) => {
      const assignments = category.sessionAssignments || [];
      if (assignments.length === 0) {
        return true;
      }
      return assignments.some((assignment) => !assignment.sessionId || assignment.sessionId === sessionId);
    });

    const categoriesById = new Map(fromCatalog.map((category) => [category.id.toString(), category.name]));
    sessionState.participants.forEach((participant) => {
      const categoryId = participant.categoryId.toString();
      if (!categoriesById.has(categoryId)) {
        const category = sessionState.getCategoryById(participant.categoryId);
        categoriesById.set(categoryId, category?.name || categoryId);
      }
    });

    const dedupedBySeries = new Map<string, { id: string; name: string }>();
    Array.from(categoriesById.entries()).forEach(([id, name]) => {
      const key = categorySeriesKey(id, name);
      if (!dedupedBySeries.has(key)) {
        dedupedBySeries.set(key, { id, name });
      }
    });

    return Array.from(dedupedBySeries.values());
  })();

  const sectionContent = (): React.ReactElement => {
    if (activeSection === 'Timing') {
      return timingPage;
    }

    if (activeSection === 'System') {
      return (
        <SystemPage
          config={systemConfigState}
          onCreateSource={(type) => {
            if (!systemConfigService) {
              return;
            }
            systemConfigService.createSource(type).then(updateSystemConfigState).catch((error: unknown) => setErrorState(error as Error));
          }}
          onDeleteSource={(sourceId) => {
            if (!systemConfigService) {
              return;
            }
            systemConfigService.deleteSource(sourceId).then(updateSystemConfigState).catch((error: unknown) => setErrorState(error as Error));
          }}
          onFetchApicalDataNow={(sourceId) => {
            if (!eventCatalogService || !systemConfigService) {
              return;
            }
            const source = systemConfigState.dataSources.find((item) => item.id === sourceId);
            if (!source) {
              return;
            }

            return fetchApicalRaceStateNow(source)
              .then(async (importData) => {
                const catalog = await eventCatalogService.importApicalRaceState(importData);
                updateEventCatalogState(catalog, importData.eventId, importData.sessionId);
                return systemConfigService.persistApicalDataFetch(sourceId, importData.eventId, importData.sessionId, importData.retrievedAt);
              })
              .then(updateSystemConfigState);
          }}
          onLoadApicalEvents={(sourceId) => {
            if (!systemConfigService) {
              return;
            }
            const source = systemConfigState.dataSources.find((item) => item.id === sourceId);
            if (!source) {
              return;
            }
            return fetchApicalEvents(source)
              .then((events) => systemConfigService.persistListedApicalEvents(sourceId, events))
              .then(updateSystemConfigState);
          }}
          onSaveSource={(sourceId, changes) => {
            if (!systemConfigService) {
              return;
            }
            systemConfigService.updateSource(sourceId, changes).then(updateSystemConfigState).catch((error: unknown) => setErrorState(error as Error));
          }}
          onSelectLocalFile={() => {
            return window.api.selectLocalFile({
              filters: [{ extensions: ['csv'], name: 'CSV files' }],
              title: 'Select RFID Timing CSV file',
            });
          }}
        />
      );
    }

    if (activeSection === 'Events') {
      return (
        <EventsScreen
          catalog={eventCatalogState}
          config={systemConfigState}
          onActivateEvent={(eventId) => {
            if (!eventCatalogService) {
              return;
            }
            eventCatalogService.activateEvent(eventId).then((catalog) => {
              updateEventCatalogState(catalog, eventId);
            }).catch((error: unknown) => setErrorState(error as Error));
          }}
          onCreateEvent={() => {
            if (!eventCatalogService) {
              return;
            }

            const existingEventIds = new Set(eventCatalogState.events.map((event) => event.id));
            eventCatalogService.createEvent().then((catalog) => {
              const createdEvent = catalog.events.find((event) => !existingEventIds.has(event.id));
              updateEventCatalogState(catalog, createdEvent?.id);
            }).catch((error: unknown) => setErrorState(error as Error));
          }}
          onSelectEvent={selectEvent}
          onSelectSession={setSelectedSessionId}
          onSaveEventAssignment={(eventId, sourceIds) => {
            if (!systemConfigService) {
              return;
            }
            systemConfigService.assignSourcesToEvent(eventId, sourceIds).then(updateSystemConfigState).catch((error: unknown) => setErrorState(error as Error));
          }}
          onUpdateEvent={(eventId, changes) => {
            if (!eventCatalogService) {
              return;
            }
            eventCatalogService.updateEvent(eventId, changes).then((catalog) => {
              updateEventCatalogState(catalog, eventId);
            }).catch((error: unknown) => setErrorState(error as Error));
          }}
          selectedEventId={selectedEventId}
          selectedSessionId={selectedSessionId}
        />
      );
    }

    if (activeSection === 'Sessions') {
      return (
        <SessionsPage
          catalog={eventCatalogState}
          config={systemConfigState}
          onApplySessionSources={(eventId, sessionId) => {
            applySessionSources(eventId, sessionId).catch((error: unknown) => {
              setErrorState(error as Error);
            });
          }}
          onCreateSession={(eventId) => {
            if (!eventCatalogService) {
              return;
            }
            eventCatalogService.createSession(eventId).then((catalog) => {
              const session = getSessionsForEvent(catalog, eventId).find((item) => item.name === 'New Session');
              updateEventCatalogState(catalog, eventId, session?.id, selectedCategoryId);
            }).catch((error: unknown) => setErrorState(error as Error));
          }}
          onDeleteSession={(eventId, sessionId) => {
            if (!eventCatalogService) {
              return;
            }
            eventCatalogService.deleteSession(eventId, sessionId).then((catalog) => {
              const nextSessionId = getSessionsForEvent(catalog, eventId)[0]?.id;
              updateEventCatalogState(catalog, eventId, nextSessionId, selectedCategoryId);
            }).catch((error: unknown) => setErrorState(error as Error));
          }}
          onMakeSessionActive={(eventId, sessionId) => {
            const activate = async (): Promise<void> => {
              setSelectedSessionsEventId(eventId);
              setSelectedSessionId(sessionId);
              setSelectedEventId(eventId);

              if (eventCatalogService) {
                const catalog = await eventCatalogService.activateSession(eventId, sessionId);
                updateEventCatalogState(catalog, eventId, sessionId, selectedCategoryId);
              }

              await applySessionSources(eventId, sessionId, { replaceSessionState: true });
            };

            activate().catch((error: unknown) => {
              setErrorState(error as Error);
            });
          }}
          onSelectEvent={selectSessionsEvent}
          onSaveSessionAssignment={(sessionId, mode, sourceIds) => {
            if (!systemConfigService) {
              return;
            }
            systemConfigService.assignSourcesToSession(sessionId, { mode, sourceIds }).then(updateSystemConfigState).catch((error: unknown) => setErrorState(error as Error));
          }}
          onSelectSession={setSelectedSessionId}
          onUpdateSession={(sessionId, changes) => {
            if (!eventCatalogService) {
              return;
            }
            eventCatalogService.updateSession(sessionId, changes).then((catalog) => {
              updateEventCatalogState(catalog, selectedSessionsEventId, sessionId, selectedCategoryId);
            }).catch((error: unknown) => setErrorState(error as Error));
          }}
          selectedEventId={selectedSessionsEventId}
          selectedSessionId={selectedSessionId}
        />
      );
    }

    if (activeSection === 'Categories') {
      return (
        <CategoriesPage
          catalog={eventCatalogState}
          entrants={selectedCategoryEntrants.map((entrant) => ({
            entrantId: entrant.id,
            id: entrant.id,
            name: entrant.name,
          }))}
          onCreateCategory={(eventId) => {
            if (!eventCatalogService) {
              return;
            }
            eventCatalogService.createCategory(eventId).then((catalog) => {
              const category = getCategoriesForEvent(catalog, eventId).find((item) => item.name === 'New Category');
              updateEventCatalogState(catalog, eventId, selectedSessionId, category?.id.toString());
            }).catch((error: unknown) => setErrorState(error as Error));
          }}
          onDeleteCategory={(eventId, categoryId) => {
            if (!eventCatalogService) {
              return;
            }
            eventCatalogService.deleteCategory(eventId, categoryId).then((catalog) => {
              const nextCategoryId = getCategoriesForEvent(catalog, eventId)[0]?.id.toString();
              updateEventCatalogState(catalog, eventId, selectedSessionId, nextCategoryId);
            }).catch((error: unknown) => setErrorState(error as Error));
          }}
          onSelectCategory={setSelectedCategoryId}
          onSelectEvent={selectCategoriesEvent}
          onUnsavedChangesGuardChange={setCategoryUnsavedChangesGuard}
          onUpdateCategory={(categoryId, changes) => {
            if (!eventCatalogService) {
              return;
            }

            return eventCatalogService.updateCategory(categoryId, changes).then((catalog) => {
              const activeEventId = eventCatalogState.activeEventId;
              if (selectedCategoryEventId && selectedCategoryEventId === activeEventId) {
                sessionState.updateCategoryDetails(categoryId, {
                  code: changes.code,
                  description: changes.description,
                  name: changes.name,
                });
                setRenderTick((tick) => tick + 1);
              }
              updateEventCatalogState(catalog, selectedSessionsEventId, selectedSessionId, categoryId);
            });
          }}
          selectedCategoryId={selectedCategoryId}
          selectedEventId={selectedCategoryEventId}
        />
      );
    }

    if (activeSection === 'Entrants') {
      return (
        <EntrantsPage
          catalog={eventCatalogState}
          onCreateEntrant={(eventId) => {
            if (!eventCatalogService) {
              return;
            }
            eventCatalogService.createEntrant(eventId).then((catalog) => {
              const entrant = getEntrantsForEvent(catalog, eventId).find((item) => item.name === 'New Entrant');
              updateEventCatalogState(catalog, eventId, selectedSessionId, selectedCategoryId);
              setSelectedEntrantId(entrant?.id);
            }).catch((error: unknown) => setErrorState(error as Error));
          }}
          onDeleteEntrant={(eventId, entrantId) => {
            if (!eventCatalogService) {
              return;
            }
            eventCatalogService.deleteEntrant(eventId, entrantId).then((catalog) => {
              const nextEntrantId = getEntrantsForEvent(catalog, eventId)[0]?.id;
              updateEventCatalogState(catalog, eventId, selectedSessionId, selectedCategoryId);
              setSelectedEntrantId(nextEntrantId);
            }).catch((error: unknown) => setErrorState(error as Error));
          }}
          onSelectEntrant={setSelectedEntrantId}
          onSelectEvent={selectEntrantsEvent}
          onUpdateEntrant={(entrantId, changes) => {
            if (!eventCatalogService) {
              return;
            }
            eventCatalogService.updateEntrant(entrantId, changes).then((catalog) => {
              updateEventCatalogState(catalog, selectedEntrantsEventId, selectedSessionId, selectedCategoryId);
              setSelectedEntrantId(entrantId);
            }).catch((error: unknown) => setErrorState(error as Error));
          }}
          selectedEntrantId={selectedEntrantId}
          selectedEventId={selectedEntrantsEventId}
        />
      );
    }

    if (activeSection === 'Results') {
      return (
        <ResultsPage
          categories={sessionScopedCategories}
          catalogEntrants={getEntrantsForEvent(eventCatalogState, selectedResultsEventId)}
          raceState={sessionState}
          selectedCategoryId={selectedCategoryId}
        />
      );
    }

    if (activeSection === 'Reports') {
      return (
        <ReportsPage
          categories={sessionScopedCategories}
          catalogEntrants={getEntrantsForEvent(eventCatalogState, selectedResultsEventId)}
          raceState={sessionState}
          selectedCategoryId={selectedCategoryId}
        />
      );
    }

    return (
      <section className="section-panel" aria-live="polite">
        <h1>{activeSection}</h1>
        <p>This section is currently unavailable.</p>
        <h2>Active Event</h2>
        {activeEvent ? (
          <>
            <p>{activeEvent.name} Â· {activeEvent.format} Â· {activeEvent.date}</p>
            <p>
              {activeEvent.categoryIds.length} categories, {activeEvent.entrantIds.length} entrants, {activeEventSessions.length} sessions in scope.
            </p>
          </>
        ) : (
          <p>No active event is defined.</p>
        )}
      </section>
    );
  };

  return (
    <div className="app-shell">
      {loadWarnings.length > 0 && (
        <div className="load-warnings" role="alert" aria-label="Load warnings">
          <strong>Warnings:</strong>
          <ul>
            {loadWarnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
          <button type="button" onClick={() => setLoadWarnings([])}>Dismiss</button>
        </div>
      )}
      <nav className="section-nav" aria-label="Application sections">
        {appSections.map((section) => {
          const isActive = activeSection === section.id;
          return (
            <button
              key={section.id}
              type="button"
              className={`section-tile${isActive ? ' active' : ''}`}
              onClick={() => changeActiveSection(section.id)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={section.label}
            >
              <span className="section-icon" aria-hidden="true">{section.icon}</span>
              <span className="section-label">{section.label}</span>
            </button>
          );
        })}
      </nav>
      <main className="section-content">
        {sectionContent()}
      </main>
    </div>
  );
};


