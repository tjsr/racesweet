import { Component, type ReactElement, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { validate as validateUuid } from 'uuid';
import { type EventCatalogEntrant, type EventCatalogState, getCategoriesForEvent, getEntrantsForCategory, getEntrantsForEvent, getEventDisciplineLabels, getSessionsForEvent } from '../catalog/eventCatalog.ts';
import { fetchApicalEvents } from '../controllers/apical/getResultListJson.ts';
import { CategoryId } from '../controllers/category.ts';
import { type LoadingMetricsState, getLoadingMetricsSnapshot, incrementLoadingMetric, resetLoadingMetrics, subscribeLoadingMetrics } from '../loadingMetrics.ts';
import { type LoadingProgressState, completeLoadingProgressStage, createLoadingProgressState, updateLoadingProgressStage } from '../loadingProgress.ts';
import { type EventCategory, EventCategoryId } from '../model/eventcategory.ts';
import { type EventParticipant, type EventParticipantId, type ParticipantTransponder } from '../model/eventparticipant.ts';
import type { EventTeam } from '../model/eventteam.ts';
import { EventId, SessionId } from '../model/raceevent.ts';
import { type RaceState, RaceStateLookup, Session } from '../model/racestate.ts';
import { type EventTimeRecord, type TimeRecordId } from '../model/timerecord.ts';
import { loadDorianCtcSrtCatalogForSession } from '../parsers/ctc/srtCatalogImport.ts';
import { parseCtcTrackConfig } from '../parsers/ctc/trackConfig.ts';
import { type MrScatsCatalogImport, type MrScatsCatalogLoadProgress, loadMrScatsCatalogFromLocation } from '../parsers/mrScats/catalogImport.ts';
import { listMrScatsDataFiles } from '../parsers/mrScats/fileInventory.ts';
import { previewCtcRawCrossingBuffer, previewMrScatsDataFile } from '../parsers/mrScats/filePreview.ts';
import { ElectronJsonEventCatalogPersistence } from '../persistence/eventCatalogPersistence.ts';
import { ElectronJsonRaceAdminPersistence } from '../persistence/raceAdminPersistence.ts';
import { ElectronJsonSystemConfigPersistence } from '../persistence/systemConfigPersistence.ts';
import { EventCatalogService } from '../service/eventCatalogService.ts';
import { RaceAdminService } from '../service/raceAdminService.ts';
import { type SessionSourceReloadMode, type SessionSourceReloadSummary, addSessionSourceReloadSummaries, createEmptySessionSourceReloadSummary, isMissingLinkedCategoryPlaceholder, mergePulledRaceStates, mergeRaceStateForReload, summarizeSessionSourceReload } from '../service/sessionSourceReload.ts';
import { applyPulledRaceStateToSession, getMinimumLapTimeMillisecondsForSession, getSessionAssignedCategoryIds } from '../service/sourceApplication.ts';
import { SystemConfigService } from '../service/systemConfigService.ts';
import { ApicalElectronFile } from '../testdata/apicalElectronFile.ts';
import { TestSession } from '../testdata/testsession.ts';
import { CategoriesContext } from '../views/context/Categories.tsx';
import { EntrantsContext } from '../views/context/Entrants.tsx';
import { EventsContext } from '../views/context/Events.tsx';
import { ReportsContext } from '../views/context/Reports.tsx';
import { ResultsContext } from '../views/context/Results.tsx';
import { SessionsContext } from '../views/context/Sessions.tsx';
import { SystemContext } from '../views/context/System.tsx';
import { TimingContext } from '../views/context/Timing.tsx';
import { ReloadSummaryDialog } from '../views/display/reloadSummaryDialog.tsx';
import { type UnsavedChangesGuard } from '../views/display/unsavedChangesWarning.tsx';
import { LoadingProgress } from '../views/panels/LoadingProgress.tsx';
import { PulledApicalRaceState, createApicalCatalogEventId, createApicalCatalogSessionId, fetchApicalRaceStateNow, getConfiguredApicalEventId, pullApicalRaceState } from './apicalDataSource.ts';
import { updateCategorySelectionsForChangedParticipant } from './categoryChangeState.ts';
import './index.css';
import { selectedCategoriesForParticipants } from './selectionState.ts';
import { formatErrorForDisplay } from './stackTrace.ts';
import { type DataSourceConfig, type EventTimeDisplayZoneMode, type SystemConfiguration, type TimingContextSelectionConfig, createDefaultSystemConfiguration, getFinishLineNumbersForSession, getMasterEntrantProfilesForEvent, getSessionAssignedSourceIds } from './systemConfig.ts';
import { getSystemTimeZone } from './utils/timeutils.ts';
import { type EventSessionOption } from './views/results/resultsPage.tsx';

type AppSection = 'System' | 'Events' | 'Entrants' | 'Categories' | 'Sessions' | 'Timing' | 'Results' | 'Reports';
type TimingSessionSelection = 'active' | 'session';

const createStartupLoadingProgress = (): LoadingProgressState => createLoadingProgressState('Loading RaceSweet', [
  { id: 'services', label: 'Loading generated data files', total: 3 },
  { id: 'source-metadata', label: 'Restoring source metadata', total: 1 },
  { id: 'catalog-validation', label: 'Checking event catalog links', total: 1 },
  { id: 'session-state', label: 'Preparing active session state', total: 1 },
  { id: 'scaffold', label: 'Synchronising event scaffold', total: 1 },
  { id: 'publish', label: 'Displaying application', total: 1 },
]);

interface PageErrorFallbackProps {
  error: Error;
  onDismiss?: () => void;
  title?: string;
}

interface PageErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  onError?: (error: Error) => void;
  resetKey: string;
}

interface PageErrorBoundaryState {
  error?: Error;
}

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

interface DisplayedErrorLogEntry {
  details: string;
  id: string;
  source: string;
  timestamp: string;
}

const PageErrorFallback = ({ error, onDismiss, title = 'Error loading content' }: PageErrorFallbackProps): ReactElement => (
  <>
    <h1>{title}</h1>
    <div className="error" role="alert">
      <p>There was an error loading the content:</p>
      <pre>{formatErrorForDisplay(error)}</pre>
      {onDismiss ? (
        <button type="button" onClick={onDismiss}>
          Dismiss
        </button>
      ) : null}
    </div>
  </>
);

class PageErrorBoundary extends Component<PageErrorBoundaryProps, PageErrorBoundaryState> {
  public state: PageErrorBoundaryState = {};

  public static getDerivedStateFromError(error: Error): PageErrorBoundaryState {
    return { error };
  }

  public componentDidCatch(error: Error): void {
    this.props.onError?.(error);
  }

  public componentDidUpdate(previousProps: PageErrorBoundaryProps): void {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: undefined });
    }
  }

  public render(): ReactNode {
    if (this.state.error) {
      return <PageErrorFallback error={this.state.error} title={this.props.fallbackTitle} />;
    }

    return this.props.children;
  }
}

const loadAdminService = async (onError?: (error: unknown) => void): Promise<RaceAdminService> => {
  incrementLoadingMetric('Create admin service');
  const apicalSession: TestSession = new ApicalElectronFile();
  const eventSession: TestSession = apicalSession; // undefined!; // rfidSession;

  const persistence = new ElectronJsonRaceAdminPersistence('../../src/generated/admin-overrides.json', onError);

  return RaceAdminService.create(async () => {
    incrementLoadingMetric('Load startup test data');
    await eventSession.loadTestData(false);
    console.log("Test data loaded successfully.");
    return eventSession as Session & RaceStateLookup;
  }, persistence);
};

const loadEventCatalogService = async (onError?: (error: unknown) => void): Promise<EventCatalogService> => {
  incrementLoadingMetric('Create event catalog service');
  const persistence = new ElectronJsonEventCatalogPersistence('../../src/generated/event-catalog.json', onError);
  return EventCatalogService.create(persistence);
};

const loadSystemConfigService = async (onError?: (error: unknown) => void): Promise<SystemConfigService> => {
  incrementLoadingMetric('Create system config service');
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

const getImportedApicalDataFilePath = (
  config: SystemConfiguration,
  eventCatalogService: EventCatalogService,
  source: DataSourceConfig
): string | undefined => {
  const candidateEventIds = new Set<string>();
  const candidateSessionIds = new Set<string>();
  const apicalEventId = source.apiConfig?.selectedEventIds[0] || source.apiConfig?.apicalEventId;

  Object.entries(config.eventSourceAssignments).forEach(([eventId, sourceIds]) => {
    if (sourceIds.includes(source.id)) {
      candidateEventIds.add(eventId);
    }
  });

  Object.entries(config.sessionSourceAssignments).forEach(([sessionId, assignment]) => {
    if (assignment.sourceIds.includes(source.id)) {
      candidateSessionIds.add(sessionId);
    }
  });

  if (apicalEventId) {
    candidateEventIds.add(createApicalCatalogEventId(apicalEventId));
    candidateSessionIds.add(createApicalCatalogSessionId(apicalEventId));
  }

  for (const eventId of candidateEventIds) {
    for (const sessionId of candidateSessionIds) {
      const apicalDataFilePath = eventCatalogService.getImportedRaceStateMetadata(eventId, sessionId)?.apicalDataFilePath;
      if (apicalDataFilePath) {
        return apicalDataFilePath;
      }
    }
  }

  return undefined;
};

const loadSystemConfigWithImportedApicalPaths = async (
  systemConfigService: SystemConfigService,
  eventCatalogService: EventCatalogService
): Promise<SystemConfiguration> => {
  const sourceFilePaths: Record<string, string | undefined> = {};

  systemConfigService.state.dataSources.forEach((source) => {
    if ((source.type !== 'api-apical-data-file' && source.type !== 'api-apical-excel-file') || source.apicalDataFilePath || !source.dataLastRetrieved) {
      return;
    }

    sourceFilePaths[source.id] = getImportedApicalDataFilePath(systemConfigService.state, eventCatalogService, source);
  });

  return systemConfigService.persistApicalDataFilePaths(sourceFilePaths);
};

const raceStateSnapshot = (raceState: RaceState): RaceState => ({
  categories: [...raceState.categories],
  eventStartTime: raceState.eventStartTime,
  participants: [...raceState.participants],
  records: [...raceState.records],
  teams: [...raceState.teams],
  timeRecordSources: [...(raceState.timeRecordSources || [])],
});

const sessionFromPartialRaceState = (raceState: Partial<RaceState>): Session => new Session({
  categories: raceState.categories || [],
  eventStartTime: raceState.eventStartTime,
  participants: raceState.participants || [],
  records: raceState.records || [],
  teams: raceState.teams || [],
  timeRecordSources: raceState.timeRecordSources || [],
});

const applyCatalogSessionScopeToRaceState = (
  raceState: (Session & RaceStateLookup) | undefined,
  catalog: EventCatalogState,
  eventId: EventId | undefined,
  sessionId: SessionId | undefined
): void => {
  if (!raceState || !eventId || !sessionId) {
    return;
  }

  raceState.setMinimumLapTimeMilliseconds?.(getMinimumLapTimeMillisecondsForSession(catalog, eventId, sessionId));
  raceState.setSessionValidCategoryIds?.(getSessionAssignedCategoryIds(catalog, eventId, sessionId));
};

const filterMrScatsRaceStateForSession = (
  raceState: Partial<RaceState>,
  sessionId: SessionId,
  categoryIds: string[]
): Partial<RaceState> => {
  const categoryIdSet = new Set(categoryIds);
  return {
    ...raceState,
    categories: (raceState.categories || []).filter((category) => categoryIdSet.has(category.id.toString())),
    participants: (raceState.participants || []).filter((participant) => categoryIdSet.has(participant.categoryId.toString())),
    records: (raceState.records || []).filter((record) => {
      const recordSessionId = (record as EventTimeRecord).sessionId?.toString();
      return !recordSessionId || recordSessionId === sessionId.toString();
    }),
    teams: raceState.teams || [],
    timeRecordSources: raceState.timeRecordSources || [],
  };
};

const createParticipantFromEntrant = (
  entrant: EventCatalogEntrant,
  participantId: EventParticipantId
): EventParticipant => ({
  categoryId: entrant.categoryId || entrant.categoryIds[0] || '',
  currentResult: undefined,
  entrantId: entrant.id,
  firstname: entrant.firstName || entrant.name,
  id: participantId,
  identifiers: [...(entrant.identifiers || [])],
  lastRecordTime: null,
  resultDuration: null,
  surname: entrant.lastName || '',
});

const sortSessionsByScheduledStart = (
  sessions: EventCatalogState['sessions']
): EventCatalogState['sessions'] => {
  return [...sessions].sort((left, right) => {
    const leftTime = Date.parse(left.scheduledStart);
    const rightTime = Date.parse(right.scheduledStart);
    const leftHasValidTime = Number.isFinite(leftTime);
    const rightHasValidTime = Number.isFinite(rightTime);

    if (leftHasValidTime && rightHasValidTime && leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    if (leftHasValidTime !== rightHasValidTime) {
      return leftHasValidTime ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
};

const resolveTimingContextSelection = (
  catalog: EventCatalogState,
  savedSelection: TimingContextSelectionConfig | undefined
): {
  eventId: EventId | undefined;
  selectionMode: TimingSessionSelection;
  sessionId: SessionId | undefined;
} => {
  if (savedSelection?.selectionMode === 'session' && savedSelection.eventId) {
    const savedEvent = catalog.events.find((event) => event.id === savedSelection.eventId);
    if (savedEvent) {
      const sessions = sortSessionsByScheduledStart(getSessionsForEvent(catalog, savedEvent.id));
      const sessionId = sessions.find((session) => session.id === savedSelection.sessionId)?.id ?? sessions[0]?.id;
      return {
        eventId: savedEvent.id,
        selectionMode: 'session',
        sessionId,
      };
    }
  }

  return {
    eventId: catalog.activeEventId || catalog.events[0]?.id,
    selectionMode: 'active',
    sessionId: catalog.activeSessionId,
  };
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
  const [displayedErrorLogEntries, setDisplayedErrorLogEntries] = useState<DisplayedErrorLogEntry[]>([]);
  const [loadingMetrics, setLoadingMetrics] = useState<LoadingMetricsState>(getLoadingMetricsSnapshot);
  const [loadingProgress, setLoadingProgress] = useState<LoadingProgressState>(createStartupLoadingProgress);
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
  const [selectedAnalyticsEventId, setSelectedAnalyticsEventId] = useState<string|undefined>(undefined);
  const [selectedAnalyticsSessionId, setSelectedAnalyticsSessionId] = useState<string|undefined>(undefined);
  const [analyticsRaceState, setAnalyticsRaceState] = useState<(Session&RaceStateLookup)|undefined>(undefined);
  const [timingRaceState, setTimingRaceState] = useState<(Session&RaceStateLookup)|undefined>(undefined);
  const [timingSessionSelection, setTimingSessionSelection] = useState<TimingSessionSelection>('active');
  const [timingSelectionLoading, setTimingSelectionLoading] = useState<boolean>(false);
  const [timingErrorState, setTimingErrorState] = useState<Error|undefined>(undefined);
  const [reloadSummary, setReloadSummary] = useState<SessionSourceReloadSummary|undefined>(undefined);
  const initialTimingSelectionHydrated = useRef<boolean>(false);
  const unsavedChangesGuards = useRef<Partial<Record<AppSection, UnsavedChangesGuard>>>({});
  const setUnsavedChangesGuard = useCallback((section: AppSection, guard: UnsavedChangesGuard | undefined): void => {
    unsavedChangesGuards.current[section] = guard;
  }, []);

  const logDisplayedError = useCallback((source: string, error: unknown): void => {
    const timestamp = new Date().toISOString();
    setDisplayedErrorLogEntries((current) => [
      ...current,
      {
        details: formatErrorForDisplay(error),
        id: `${timestamp}-${current.length}`,
        source,
        timestamp,
      },
    ]);
  }, []);

  const persistTimingContextSelection = useCallback((
    selection: TimingContextSelectionConfig
  ): void => {
    if (!systemConfigService) {
      return;
    }

    systemConfigService.updateTimingContextSelection(selection)
      .then(setSystemConfigState)
      .catch((error: unknown) => setErrorState(error as Error));
  }, [systemConfigService]);

  useEffect(() => {
    return subscribeLoadingMetrics(() => {
      setLoadingMetrics(getLoadingMetricsSnapshot());
    });
  }, []);

  const dismissDisplayedErrors = useCallback((): void => {
    setErrorState(undefined);
    setTimingErrorState(undefined);
  }, []);

  const displayedErrorLogText = useMemo((): string => {
    return displayedErrorLogEntries.map((entry) => {
      return `[${entry.timestamp}] ${entry.source}\n${entry.details}`;
    }).join('\n\n');
  }, [displayedErrorLogEntries]);

  const changeActiveSection = (section: AppSection): void => {
    const activateSection = (): void => {
      dismissDisplayedErrors();
      setActiveSection(section);
    };
    const activeGuard = unsavedChangesGuards.current[activeSection];
    if (section !== activeSection && activeGuard) {
      activeGuard(activateSection);
      return;
    }

    activateSection();
  };

  useEffect(() => {
    if (errorState) {
      logDisplayedError('Application', errorState);
    }
  }, [errorState, logDisplayedError]);

  useEffect(() => {
    if (timingErrorState) {
      logDisplayedError('Timing', timingErrorState);
    }
  }, [timingErrorState, logDisplayedError]);

  useEffect(() => {
    if (!sessionState && !eventCatalogState && !errorState) {
      const onLoadError = (error: unknown): void => {
        const message = error instanceof Error ? error.message : String(error);
        setLoadWarnings((existing) => existing.includes(message) ? existing : [...existing, message]);
      };

      resetLoadingMetrics();
      setLoadingProgress(createStartupLoadingProgress());
      let loadedServiceCount = 0;
      const updateProgressStage = (
        stageId: string,
        total: number,
        completed: number,
        active: boolean = true
      ): void => {
        incrementLoadingMetric(`Startup stage: ${stageId}`, `${completed}/${total}`);
        setLoadingProgress((current) => updateLoadingProgressStage(current, stageId, {
          active,
          completed,
          total,
        }));
      };
      const completeProgressStage = (stageId: string): void => {
        incrementLoadingMetric(`Complete startup stage: ${stageId}`);
        setLoadingProgress((current) => completeLoadingProgressStage(current, stageId));
      };
      const markServiceLoaded = (): void => {
        loadedServiceCount += 1;
        incrementLoadingMetric('Startup service loaded', `${loadedServiceCount}/3`);
        updateProgressStage('services', 3, loadedServiceCount);
      };
      const adminServicePromise = loadAdminService(onLoadError).then((service) => {
        markServiceLoaded();
        return service;
      });
      const catalogServicePromise = loadEventCatalogService(onLoadError).then((service) => {
        markServiceLoaded();
        return service;
      });
      const systemServicePromise = loadSystemConfigService(onLoadError).then((service) => {
        markServiceLoaded();
        return service;
      });

      Promise.all([adminServicePromise, catalogServicePromise, systemServicePromise]).then(async ([raceService, catalogService, systemService]) => {
        completeProgressStage('services');
        const initialCatalog = catalogService.catalog;
        updateProgressStage('source-metadata', Math.max(1, systemService.state.dataSources.length), 0);
        const initialSystemConfig = await loadSystemConfigWithImportedApicalPaths(systemService, catalogService);
        updateProgressStage('source-metadata', Math.max(1, initialSystemConfig.dataSources.length), initialSystemConfig.dataSources.length);
        const initialEventId: EventId = initialCatalog.activeEventId || initialCatalog.events[0]?.id;
        if (!validateUuid(initialEventId)) {
          throw new Error(`Invalid initial event ID in catalog: ${initialEventId}`);
        };
        const initialSessionId = getSessionsForEvent(initialCatalog, initialEventId)
          .find((session) => session.id === initialCatalog.activeSessionId)?.id ||
          getSessionsForEvent(initialCatalog, initialEventId)[0]?.id;
        const persistedInitialRaceState = initialSessionId
          ? catalogService.getImportedRaceState(initialEventId, initialSessionId)
          : undefined;
        const session = persistedInitialRaceState
          ? sessionFromPartialRaceState(persistedInitialRaceState)
          : raceService.raceState;
        const catalogValidationTotal = Math.max(1, initialCatalog.events.length + session.participants.length + 4);
        let catalogValidationCompleted = 0;
        initialCatalog.events.forEach((event) => {
          incrementLoadingMetric('Validate catalog event', event.name);
          if (!validateUuid(event.id)) {
            throw new Error(`Invalid event ID in catalog: ${event.id}`);
          }
          catalogValidationCompleted += 1;
          updateProgressStage('catalog-validation', catalogValidationTotal, catalogValidationCompleted);
        });
        const participantCategoryIds = new Set(session.participants.map((participant) => participant.categoryId.toString()));
        session.participants.forEach((participant) => incrementLoadingMetric('Read startup participant category', participant.id.toString()));
        catalogValidationCompleted += session.participants.length;
        updateProgressStage('catalog-validation', catalogValidationTotal, catalogValidationCompleted);
        const participantEntrantIds = new Set(session.participants.map((participant) => participant.entrantId.toString()));
        const catalogCategoryIds = new Set(getCategoriesForEvent(initialCatalog, initialEventId).map((category) => category.id.toString()));
        catalogValidationCompleted += 1;
        updateProgressStage('catalog-validation', catalogValidationTotal, catalogValidationCompleted);
        const catalogEntrantIds = new Set(getEntrantsForEvent(initialCatalog, initialEventId).map((entrant) => entrant.id.toString()));
        catalogValidationCompleted += 1;
        updateProgressStage('catalog-validation', catalogValidationTotal, catalogValidationCompleted);
        const expectedCategoryCount = Math.max(session.categories.length, participantCategoryIds.size, catalogCategoryIds.size);
        const missingCategoryIds = Array.from(participantCategoryIds).filter((categoryId) => !catalogCategoryIds.has(categoryId));
        catalogValidationCompleted += 1;
        updateProgressStage('catalog-validation', catalogValidationTotal, catalogValidationCompleted);
        const missingEntrantIds = Array.from(participantEntrantIds).filter((entrantId) => !catalogEntrantIds.has(entrantId));
        catalogValidationCompleted += 1;
        updateProgressStage('catalog-validation', catalogValidationTotal, catalogValidationTotal);
        const shouldSyncScaffold = !persistedInitialRaceState && !!initialEventId && (
          getCategoriesForEvent(initialCatalog, initialEventId).length !== expectedCategoryCount || 
          (initialCatalog.events.find((event) => event.id === initialEventId)?.entrantIds.length || 0) !== participantEntrantIds.size ||
          missingCategoryIds.length > 0 ||
          missingEntrantIds.length > 0
        );

        const finalizeLoad = async (catalog: EventCatalogState): Promise<void> => {
          incrementLoadingMetric('Finalize startup catalog');
          const sessionList = getSessionsForEvent(catalog, initialEventId);
          const categoryList = getCategoriesForEvent(catalog, initialEventId);
          const entrantList = getEntrantsForEvent(catalog, initialEventId);
          const selectedInitialSessionId = sessionList.find((session) => session.id === catalog.activeSessionId)?.id || sessionList[0]?.id;

          const sessionPreparationTotal = Math.max(1, session.categories.length + session.participants.length + session.records.length);
          updateProgressStage('session-state', sessionPreparationTotal, 0);
          if (selectedInitialSessionId) {
            incrementLoadingMetric('Apply admin changes to startup session', selectedInitialSessionId);
            await raceService.applyChangesToSessionById(session, selectedInitialSessionId);
          }
          updateProgressStage('session-state', sessionPreparationTotal, sessionPreparationTotal);
          updateProgressStage('publish', 1, 0);
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
          setSelectedSessionId(selectedInitialSessionId);
          const restoredTimingSelection = resolveTimingContextSelection(catalog, initialSystemConfig.timingContextSelection);
          setTimingSessionSelection(restoredTimingSelection.selectionMode);
          setSelectedTimingEventId(restoredTimingSelection.eventId);
          setSelectedTimingSessionId(restoredTimingSelection.sessionId);
          setSelectedAnalyticsEventId(initialEventId);
          setSelectedAnalyticsSessionId(selectedInitialSessionId);
          setAnalyticsRaceState(session);
          setTimingRaceState(restoredTimingSelection.selectionMode === 'active' ? session : createEmptySessionState());
          initialTimingSelectionHydrated.current = restoredTimingSelection.selectionMode === 'active';
          setErrorState(undefined);
          updateProgressStage('publish', 1, 1);
        };

        if (shouldSyncScaffold) {
          const masterProfiles = getMasterEntrantProfilesForEvent(initialSystemConfig, initialEventId!);
          const scaffoldTotal = Math.max(1, session.categories.length + session.participants.length + masterProfiles.length);
          updateProgressStage('scaffold', scaffoldTotal, 0);

          catalogService.syncEventScaffold(initialEventId!, session.categories, session.participants, masterProfiles).then(async (catalog) => {
            incrementLoadingMetric('Startup scaffold synced', initialEventId);
            updateProgressStage('scaffold', scaffoldTotal, scaffoldTotal);
            await finalizeLoad(catalog);
          }).catch((error: unknown) => {
            setErrorState(error as Error);
          });
          return;
        }

        updateProgressStage('scaffold', 1, 1);
        await finalizeLoad(initialCatalog);
      }).catch((error: unknown) => {
        setErrorState(error as Error);
      });
    }
  }, [sessionState, eventCatalogState, errorState]);
  
  const selectEvent = (eventId: EventId) => {
    if (!eventCatalogState) {
      return;
    }
    setSelectedEventId(eventId);
    const nextSessions = getSessionsForEvent(eventCatalogState, eventId);
    setSelectedSessionId((current) => nextSessions.find((session) => session.id === current)?.id || nextSessions[0]?.id);
    const nextEntrants = getEntrantsForEvent(eventCatalogState, eventId);
    setSelectedEntrantId((current) => nextEntrants.find((entrant) => entrant.id === current)?.id || nextEntrants[0]?.id);
  };

  const selectSessionsEvent = (eventId: EventId) => {
    if (!eventCatalogState) {
      return;
    }
    setSelectedSessionsEventId(eventId);
    const nextSessions = getSessionsForEvent(eventCatalogState, eventId);
    setSelectedSessionId(nextSessions[0]?.id);
  };

  const selectCategoriesEvent = (eventId: EventId) => {
    if (!eventCatalogState) {
      return;
    }
    setSelectedCategoriesEventId(eventId);
    const nextCategories = getCategoriesForEvent(eventCatalogState, eventId);
    setSelectedCategoryId(nextCategories[0]?.id.toString());
  };

  const selectEntrantsEvent = (eventId: EventId) => {
    if (!eventCatalogState) {
      return;
    }
    setSelectedEntrantsEventId(eventId);
    const nextEntrants = getEntrantsForEvent(eventCatalogState, eventId);
    setSelectedEntrantId(nextEntrants[0]?.id);
  };

  const updateEventCatalogState = (catalog: EventCatalogState, preferredEventId?: EventId, preferredSessionId?: SessionId, preferredCategoryId?: CategoryId) => {
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
    setSelectedAnalyticsEventId(nextEventId);
    setSelectedAnalyticsSessionId(nextSessionId);
    applyCatalogSessionScopeToRaceState(sessionState, catalog, catalog.activeEventId, catalog.activeSessionId);
    applyCatalogSessionScopeToRaceState(timingRaceState, catalog, selectedTimingEventId, selectedTimingSessionId);
    applyCatalogSessionScopeToRaceState(analyticsRaceState, catalog, selectedAnalyticsEventId, selectedAnalyticsSessionId);
    if (nextEventId === catalog.activeEventId && nextSessionId === catalog.activeSessionId) {
      setAnalyticsRaceState(sessionState);
    }
  };

  const updateSystemConfigState = (config: SystemConfiguration) => {
    setSystemConfigState(config);
  };

  const getEventTimeZone = (eventId: EventId | undefined): string => {
    const event = eventCatalogState?.events.find((item) => item.id === eventId);
    return event?.timeZone || getSystemTimeZone();
  };

  const applySourceToSessionState = async (
    eventId: EventId,
    source: DataSourceConfig,
    targetSessionState?: Session & RaceStateLookup,
    options: { cachedSpreadsheetOnly?: boolean; preferCachedSpreadsheet?: boolean; sessionId?: SessionId } = {}
  ): Promise<void> => {
    if (!validateUuid(eventId)) {
      throw new Error(`Invalid eventId provided: ${eventId}`);
    }
    const sessionTarget = targetSessionState || sessionState;
    
    if ((source.type !== 'api-apical-data-file' && source.type !== 'api-apical-excel-file') || !sessionTarget) {
      return;
    }

    const raceState = await pullApicalRaceState(source, eventId, {
      cachedSpreadsheetOnly: options.cachedSpreadsheetOnly,
      localStorageDirectoryPath: systemConfigState.localStorageDirectoryPath,
      preferCachedSpreadsheet: options.preferCachedSpreadsheet,
      timeZone: getEventTimeZone(eventId),
    });
    await applyPulledRaceStateToSession(sessionTarget, raceState, {
      catalog: eventCatalogService?.catalog || eventCatalogState,
      eventId,
      finishLineNumbers: options.sessionId ? getFinishLineNumbersForSession(systemConfigState, eventId, options.sessionId) : undefined,
      sessionId: options.sessionId,
    });
    if (!targetSessionState) {
      setRenderTick((tick) => tick + 1);
    }
  };

  const applyPersistedRaceStateToSession = async (eventId: EventId, sessionId: SessionId, targetSessionState: Session & RaceStateLookup): Promise<boolean> => {
    const raceState = eventCatalogService?.getImportedRaceState(eventId, sessionId);
    if (!raceState) {
      return false;
    }

    await applyPulledRaceStateToSession(targetSessionState, raceState, {
      catalog: eventCatalogService?.catalog || eventCatalogState,
      eventId,
      finishLineNumbers: getFinishLineNumbersForSession(systemConfigState, eventId, sessionId),
      sessionId,
    });
    return true;
  };

  const applyPersistedRaceStateForSourceToSession = async (source: DataSourceConfig, targetSessionState: Session & RaceStateLookup): Promise<boolean> => {
    if (source.type !== 'api-apical-data-file' && source.type !== 'api-apical-excel-file') {
      return false;
    }

    const apicalEventId = getConfiguredApicalEventId(source);
    if (!apicalEventId) {
      return false;
    }

    return applyPersistedRaceStateToSession(
      createApicalCatalogEventId(apicalEventId),
      createApicalCatalogSessionId(apicalEventId),
      targetSessionState
    );
  };

  const applySessionSources = async (
    eventId: EventId,
    sessionId: SessionId,
    options?: {
      cachedSpreadsheetOnly?: boolean;
      clearSelections?: boolean;
      preferCachedSpreadsheet?: boolean;
      preferPersistedRaceState?: boolean;
      replaceSessionState?: boolean;
      targetSessionState?: Session & RaceStateLookup;
    }
  ): Promise<(Session & RaceStateLookup) | undefined> => {
    if (!validateUuid(eventId)) {
      throw new Error(`Invalid eventId provided: ${eventId}`);
    }
    if (!validateUuid(sessionId)) {
      throw new Error(`Invalid sessionId provided: ${sessionId}`);
    }
    let targetSessionState = options?.targetSessionState || sessionState;
    if (options?.replaceSessionState) {
      targetSessionState = createEmptySessionState();
    }

    if (options?.clearSelections || options?.replaceSessionState) {
      setRecordSelectedParticipants(new Set<EventParticipantId>());
      setCategorySelected(new Set<EventCategoryId>());
      setRecordSelectedCategories(new Set<EventCategoryId>());
    }

    const sourceIds = getSessionAssignedSourceIds(systemConfigState, eventId, sessionId);
    const sources = systemConfigState.dataSources.filter((source) => source.enabled && sourceIds.includes(source.id));

    if (targetSessionState && options?.preferPersistedRaceState) {
      const loadedPersistedState = await applyPersistedRaceStateToSession(eventId, sessionId, targetSessionState);
      if (loadedPersistedState) {
        if (adminService) {
          await adminService.applyChangesToSessionById(targetSessionState, sessionId);
        }
        if (options?.replaceSessionState) {
          setSessionState(targetSessionState);
        }
        return targetSessionState;
      }

      for (const source of sources) {
        const loadedSourcePersistedState = await applyPersistedRaceStateForSourceToSession(source, targetSessionState);
        if (loadedSourcePersistedState) {
          if (adminService) {
            await adminService.applyChangesToSessionById(targetSessionState, sessionId);
          }
          if (options?.replaceSessionState) {
            setSessionState(targetSessionState);
          }
          return targetSessionState;
        }
      }
    }

    for (const source of sources) {
      await applySourceToSessionState(eventId, source, targetSessionState, {
        cachedSpreadsheetOnly: options?.cachedSpreadsheetOnly,
        preferCachedSpreadsheet: options?.preferCachedSpreadsheet,
        sessionId,
      });
    }

    if (targetSessionState && adminService) {
      await adminService.applyChangesToSessionById(targetSessionState, sessionId);
    }

    if (targetSessionState && options?.replaceSessionState) {
      setSessionState(targetSessionState);
    }

    return targetSessionState;
  };

  const pullAssignedSessionSourceRaceState = async (eventId: EventId, sessionId: SessionId): Promise<Partial<RaceState>> => {
    const sourceIds = getSessionAssignedSourceIds(systemConfigState, eventId, sessionId);
    const sources = systemConfigState.dataSources.filter((source) => source.enabled && sourceIds.includes(source.id));
    const pulledRaceStates: Partial<RaceState>[] = [];

    for (const source of sources) {
      if (source.type === 'file-mr-scats-data') {
        const locationPath = source.mrScatsConfig?.dataLocationPath;
        if (!locationPath) {
          continue;
        }

        const mrScatsImport = await loadMrScatsCatalogFromLocation(locationPath, {
          ignoreLineOneNo1CrossingsWhenDbfPresent: source.mrScatsConfig?.ignoreLineOneNo1CrossingsWhenDbfPresent,
        });
        const importedSession = mrScatsImport.sessions.find((session) => session.id === sessionId);
        if (importedSession) {
          pulledRaceStates.push(filterMrScatsRaceStateForSession(
            mrScatsImport.raceState,
            sessionId,
            importedSession.categoryIds
          ));
        }
        continue;
      }

      if (source.type !== 'api-apical-data-file' && source.type !== 'api-apical-excel-file') {
        continue;
      }

      pulledRaceStates.push(await pullApicalRaceState(source, eventId, {
        localStorageDirectoryPath: systemConfigState.localStorageDirectoryPath,
        timeZone: getEventTimeZone(eventId),
      }));
    }

    return mergePulledRaceStates(pulledRaceStates);
  };

  const reloadSessionSources = async (eventId: EventId, sessionId: SessionId, mode: SessionSourceReloadMode): Promise<SessionSourceReloadSummary | undefined> => {
    if (!validateUuid(eventId)) {
      throw new Error(`Invalid eventId provided: ${eventId}`);
    }
    if (!validateUuid(sessionId)) {
      throw new Error(`Invalid sessionId provided: ${sessionId}`);
    }
    if (!eventCatalogService) {
      return undefined;
    }

    const pulledRaceState = await pullAssignedSessionSourceRaceState(eventId, sessionId);
    const existingRaceState = eventCatalogService.getImportedRaceState(eventId, sessionId);
    const eventCategories = getCategoriesForEvent(eventCatalogService.catalog, eventId);
    const eventSessions = getSessionsForEvent(eventCatalogService.catalog, eventId);
    const eventCategoryIds = new Set(eventCategories.map((category) => category.id.toString()));
    const categoryIdsAssignedToSessions = new Set(eventSessions
      .flatMap((session) => session.categoryIds || [])
      .filter((categoryId) => eventCategoryIds.has(categoryId.toString()))
      .map((categoryId) => categoryId.toString()));
    const nextRaceState = mergeRaceStateForReload(existingRaceState, pulledRaceState, mode, {
      categoryIdsAssignedToSessions,
      pruneEmptyReloadEntities: true,
    });
    const reloadSummary = summarizeSessionSourceReload(existingRaceState, nextRaceState, mode);
    const missingCategoryWarnings = (nextRaceState.categories || [])
      .filter((category) => isMissingLinkedCategoryPlaceholder(category))
      .map((category) => category.description || `${category.name} could not be found.`);
    const catalog = await eventCatalogService.reloadImportedRaceState(
      eventId,
      sessionId,
      nextRaceState,
      eventCatalogService.getImportedRaceStateMetadata(eventId, sessionId)?.apicalDataFilePath,
      getMasterEntrantProfilesForEvent(systemConfigState, eventId)
    );
    const targetSessionState = createEmptySessionState();
    await applyPulledRaceStateToSession(targetSessionState, nextRaceState, {
      catalog: eventCatalogService.catalog,
      eventId,
      finishLineNumbers: getFinishLineNumbersForSession(systemConfigState, eventId, sessionId),
      sessionId,
    });
    await adminService?.applyChangesToSessionById(targetSessionState, sessionId);

    if (eventCatalogState?.activeEventId === eventId && eventCatalogState.activeSessionId === sessionId) {
      setSessionState(targetSessionState);
    }
    if (selectedTimingEventId === eventId && selectedTimingSessionId === sessionId) {
      setTimingRaceState(targetSessionState);
    }
    if (selectedAnalyticsEventId === eventId && selectedAnalyticsSessionId === sessionId) {
      setAnalyticsRaceState(targetSessionState);
    }
    setRecordSelectedParticipants(new Set<EventParticipantId>());
    setCategorySelected(new Set<EventCategoryId>());
    setRecordSelectedCategories(new Set<EventCategoryId>());
    if (missingCategoryWarnings.length > 0) {
      setLoadWarnings((warnings) => Array.from(new Set([...warnings, ...missingCategoryWarnings])));
    }
    updateEventCatalogState(catalog, eventId, sessionId, selectedCategoryId);
    setRenderTick((tick) => tick + 1);
    return reloadSummary;
  };

  const reloadSessionsLinkedToSource = async (sourceId: string): Promise<SessionSourceReloadSummary | undefined> => {
    if (!eventCatalogState) {
      return undefined;
    }

    const linkedSessions = eventCatalogState.sessions.filter((session) => {
      return getSessionAssignedSourceIds(systemConfigState, session.eventId, session.id).includes(sourceId);
    });
    let summary = createEmptySessionSourceReloadSummary();

    for (const session of linkedSessions) {
      const sessionSummary = await reloadSessionSources(session.eventId, session.id, 'all');
      if (sessionSummary) {
        summary = addSessionSourceReloadSummaries(summary, sessionSummary);
      }
    }

    return summary;
  };

  const summarizeMrScatsImport = (importData: MrScatsCatalogImport, onCompleteStep: (currentTask: string, index: number) => Promise<void>): SessionSourceReloadSummary => {
    const summary = createEmptySessionSourceReloadSummary();
    if (!eventCatalogService) {
      return summary;
    }

    const existingEvent = eventCatalogService.catalog.events.find((event) => event.id === importData.eventId);
    summary.events = existingEvent
      ? { created: 0, deleted: 0, updated: 1 }
      : { created: 1, deleted: 0, updated: 0 };

    importData.sessions.forEach((session) => {
      const existingSession = eventCatalogService.catalog.sessions.find((item) => item.id === session.id);
      summary.sessions[existingSession ? 'updated' : 'created'] += 1;

      const existingRaceState = eventCatalogService.getImportedRaceState(importData.eventId, session.id);
      const nextRaceState = filterMrScatsRaceStateForSession(importData.raceState, session.id, session.categoryIds);
      const sessionSummary = summarizeSessionSourceReload(existingRaceState, nextRaceState, 'all');
      const accumulatedSummary = addSessionSourceReloadSummaries(summary, sessionSummary);
      summary.categories = accumulatedSummary.categories;
      summary.crossings = accumulatedSummary.crossings;
      summary.flags = accumulatedSummary.flags;
      summary.participants = accumulatedSummary.participants;
      summary.teams = accumulatedSummary.teams;
      onCompleteStep(`Summarizing session ${session.name}`, 0).catch((error: unknown) => {
        setErrorState(error as Error);
      });
    });

    return summary;
  };

  const loadTimingSession = async (eventId: EventId, sessionId: SessionId): Promise<void> => {
    if (!validateUuid(eventId)) {
      throw new Error(`Invalid eventId provided: ${eventId}`);
    }
    if (!validateUuid(sessionId)) {
      throw new Error(`Invalid sessionId provided: ${sessionId}`);
    }
    const targetSessionState = createEmptySessionState();
    const loadedState = await applySessionSources(eventId, sessionId, {
      cachedSpreadsheetOnly: true,
      clearSelections: true,
      preferCachedSpreadsheet: true,
      preferPersistedRaceState: true,
      targetSessionState,
    });
    setTimingRaceState(loadedState || targetSessionState);
    setTimingErrorState(undefined);
    setRenderTick((tick) => tick + 1);
  };

  const runAfterTimingLoadingPaint = (operation: () => void): void => {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      setTimeout(operation, 0);
      return;
    }

    window.requestAnimationFrame(() => {
      window.setTimeout(operation, 0);
    });
  };

  const selectTimingEvent = (eventId: EventId): void => {
    if (!validateUuid(eventId)) {
      throw new Error(`Invalid eventId provided: ${eventId}`);
    }
    if (!eventCatalogState) {
      return;
    }

    const nextSessions = sortSessionsByScheduledStart(getSessionsForEvent(eventCatalogState, eventId));
    const nextSessionId = nextSessions.find((session) => session.id === selectedTimingSessionId)?.id || nextSessions[0]?.id;
    setTimingSessionSelection('session');
    setSelectedTimingEventId(eventId);
    setSelectedTimingSessionId(nextSessionId);
    persistTimingContextSelection({
      eventId,
      selectionMode: 'session',
      sessionId: nextSessionId,
    });
    setTimingSelectionLoading(true);
    setTimingRaceState(createEmptySessionState());

    runAfterTimingLoadingPaint(() => {
      if (!nextSessionId) {
        setTimingSelectionLoading(false);
        return;
      }

      loadTimingSession(eventId, nextSessionId).catch((error: unknown) => {
        setTimingErrorState(error as Error);
      }).finally(() => {
        setTimingSelectionLoading(false);
      });
    });
  };

  const selectTimingSession = (sessionId: SessionId): void => {
    setTimingSelectionLoading(true);
    if (sessionId === 'active') {
      runAfterTimingLoadingPaint(() => {
        setTimingSessionSelection('active');
        setSelectedTimingEventId(eventCatalogState?.activeEventId);
        setSelectedTimingSessionId(eventCatalogState?.activeSessionId);
        persistTimingContextSelection({
          selectionMode: 'active',
        });
        setTimingRaceState(sessionState);
        setTimingErrorState(undefined);
        setTimingSelectionLoading(false);
      });
      return;
    }

    const eventId = selectedTimingEventId || eventCatalogState?.activeEventId;
    if (!eventId) {
      setTimingSelectionLoading(false);
      return;
    }

    setTimingSessionSelection('session');
    setSelectedTimingSessionId(sessionId);
    persistTimingContextSelection({
      eventId,
      selectionMode: 'session',
      sessionId,
    });
    setTimingRaceState(createEmptySessionState());
    runAfterTimingLoadingPaint(() => {
      loadTimingSession(eventId, sessionId).catch((error: unknown) => {
        setTimingErrorState(error as Error);
      }).finally(() => {
        setTimingSelectionLoading(false);
      });
    });
  };

  const encodeEventSessionValue = (eventId: EventId, sessionId?: SessionId): string => {
    return sessionId ? `session:${eventId}:${sessionId}` : `event:${eventId}`;
  };

  const selectAnalyticsEventSession = (value: string): void => {
    if (!eventCatalogState) {
      return;
    }

    const [kind, eventId, sessionId] = value.split(':');
    if (kind !== 'session' || !eventId || !sessionId) {
      return;
    }

    const nextEventId = eventId;
    const eventSessions = getSessionsForEvent(eventCatalogState, nextEventId);
    const nextSessionId = eventSessions.find((session) => session.id === sessionId)?.id;

    if (!nextSessionId) {
      return;
    }

    setSelectedAnalyticsEventId(nextEventId);
    setSelectedAnalyticsSessionId(nextSessionId);

    if (nextEventId === eventCatalogState.activeEventId && nextSessionId === eventCatalogState.activeSessionId) {
      setAnalyticsRaceState(sessionState);
      return;
    }

    const targetSessionState = createEmptySessionState();
    applySessionSources(nextEventId, nextSessionId, {
      cachedSpreadsheetOnly: true,
      clearSelections: true,
      preferCachedSpreadsheet: true,
      preferPersistedRaceState: true,
      targetSessionState,
    }).then((loadedState) => {
      const hydratedState = loadedState || targetSessionState;
      const analyticsSessionState = sessionFromPartialRaceState(raceStateSnapshot(hydratedState));
      applyCatalogSessionScopeToRaceState(analyticsSessionState, eventCatalogService?.catalog || eventCatalogState, nextEventId, nextSessionId);
      setAnalyticsRaceState(analyticsSessionState);
    }).catch((error: unknown) => {
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
    setTimingErrorState(undefined);
    setTimingSelectionLoading(false);
  }, [eventCatalogState?.activeEventId, eventCatalogState?.activeSessionId, sessionState, timingSessionSelection]);

  useEffect(() => {
    if (initialTimingSelectionHydrated.current ||
      timingSessionSelection !== 'session' ||
      !selectedTimingEventId ||
      !selectedTimingSessionId) {
      return;
    }

    initialTimingSelectionHydrated.current = true;
    setTimingSelectionLoading(true);
    loadTimingSession(selectedTimingEventId, selectedTimingSessionId).catch((error: unknown) => {
      setTimingErrorState(error as Error);
    }).finally(() => {
      setTimingSelectionLoading(false);
    });
  }, [loadTimingSession, selectedTimingEventId, selectedTimingSessionId, timingSessionSelection]);

  useEffect(() => {
    if (selectedAnalyticsEventId === eventCatalogState?.activeEventId && selectedAnalyticsSessionId === eventCatalogState?.activeSessionId) {
      setAnalyticsRaceState(sessionState);
    }
  }, [eventCatalogState?.activeEventId, eventCatalogState?.activeSessionId, selectedAnalyticsEventId, selectedAnalyticsSessionId, sessionState]);

  useEffect(() => {
    if (!eventCatalogState || !sessionState || !selectedSessionsEventId || !selectedSessionId) {
      return;
    }

    const sourceIds = getSessionAssignedSourceIds(systemConfigState, selectedSessionsEventId, selectedSessionId);
    const liveSources = systemConfigState.dataSources.filter((source) => {
      return sourceIds.includes(source.id) &&
        source.enabled &&
        (source.type === 'api-apical-data-file' || source.type === 'api-apical-excel-file') &&
        !!source.apiConfig?.live;
    });

    const timers = liveSources.map((source) => {
      applySourceToSessionState(selectedSessionsEventId, source, undefined, { sessionId: selectedSessionId }).catch((error: unknown) => {
        setErrorState(error as Error);
      });
      const intervalMs = Math.max(1, source.apiConfig!.pollIntervalSeconds) * 1000;
      return window.setInterval(() => {
        applySourceToSessionState(selectedSessionsEventId, source, undefined, { sessionId: selectedSessionId }).catch((error: unknown) => {
          setErrorState(error as Error);
        });
      }, intervalMs);
    });

    return () => {
      timers.forEach((timer) => clearInterval(timer));
    };
  }, [eventCatalogState, selectedSessionId, selectedSessionsEventId, systemConfigState]);

  const renderShell = (content: ReactElement): ReactElement => (
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
        {content}
      </main>
      {reloadSummary ? (
        <ReloadSummaryDialog
          onClose={() => setReloadSummary(undefined)}
          summary={reloadSummary}
        />
      ) : null}
    </div>
  );

  const displayedTimingRaceState = timingRaceState || sessionState;
  const timingRaceStateLookup: RaceStateLookup & {
    categories: EventCategory[];
    participants: EventParticipant[];
    records: EventTimeRecord[];
    teams: EventTeam[] | undefined;
    timeRecordSources: Session['timeRecordSources'] | undefined;
  } = (() => {
    if (!displayedTimingRaceState || !eventCatalogState) {
      return {
        categories: [],
        countTransponderCrossings: () => 0,
        excludeCrossing: () => undefined,
        getCategoryById: () => undefined,
        getEntrantIdForParticipant: () => undefined,
        getFinishLineNumbers: () => undefined,
        getParticipantById: () => undefined,
        getParticipantLaps: () => undefined,
        getTimeRecordSourceById: () => undefined,
        getTransponderCrossings: () => [],
        participants: [],
        records: [],
        teams: undefined,
        timeRecordSources: undefined,
        updateCategoryDetails: () => undefined,
        updateEntrantCategory: () => undefined,
        updateParticipantCategory: () => undefined,
      };
    }

    const timingEventId = timingSessionSelection === 'active'
      ? eventCatalogState.activeEventId
      : selectedTimingEventId || eventCatalogState.activeEventId;
    const participantById = new Map<EventParticipantId, EventParticipant>(
      displayedTimingRaceState.participants.map((participant) => [participant.id, participant])
    );

    getEntrantsForEvent(eventCatalogState, timingEventId).forEach((entrant) => {
      if (entrant.entrantType !== 'rider') {
        return;
      }

      const fallbackParticipantId = entrant.memberParticipantIds[0] || entrant.id;
      if (!participantById.has(fallbackParticipantId)) {
        participantById.set(fallbackParticipantId, createParticipantFromEntrant(entrant, fallbackParticipantId));
      }
    });

    const timingSessionIdForCategories = timingSessionSelection === 'active'
      ? eventCatalogState.activeSessionId
      : selectedTimingSessionId || sortSessionsByScheduledStart(getSessionsForEvent(eventCatalogState, timingEventId))[0]?.id;
    const timingCategoryIds = getSessionAssignedCategoryIds(eventCatalogState, timingEventId, timingSessionIdForCategories);
    const eventCategories = getCategoriesForEvent(eventCatalogState, timingEventId);
    const categories = timingCategoryIds && timingCategoryIds.size > 0
      ? eventCategories.filter((category) => timingCategoryIds.has(category.id))
      : eventCategories;
    const categoriesById = new Map<EventCategoryId, EventCategory>(
      [...displayedTimingRaceState.categories, ...categories].map((category) => [category.id, category])
    );

    return {
      categories: Array.from(categoriesById.values()),
      countTransponderCrossings: (txNo, untilTime) => displayedTimingRaceState.countTransponderCrossings(txNo, untilTime),
      excludeCrossing: (crossingId, exclude) => displayedTimingRaceState.excludeCrossing(crossingId, exclude),
      getCategoryById: (categoryId) => categoriesById.get(categoryId),
      getEntrantIdForParticipant: (participantId) => participantById.get(participantId)?.entrantId || displayedTimingRaceState.getEntrantIdForParticipant(participantId),
      getFinishLineNumbers: () => displayedTimingRaceState.getFinishLineNumbers?.(),
      getParticipantById: (participantId) => participantById.get(participantId),
      getParticipantLaps: (participantId) => displayedTimingRaceState.getParticipantLaps(participantId),
      getTimeRecordSourceById: (sourceId) => displayedTimingRaceState.getTimeRecordSourceById?.(sourceId),
      getTransponderCrossings: (txNo, untilTime) => displayedTimingRaceState.getTransponderCrossings(txNo, untilTime),
      participants: Array.from(participantById.values()),
      records: displayedTimingRaceState.records as EventTimeRecord[],
      teams: displayedTimingRaceState.teams,
      timeRecordSources: displayedTimingRaceState.timeRecordSources,
      updateCategoryDetails: (categoryId, changes) => displayedTimingRaceState.updateCategoryDetails(categoryId, changes),
      updateEntrantCategory: (entrantId, categoryId) => displayedTimingRaceState.updateEntrantCategory(entrantId, categoryId),
      updateParticipantCategory: (participantId, categoryId) => displayedTimingRaceState.updateParticipantCategory(participantId, categoryId),
      updateParticipantIdentifiers: displayedTimingRaceState.updateParticipantIdentifiers
        ? (participantId, identifierType, values) => displayedTimingRaceState.updateParticipantIdentifiers?.(participantId, identifierType, values)
        : undefined,
      updateRecord: displayedTimingRaceState.updateRecord
        ? (record) => displayedTimingRaceState.updateRecord?.(record)
        : undefined,
    };
  })();

  if (errorState) {
    return renderShell(<PageErrorFallback error={errorState} onDismiss={() => setErrorState(undefined)} />);
  }
  if (!sessionState || !eventCatalogState) {
    return renderShell(<LoadingProgress metrics={loadingMetrics} progress={loadingProgress} />);
  }

  const handleExcludeCrossing = (crossingId: TimeRecordId, exclude: boolean) => {
    if (!adminService) {
      return;
    }
    const targetRaceState = timingRaceState || sessionState;
    adminService.excludeCrossingForSession(targetRaceState, crossingId, exclude)
      .then(() => setRenderTick((tick) => tick + 1))
      .catch((error: unknown) => setTimingErrorState(error as Error));
  };

  const handleMarkFlagDeleted = (flagId: TimeRecordId, deleted: boolean) => {
    if (!adminService) {
      return;
    }
    const targetRaceState = timingRaceState || sessionState;
    adminService.markFlagDeletedForSession(targetRaceState, flagId, deleted)
      .then(() => setRenderTick((tick) => tick + 1))
      .catch((error: unknown) => setTimingErrorState(error as Error));
  };

  const handleRemoveFlagCategory = (flagId: TimeRecordId, categoryId: EventCategoryId) => {
    if (!adminService) {
      return;
    }
    const targetRaceState = timingRaceState || sessionState;
    adminService.removeFlagCategoryForSession(targetRaceState, flagId, categoryId)
      .then(() => setRenderTick((tick) => tick + 1))
      .catch((error: unknown) => setTimingErrorState(error as Error));
  };

  const handleAssignFlagCategory = (flagId: TimeRecordId, categoryId: EventCategoryId) => {
    if (!adminService) {
      return;
    }
    const targetRaceState = timingRaceState || sessionState;
    adminService.assignFlagCategoryForSession(targetRaceState, flagId, categoryId)
      .then(() => setRenderTick((tick) => tick + 1))
      .catch((error: unknown) => setTimingErrorState(error as Error));
  };

  const handleAddTimingRecord = (record: EventTimeRecord) => {
    if (!adminService || !record.sessionId) {
      return;
    }
    const targetRaceState = timingRaceState || sessionState;
    adminService.addRecordForSession(targetRaceState, record.sessionId, record)
      .then(() => setRenderTick((tick) => tick + 1))
      .catch((error: unknown) => setTimingErrorState(error as Error));
  };

  const handleEditTimingRecord = (record: EventTimeRecord) => {
    if (!adminService || !record.sessionId) {
      return;
    }
    const targetRaceState = timingRaceState || sessionState;
    adminService.updateRecordForSession(targetRaceState, record.sessionId, record)
      .then(() => setRenderTick((tick) => tick + 1))
      .catch((error: unknown) => setTimingErrorState(error as Error));
  };

  const handleUpdateSourceOffset = (sourceId: string, previousTime: Date, nextTime: Date): void => {
    if (!adminService) {
      return;
    }

    const targetRaceState = timingRaceState || sessionState;
    const offsetMilliseconds = nextTime.getTime() - previousTime.getTime();
    if (offsetMilliseconds === 0) {
      return;
    }

    const recordsToUpdate = targetRaceState.records
      .filter((record): record is EventTimeRecord => record.source.toString() === sourceId && record.time !== undefined)
      .map((record) => ({
        ...record,
        time: new Date(record.time!.getTime() + offsetMilliseconds),
      }));

    Promise.all(recordsToUpdate.map((record) => {
      const sessionId = record.sessionId || timingSessionId;
      return sessionId ? adminService.updateRecordForSession(targetRaceState, sessionId, record) : Promise.resolve();
    }))
      .then(() => setRenderTick((tick) => tick + 1))
      .catch((error: unknown) => setTimingErrorState(error as Error));
  };

  const handleChangeCategory = (participantId: EventParticipantId, categoryId: EventCategoryId) => {
    if (!adminService) {
      return;
    }

    const targetRaceState = timingRaceState || sessionState;
    const entrantId = targetRaceState.getEntrantIdForParticipant(participantId);
    if (!entrantId) {
      return;
    }

    adminService.updateEntrantCategoryForSession(targetRaceState, entrantId, categoryId).catch((error: unknown) => {
      setTimingErrorState(error as Error);
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

  const timingEventId = timingSessionSelection === 'active'
    ? eventCatalogState.activeEventId
    : selectedTimingEventId || eventCatalogState.activeEventId;
  const timingEvent = eventCatalogState.events.find((event) => event.id === timingEventId) ??
    eventCatalogState.events.find((event) => event.id === eventCatalogState.activeEventId) ??
    eventCatalogState.events[0];
  const timingSessions = sortSessionsByScheduledStart(getSessionsForEvent(eventCatalogState, timingEvent?.id));
  const activeSession = eventCatalogState.sessions.find((session) => session.id === eventCatalogState.activeSessionId);
  const timingSessionValue = timingSessionSelection === 'active'
    ? activeSession?.id || timingSessions[0]?.id || ''
    : selectedTimingSessionId || timingSessions[0]?.id || '';
  const timingSessionId = timingSessionValue || undefined;
  const timingSessionValidCategoryIds = getSessionAssignedCategoryIds(eventCatalogState, timingEvent?.id, timingSessionId) as Set<EventCategoryId> | undefined;
  const timingTimeDisplayZoneMode = (timingEvent?.id ? systemConfigState.eventOptions[timingEvent.id]?.timeDisplayZoneMode : undefined) || 'event';
  const updateTimingTimeDisplayZoneMode = (mode: EventTimeDisplayZoneMode): void => {
    if (!timingEvent?.id || !systemConfigService) {
      return;
    }

    systemConfigService.updateEventOptions(timingEvent.id, { timeDisplayZoneMode: mode })
      .then(updateSystemConfigState)
      .catch((error: unknown) => setTimingErrorState(error as Error));
  };

  const timingPage = (
    <PageErrorBoundary
      fallbackTitle="Timing"
      onError={(error) => logDisplayedError('Timing render', error)}
      resetKey={`${activeSection}:${timingEvent?.id || ''}:${timingSessionValue}`}
    >
      {timingErrorState ? (
        <PageErrorFallback error={timingErrorState} onDismiss={() => setTimingErrorState(undefined)} title="Timing" />
      ) : (
        <TimingContext
          activeSession={activeSession}
          categoryListSelected={handleCategoryListSelected}
          eventTimeZone={timingEvent?.timeZone || getSystemTimeZone()}
          events={eventCatalogState.events}
          onAddRecord={handleAddTimingRecord}
          onEditRecord={handleEditTimingRecord}
          onAssignFlagCategory={handleAssignFlagCategory}
          onChangeCategory={handleChangeCategory}
          onExclude={handleExcludeCrossing}
          onMarkFlagDeleted={handleMarkFlagDeleted}
          onRemoveFlagCategory={handleRemoveFlagCategory}
          onSelectEvent={selectTimingEvent}
          onSelectSession={selectTimingSession}
          onTimeDisplayZoneModeChange={updateTimingTimeDisplayZoneMode}
          onUpdateSourceOffset={handleUpdateSourceOffset}
          participantSelected={handleParticipantSelected}
          raceState={timingRaceStateLookup}
          selectedCategories={hilightCategories}
          selectedParticipants={recordSelectedParticipants}
          sessions={timingSessions}
          fastestTimeIndicatorColors={systemConfigState.fastestTimeIndicatorColors}
          timeDisplayZoneMode={timingTimeDisplayZoneMode}
          timingEvent={timingEvent}
          timingSelectionLoading={timingSelectionLoading}
          timingSessionValidCategoryIds={timingSessionValidCategoryIds}
          timingSessionValue={timingSessionValue}
        />
      )}
    </PageErrorBoundary>
  );

  const activeEvent = eventCatalogState.events.find((event) => event.id === eventCatalogState.activeEventId) ??
    eventCatalogState.events.find((event) => event.id === selectedEventId) ??
    eventCatalogState.events[0];
  const activeEventSessions = getSessionsForEvent(eventCatalogState, activeEvent?.id);
  const selectedCategoryEventId = selectedCategoriesEventId || eventCatalogState.activeEventId || eventCatalogState.events[0]?.id;
  const selectedCategoryEventCategories = getCategoriesForEvent(eventCatalogState, selectedCategoryEventId);
  const resolvedSelectedCategoryId = selectedCategoryEventCategories.find((category) => category.id.toString() === selectedCategoryId)?.id.toString() ??
    selectedCategoryEventCategories[0]?.id.toString();
  const selectedCategoryEntrants = getEntrantsForCategory(eventCatalogState, selectedCategoryEventId, resolvedSelectedCategoryId);
  const selectedEntrantsResolvedEventId = selectedEntrantsEventId || eventCatalogState.activeEventId || eventCatalogState.events[0]?.id;
  const selectedEntrantsResolvedSessionId = selectedEntrantsResolvedEventId
    ? eventCatalogState.activeEventId === selectedEntrantsResolvedEventId
      ? eventCatalogState.activeSessionId || getSessionsForEvent(eventCatalogState, selectedEntrantsResolvedEventId)[0]?.id
      : getSessionsForEvent(eventCatalogState, selectedEntrantsResolvedEventId)[0]?.id
    : undefined;
  const selectedEntrantsImportedRaceState = eventCatalogService && selectedEntrantsResolvedEventId && selectedEntrantsResolvedSessionId
    ? eventCatalogService.getImportedRaceState(selectedEntrantsResolvedEventId, selectedEntrantsResolvedSessionId)
    : undefined;
  const displayedEntrantsRaceState = selectedEntrantsResolvedEventId === eventCatalogState.activeEventId &&
    selectedEntrantsResolvedSessionId === eventCatalogState.activeSessionId
    ? sessionState
    : selectedEntrantsImportedRaceState;
  const selectedResultsEventId = selectedAnalyticsEventId || eventCatalogState.activeEventId || eventCatalogState.events[0]?.id;
  const selectedResultsSessionId = selectedAnalyticsSessionId || eventCatalogState.activeSessionId || getSessionsForEvent(eventCatalogState, selectedResultsEventId)[0]?.id;
  const displayedAnalyticsRaceState = analyticsRaceState || sessionState;
  const selectedEventSessionValue = selectedResultsEventId
    ? encodeEventSessionValue(selectedResultsEventId, selectedResultsSessionId)
    : '';
  const eventSessionOptions = eventCatalogState.events.flatMap((event): EventSessionOption[] => {
    const eventOption = {
      eventId: event.id,
      eventName: event.name,
      value: encodeEventSessionValue(event.id),
    };
    const sessionOptions = getSessionsForEvent(eventCatalogState, event.id).map((session) => ({
      eventId: event.id,
      eventName: event.name,
      sessionId: session.id,
      sessionName: session.name,
      value: encodeEventSessionValue(event.id, session.id),
    }));
    return [eventOption, ...sessionOptions];
  });
  const sessionScopedCategories = (() => {
    const normalizeCategoryText = (value: string): string => value.trim().toLowerCase();
    const categorySeriesKey = (_id: string, name: string): string => normalizeCategoryText(name);
    const sessionId = selectedResultsSessionId;
    const candidates = getCategoriesForEvent(eventCatalogState, selectedResultsEventId);
    const selectedSessionCategoryIds = new Set(
      getSessionsForEvent(eventCatalogState, selectedResultsEventId)
        .find((session) => session.id === sessionId)?.categoryIds || []
    );
    const fromCatalog = selectedSessionCategoryIds.size === 0
      ? candidates
      : candidates.filter((category) => selectedSessionCategoryIds.has(category.id));

    const categoriesById = new Map(fromCatalog.map((category) => [category.id.toString(), category.name]));
    displayedAnalyticsRaceState.participants.forEach((participant) => {
      const categoryId = participant.categoryId.toString();
      if (!categoriesById.has(categoryId)) {
        const category = displayedAnalyticsRaceState.categories.find((item) => item.id === participant.categoryId);
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

  const sectionContent = (): ReactElement => {
    if (activeSection === 'Timing') {
      return timingPage;
    }

    if (activeSection === 'System') {
      return (
        <SystemContext
          config={systemConfigState}
          displayedErrorLog={displayedErrorLogText}
          onDisplayError={logDisplayedError}
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

            const apicalEventId = source.apiConfig?.selectedEventIds[0] || source.apiConfig?.apicalEventId;
            const importEventId = apicalEventId ? createApicalCatalogEventId(apicalEventId) : undefined;
            return fetchApicalRaceStateNow(source, {
              localStorageDirectoryPath: systemConfigState.localStorageDirectoryPath,
              timeZone: getEventTimeZone(importEventId),
            })
              .then(async (importData: PulledApicalRaceState) => {
                const catalog = await eventCatalogService.importApicalRaceState(importData);
                updateEventCatalogState(catalog, importData.eventId, importData.sessionId);
                return systemConfigService.persistApicalDataFetch(
                  sourceId,
                  importData.eventId,
                  importData.sessionId,
                  importData.retrievedAt,
                  importData.apicalDataFilePath,
                  importData.eventName
                );
              })
              .then(updateSystemConfigState);
          }}
          onReprocessApicalData={(sourceId) => {
            if (!eventCatalogService || !systemConfigService) {
              return;
            }
            const source = systemConfigState.dataSources.find((item) => item.id === sourceId);
            if (!source || !source.apicalDataFilePath) {
              return;
            }

            return reloadSessionsLinkedToSource(sourceId).then((summary) => {
              setReloadSummary(summary);
            });
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
          onLoadMrScatsEvent={(sourceId, onProgress) => {
            if (!eventCatalogService || !systemConfigService) {
              return;
            }

            const source = systemConfigState.dataSources.find((item) => item.id === sourceId);
            const locationPath = source?.mrScatsConfig?.dataLocationPath;
            if (!source || source.type !== 'file-mr-scats-data' || !locationPath) {
              throw new Error('MR-SCATS data files location must be selected before loading the event.');
            }

            const postParseStepCount = 5;
            let latestProgress: MrScatsCatalogLoadProgress | undefined;
            const publishProgress = async (progress: MrScatsCatalogLoadProgress): Promise<void> => {
              latestProgress = progress;
              await onProgress?.(progress);
            };
            const completeImportStep = async (currentTask: string, index: number): Promise<void> => {
              if (!latestProgress) {
                return;
              }
              latestProgress = {
                ...latestProgress,
                callerName: `${currentTask}:${index}`,
                completed: Math.min(latestProgress.total, latestProgress.completed + 1),
                currentFile: undefined,
                currentTask,
              };
              await onProgress?.(latestProgress);
            };

            return loadMrScatsCatalogFromLocation(locationPath, {
              extraSteps: postParseStepCount,
              ignoreLineOneNo1CrossingsWhenDbfPresent: source.mrScatsConfig?.ignoreLineOneNo1CrossingsWhenDbfPresent,
              onProgress: publishProgress,
            })
              .then(async (importData) => {
                const validationMessages = importData.validationMessages || [];
                if (validationMessages.length > 0) {
                  logDisplayedError('MR-SCATS import validation', new Error(validationMessages.join('\n')));
                }
                await completeImportStep('Summarising MR-SCATS import', 1);
                const importSummary = summarizeMrScatsImport(importData, completeImportStep);
                await completeImportStep('Writing MR-SCATS event catalog', 2);
                const catalog = await eventCatalogService.importMrScatsCatalog(importData, completeImportStep);
                await completeImportStep('Updating event display', 3);
                updateEventCatalogState(catalog, importData.eventId, importData.sessions[0]?.id);
                await completeImportStep('Assigning MR-SCATS source', 4);
                let config = await systemConfigService.assignSourcesToEvent(importData.eventId, [sourceId]);
                for (const session of importData.sessions) {
                  config = await systemConfigService.assignSourcesToSession(session.id, {
                    mode: 'specific',
                    sourceIds: [sourceId],
                  });
                }
                await completeImportStep('Showing MR-SCATS import summary', 5);
                updateSystemConfigState(config);
                setReloadSummary(importSummary);
              })
              .catch((error: unknown) => {
                setErrorState(error as Error);
                throw error;
              });
          }}
          onLoadDorianCtcSrtFile={(sourceId, onProgress) => {
            if (!eventCatalogService || !systemConfigService) {
              return;
            }

            const source = systemConfigState.dataSources.find((item) => item.id === sourceId);
            const filePath = source?.fileConfig?.filePath;
            if (!source || source.type !== 'file-dorian-ctc-srt' || !filePath) {
              throw new Error('A Dorian CTC SRT or ERF file must be selected before importing.');
            }

            const eventId = selectedEventId;
            const sessionId = selectedSessionId;
            const event = eventCatalogState.events.find((item) => item.id === eventId);
            const session = eventCatalogState.sessions.find((item) => item.id === sessionId && item.eventId === eventId);
            if (!eventId || !sessionId || !event || !session) {
              throw new Error('Select an event and session before importing a Dorian CTC SRT or ERF file.');
            }

            const isActiveSession = eventId === eventCatalogState.activeEventId && sessionId === eventCatalogState.activeSessionId;
            const importMode = source.fileConfig?.importMode || 'import';
            const existingRaceState = isActiveSession
              ? raceStateSnapshot(sessionState)
              : eventCatalogService.getImportedRaceState(eventId, sessionId) || {};
            const targetSessionState = sessionFromPartialRaceState(importMode === 'import' ? {} : existingRaceState);
            const knownTransmitterNumbers = importMode === 'update'
              ? (existingRaceState.participants || []).flatMap((participant) => participant.identifiers
                .filter((identifier) => 'txNo' in identifier)
                .map((identifier) => (identifier as ParticipantTransponder).txNo))
              : [];

            const trackConfigFilePath = source.fileConfig?.trackConfigFilePath;
            const trackConfigPromise = trackConfigFilePath
              ? window.api.requestBuffer(trackConfigFilePath)
                .then((trackConfigBuffer) => parseCtcTrackConfig(trackConfigBuffer, trackConfigFilePath))
              : Promise.resolve(source.fileConfig?.ctcTrackConfig);

            return Promise.all([window.api.requestBuffer(filePath), trackConfigPromise])
              .then(async ([buffer, trackConfig]) => {
                if (trackConfigFilePath && trackConfig) {
                  const updatedConfig = await systemConfigService.updateSource(sourceId, {
                    fileConfig: {
                      ...source.fileConfig,
                      ctcTrackConfig: trackConfig,
                    },
                  });
                  updateSystemConfigState(updatedConfig);
                }

                return loadDorianCtcSrtCatalogForSession(filePath, buffer, {
                  eventDate: event.date,
                  eventId,
                  importPlaceholderEntrantsForUnknownTransmitters: source.fileConfig?.importPlaceholderEntrantsForUnknownTransmitters === true,
                  knownTransmitterNumbers,
                  onProgress,
                  sessionId,
                  timeZone: event.timeZone,
                  trackConfig,
                });
              })
              .then(async (importedRaceState) => {
                const scaffoldCatalog = await eventCatalogService.syncEventScaffold(
                  eventId,
                  importedRaceState.categories || [],
                  importedRaceState.participants || [],
                  [],
                  importedRaceState.teams || [],
                  sessionId,
                );
                await applyPulledRaceStateToSession(targetSessionState, importedRaceState, {
                  catalog: scaffoldCatalog,
                  eventId,
                  finishLineNumbers: getFinishLineNumbersForSession(systemConfigState, eventId, sessionId),
                  sessionId,
                });
                const catalog = importMode === 'import'
                  ? await eventCatalogService.replaceImportedRaceState(eventId, sessionId, raceStateSnapshot(targetSessionState))
                  : await eventCatalogService.updateImportedRaceState(eventId, sessionId, raceStateSnapshot(targetSessionState));
                updateEventCatalogState(catalog, eventId, sessionId);
                if (isActiveSession) {
                  setSessionState(targetSessionState);
                  setRenderTick((tick) => tick + 1);
                }
                const timingShowsImportedSession =
                  (timingSessionSelection === 'active' && isActiveSession) ||
                  (selectedTimingEventId === eventId && selectedTimingSessionId === sessionId);
                if (timingShowsImportedSession) {
                  setTimingRaceState(targetSessionState);
                }
                const config = await systemConfigService.assignSourcesToEvent(eventId, [sourceId]);
                const assignedConfig = await systemConfigService.assignSourcesToSession(sessionId, { mode: 'specific', sourceIds: [sourceId] });
                updateSystemConfigState(assignedConfig || config);
              })
              .catch((error: unknown) => {
                setErrorState(error as Error);
                throw error;
              });
          }}
          onOpenLocalFile={(filePath) => window.api.openLocalFile(filePath)}
          onSaveLocalStorageDirectoryPath={(directoryPath) => {
            if (!systemConfigService) {
              return;
            }
            systemConfigService.updateLocalStorageDirectoryPath(directoryPath).then(updateSystemConfigState).catch((error: unknown) => setErrorState(error as Error));
          }}
          onSaveFastestTimeIndicatorColors={(changes) => {
            if (!systemConfigService) {
              return;
            }
            systemConfigService.updateFastestTimeIndicatorColors(changes).then(updateSystemConfigState).catch((error: unknown) => setErrorState(error as Error));
          }}
          onSaveSource={(sourceId, changes) => {
            if (!systemConfigService) {
              return;
            }
            const saveSource = async (): Promise<void> => {
              const source = systemConfigState.dataSources.find((item) => item.id === sourceId);
              const trackConfigFilePath = changes.fileConfig?.trackConfigFilePath;
              const nextChanges = source?.type === 'file-dorian-ctc-srt' && trackConfigFilePath
                ? {
                  ...changes,
                  fileConfig: {
                    ...source.fileConfig,
                    ...changes.fileConfig,
                    ctcTrackConfig: parseCtcTrackConfig(await window.api.requestBuffer(trackConfigFilePath), trackConfigFilePath),
                  },
                }
                : changes;

              const config = await systemConfigService.updateSource(sourceId, nextChanges);
              updateSystemConfigState(config);
            };

            saveSource().catch((error: unknown) => setErrorState(error as Error));
          }}
          onPreviewMrScatsDataFile={(sourceId, file) => {
            const source = systemConfigState.dataSources.find((item) => item.id === sourceId);
            const locationPath = source?.mrScatsConfig?.dataLocationPath;
            if (!locationPath) {
              throw new Error('MR-SCATS data files location must be selected before previewing files.');
            }

            return previewMrScatsDataFile(locationPath, file.relativePath, file.kind);
          }}
          onPreviewDorianCtcSrtFile={(sourceId) => {
            const source = systemConfigState.dataSources.find((item) => item.id === sourceId);
            const filePath = source?.fileConfig?.filePath;
            if (!filePath) {
              throw new Error('A Dorian CTC SRT or ERF file must be selected before previewing.');
            }

            return window.api.requestBuffer(filePath)
              .then((buffer) => previewCtcRawCrossingBuffer(filePath, buffer));
          }}
          onSelectLocalFile={() => {
            return window.api.selectLocalFile({
              filters: [{ extensions: ['csv'], name: 'CSV files' }],
              title: 'Select RFID Timing CSV file',
            });
          }}
          onSelectDorianCtcSrtFile={() => {
            return window.api.selectLocalFile({
              filters: [{ extensions: ['srt', 'erf'], name: 'Dorian CTC SRT or ERF files' }],
              title: 'Select Dorian CTC SRT or ERF file',
            });
          }}
          onSelectDorianCtcTrackConfigFile={() => {
            return window.api.selectLocalFile({
              filters: [{ extensions: ['cfg'], name: 'CTC TRACK.CFG files' }],
              title: 'Select CTC TRACK.CFG file',
            });
          }}
          onSelectMrScatsDataArchive={() => {
            return window.api.selectLocalFile({
              filters: [{ extensions: ['zip', 'arj'], name: 'MR-SCATS archive files' }],
              properties: ['openFile'],
              title: 'Select MR-SCATS archive file',
            }).then((locationPath) => {
              return locationPath ? listMrScatsDataFiles(locationPath) : undefined;
            });
          }}
          onSelectMrScatsDataDirectory={() => {
            return window.api.selectLocalDirectory('Select MR-SCATS data directory').then((locationPath) => {
              return locationPath ? listMrScatsDataFiles(locationPath) : undefined;
            });
          }}
        />
      );
    }

    if (activeSection === 'Events') {
      return (
        <EventsContext
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
          onCreateSession={(eventId: EventId) => {
            if (!validateUuid(eventId)) {
              throw new Error(`Invalid eventId provided: ${eventId}`);
            }
            if (!eventCatalogService) {
              return;
            }
            eventCatalogService.createSession(eventId).then((catalog) => {
              const session = getSessionsForEvent(catalog, eventId).find((item) => item.name === 'New Session');
              updateEventCatalogState(catalog, eventId, session?.id, selectedCategoryId);
            }).catch((error: unknown) => setErrorState(error as Error));
          }}
          onDeleteEvent={(eventId) => {
            if (!eventCatalogService) {
              return;
            }

            eventCatalogService.deleteEvent(eventId).then((catalog) => {
              updateEventCatalogState(catalog);
            }).catch((error: unknown) => setErrorState(error as Error));
          }}
          onMakeSessionActive={(eventId: EventId, sessionId: SessionId) => {
            if (!eventCatalogService) {
              return;
            }
            eventCatalogService.activateSession(eventId, sessionId).then((catalog) => {
              updateEventCatalogState(catalog, eventId, sessionId, selectedCategoryId);
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
          onUnsavedChangesGuardChange={(guard) => setUnsavedChangesGuard('Events', guard)}
          onUpdateEvent={(eventId, changes) => {
            if (!eventCatalogService) {
              return;
            }
            return eventCatalogService.updateEvent(eventId, changes).then((catalog) => {
              updateEventCatalogState(catalog, eventId);
            }).catch((error: unknown) => {
              setErrorState(error as Error);
              throw error;
            });
          }}
          selectedEventId={selectedEventId}
          selectedSessionId={selectedSessionId}
        />
      );
    }

    if (activeSection === 'Sessions') {
      return (
        <SessionsContext
          catalog={eventCatalogState}
          config={systemConfigState}
          onApplySessionSources={(eventId: EventId, sessionId: SessionId) => {
            applySessionSources(eventId, sessionId).catch((error: unknown) => {
              setErrorState(error as Error);
            });
          }}
          onCreateSession={(eventId: EventId) => {
            if (!validateUuid(eventId)) {
              throw new Error(`Invalid eventId provided: ${eventId}`);
            }
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
          onMakeSessionActive={(eventId: EventId, sessionId: SessionId) => {
            if (!validateUuid(eventId)) {
              throw new Error(`Invalid eventId provided: ${eventId}`);
            }
            if (!validateUuid(sessionId)) {
              throw new Error(`Invalid sessionId provided: ${sessionId}`);
            }
            const activate = async (): Promise<void> => {
              setSelectedSessionsEventId(eventId);
              setSelectedSessionId(sessionId);
              setSelectedEventId(eventId);

              if (eventCatalogService) {
                const catalog = await eventCatalogService.activateSession(eventId, sessionId);
                updateEventCatalogState(catalog, eventId, sessionId, selectedCategoryId);
              }

              await applySessionSources(eventId, sessionId, {
                cachedSpreadsheetOnly: true,
                preferCachedSpreadsheet: true,
                preferPersistedRaceState: true,
                replaceSessionState: true,
              });
            };

            activate().catch((error: unknown) => {
              setErrorState(error as Error);
            });
          }}
          onMoveSessionToEvent={(sessionId, eventId) => {
            if (!eventCatalogService) {
              return;
            }
            eventCatalogService.moveSessionToEvent(sessionId, eventId).then((catalog) => {
              updateEventCatalogState(catalog, eventId, sessionId, selectedCategoryId);
            }).catch((error: unknown) => setErrorState(error as Error));
          }}
          onReloadSessionSources={(eventId, sessionId, mode) => {
            reloadSessionSources(eventId, sessionId, mode).then((summary) => {
              setReloadSummary(summary);
            }).catch((error: unknown) => {
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
          onSaveSessionCategoryAssignment={(sessionId, categoryId, assigned) => {
            if (!eventCatalogService) {
              return;
            }

            const session = eventCatalogState.sessions.find((item) => item.id === sessionId);
            if (!session) {
              return;
            }

            const existingCategoryIds = session.categoryIds || [];
            const nextCategoryIds = assigned
              ? Array.from(new Set([...existingCategoryIds, categoryId]))
              : existingCategoryIds.filter((id) => id !== categoryId);

            return eventCatalogService.updateSession(sessionId, { categoryIds: nextCategoryIds }).then((catalog) => {
              updateEventCatalogState(catalog, selectedSessionsEventId, sessionId, categoryId);
            }).catch((error: unknown) => {
              setErrorState(error as Error);
              throw error;
            });
          }}
          onSelectSession={setSelectedSessionId}
          onUnsavedChangesGuardChange={(guard) => setUnsavedChangesGuard('Sessions', guard)}
          onUpdateSession={(sessionId, changes) => {
            if (!eventCatalogService) {
              return;
            }
            return eventCatalogService.updateSession(sessionId, changes).then((catalog) => {
              updateEventCatalogState(catalog, selectedSessionsEventId, sessionId, selectedCategoryId);
            }).catch((error: unknown) => {
              setErrorState(error as Error);
              throw error;
            });
          }}
          selectedEventId={selectedSessionsEventId}
          selectedSessionId={selectedSessionId}
        />
      );
    }

    if (activeSection === 'Categories') {
      return (
        <CategoriesContext
          catalog={eventCatalogState}
          entrants={selectedCategoryEntrants}
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
          onDisplayError={logDisplayedError}
          onSelectCategory={setSelectedCategoryId}
          onSelectEvent={selectCategoriesEvent}
          onUnsavedChangesGuardChange={(guard) => setUnsavedChangesGuard('Categories', guard)}
          onUpdateCategory={(categoryId: EventCategoryId, changes) => {
            if (!eventCatalogService) {
              return;
            }

            return eventCatalogService.updateCategory(categoryId, changes).then((catalog) => {
              const activeEventId = eventCatalogState.activeEventId;
              if (selectedCategoryEventId && selectedCategoryEventId === activeEventId) {
                sessionState.updateCategoryDetails(categoryId, {
                  code: changes.code,
                  description: changes.description,
                  excludeFromResults: changes.excludeFromResults,
                  name: changes.name,
                });
                setRenderTick((tick) => tick + 1);
              }
              updateEventCatalogState(catalog, selectedCategoryEventId, selectedSessionId, categoryId);
            });
          }}
          onUpdateCategorySessionAssignments={(categoryId, sessionIds) => {
            if (!eventCatalogService || !selectedCategoryEventId) {
              return;
            }

            const selectedSessionIds = new Set(sessionIds);
            const eventSessions = getSessionsForEvent(eventCatalogService.catalog, selectedCategoryEventId);
            const updates = eventSessions.flatMap((session) => {
              const existingCategoryIds = session.categoryIds || [];
              const isAssigned = existingCategoryIds.includes(categoryId);
              const shouldBeAssigned = selectedSessionIds.has(session.id);
              if (isAssigned === shouldBeAssigned) {
                return [];
              }

              const nextCategoryIds = shouldBeAssigned
                ? Array.from(new Set([...existingCategoryIds, categoryId]))
                : existingCategoryIds.filter((id) => id !== categoryId);

              return [{
                changes: { categoryIds: nextCategoryIds },
                sessionId: session.id,
              }];
            });

            return eventCatalogService.updateSessions(updates).then((catalog) => {
              if (catalog) {
                updateEventCatalogState(catalog, selectedCategoryEventId, selectedSessionId, categoryId);
              }
            }).catch((error: unknown) => {
              setErrorState(error as Error);
              throw error;
            });
          }}
          selectedCategoryId={resolvedSelectedCategoryId}
          selectedEventId={selectedCategoryEventId}
        />
      );
    }

    if (activeSection === 'Entrants') {
      return (
        <EntrantsContext
          catalog={eventCatalogState}
          onCreateEntrant={(eventId, entrantType) => {
            if (!eventCatalogService) {
              return;
            }
            eventCatalogService.createEntrant(eventId, entrantType).then((catalog) => {
              const event = catalog.events.find((item) => item.id === eventId);
              const entrantLabels = getEventDisciplineLabels(event?.discipline);
              const entrantName = entrantType === 'team' ? 'New Team' : `New ${entrantLabels.singular}`;
              const entrant = getEntrantsForEvent(catalog, eventId).find((item) => item.name === entrantName);
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
          onUnsavedChangesGuardChange={(guard) => setUnsavedChangesGuard('Entrants', guard)}
          onUpdateParticipantIdentifiers={(participantId, identifierType, values) => {
            if (!eventCatalogService || !selectedEntrantsResolvedEventId || !selectedEntrantsResolvedSessionId) {
              return;
            }

            const isActiveSession = selectedEntrantsResolvedEventId === eventCatalogState.activeEventId &&
              selectedEntrantsResolvedSessionId === eventCatalogState.activeSessionId;
            const raceStateForUpdate = isActiveSession && sessionState
              ? sessionState
              : selectedEntrantsImportedRaceState
                ? sessionFromPartialRaceState(selectedEntrantsImportedRaceState)
                : undefined;
            if (!raceStateForUpdate) {
              return;
            }

            if (!raceStateForUpdate.getParticipantById(participantId)) {
              const selectedEntrant = getEntrantsForEvent(eventCatalogState, selectedEntrantsResolvedEventId)
                .find((entrant) => entrant.id === selectedEntrantId || entrant.memberParticipantIds.includes(participantId));
              if (!selectedEntrant || selectedEntrant.entrantType !== 'rider') {
                return;
              }

              raceStateForUpdate.addParticipants([createParticipantFromEntrant(selectedEntrant, participantId)]);
            }
            raceStateForUpdate.updateParticipantIdentifiers(participantId, identifierType, values);
            const nextRaceState = raceStateSnapshot(raceStateForUpdate);

            return eventCatalogService.updateImportedRaceState(
              selectedEntrantsResolvedEventId,
              selectedEntrantsResolvedSessionId,
              nextRaceState,
            ).then((catalog) => {
              if (isActiveSession) {
                setSessionState(raceStateForUpdate);
              }
              updateEventCatalogState(catalog, selectedEntrantsResolvedEventId, selectedEntrantsResolvedSessionId, selectedCategoryId);
              setRenderTick((tick) => tick + 1);
            }).catch((error: unknown) => {
              setErrorState(error as Error);
              throw error;
            });
          }}
          onUpdateEntrant={(entrantId, changes) => {
            if (!eventCatalogService) {
              return;
            }
            return eventCatalogService.updateEntrant(entrantId, changes).then((catalog) => {
              updateEventCatalogState(catalog, selectedEntrantsEventId, selectedSessionId, selectedCategoryId);
              setSelectedEntrantId(entrantId);
            }).catch((error: unknown) => {
              setErrorState(error as Error);
              throw error;
            });
          }}
          raceState={displayedEntrantsRaceState}
          selectedEntrantId={selectedEntrantId}
          selectedEventId={selectedEntrantsResolvedEventId}
        />
      );
    }

    if (activeSection === 'Results') {
      return (
        <ResultsContext
          categories={sessionScopedCategories}
          eventSessionOptions={eventSessionOptions}
          catalogEntrants={getEntrantsForEvent(eventCatalogState, selectedResultsEventId)}
          onSelectEventSession={selectAnalyticsEventSession}
          raceState={displayedAnalyticsRaceState}
          selectedCategoryId={selectedCategoryId}
          selectedEventSessionValue={selectedEventSessionValue}
        />
      );
    }

    if (activeSection === 'Reports') {
      return (
        <ReportsContext
          categories={sessionScopedCategories}
          eventSessionOptions={eventSessionOptions}
          catalogEntrants={getEntrantsForEvent(eventCatalogState, selectedResultsEventId)}
          onSelectEventSession={selectAnalyticsEventSession}
          raceState={displayedAnalyticsRaceState}
          selectedCategoryId={selectedCategoryId}
          selectedEventSessionValue={selectedEventSessionValue}
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

  return renderShell(sectionContent());
};


