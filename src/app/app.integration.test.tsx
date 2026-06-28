// @vitest-environment jsdom

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import XLSX from 'xlsx';
import { convertApicalSpreadsheetRowsToApicalData } from '../controllers/apical/apicalSpreadsheetProcessor.js';
import { CategoryId } from '../controllers/category.js';
import type { ApicalLapByCategory } from '../model/apical.js';
import { createSessionId } from '../model/ids.js';
import { EventId, SessionId } from '../model/raceevent.js';
import { TimeRecordId } from '../model/timerecord.js';
import { convertDataToRaceState } from '../parsers/apical.js';
import { useUiConsoleGuards } from '../testing/uiConsoleGuards.js';
import { APICAL_EXCEL_DOWNLOAD_ACCEPT_HEADER } from '../utils/apical/excelDownload.js';
import { type ApicalSpreadsheetLapsRow, createApicalCatalogEventId, createApicalCatalogSessionId, getCachedApicalExcelFilePath } from './apicalDataSource.js';
import { RaceSweetMainApp } from './App.js';
import { createSeedEventCatalogLedger } from './createSeedEventCatalogLedger.js';
import { APICAL_DEFAULT_SOURCE_NAME } from './systemConfig.js';

vi.mock('../views/display/categories', () => ({
  CategoryList: (props: { categories?: unknown[] }) => React.createElement(
    'div',
    { 'data-timing-categories': JSON.stringify(props.categories || []) },
    'Category List'
  ),
}));

vi.mock('./views/timing/categoryList.js', () => ({
  CategoryList: (props: { categories?: unknown[] }) => React.createElement(
    'div',
    { 'data-timing-categories': JSON.stringify(props.categories || []) },
    'Category List'
  ),
}));

interface MockRecentRecordsProps {
  onAddRecord?: (record: { id: TimeRecordId; recordType: number; sequence: number; sessionId: SessionId; source: string }) => void;
  onAssignFlagCategory?: (flagId: TimeRecordId, categoryId: CategoryId) => void;
  onMarkFlagDeleted?: (flagId: TimeRecordId, deleted: boolean) => void;
  onRemoveFlagCategory?: (flagId: TimeRecordId, categoryId: CategoryId) => void;
  raceStateLookup?: { categories?: Array<{ id: CategoryId }> };
  records: Array<{ categoryIds?: CategoryId[]; flagType?: string; id: TimeRecordId }>;
}

vi.mock('../views/display/recent', async () => {
  const react = await import('react');
  const MockRecentRecords = (props: MockRecentRecordsProps): React.ReactElement => {
    const flagRecord = props.records.find((record) => record.flagType);
    const assignedCategoryId = flagRecord?.categoryIds?.[0];
    const assignCategoryId = props.raceStateLookup?.categories?.find((category) => category.id !== assignedCategoryId)?.id ||
      props.raceStateLookup?.categories?.[0]?.id;

    return react.createElement(
      'div',
      {
        'data-timing-categories': JSON.stringify(props.raceStateLookup?.categories || []),
        'data-timing-record-count': props.records.length,
      },
      `Recent Records (${props.records.length})`,
      react.createElement('button', {
        'data-action': 'add-record',
        onClick: () => props.onAddRecord?.({
          id: 'manual-record-1',
          recordType: 16,
          sequence: 999,
          sessionId: '1b6f4b9f-5b0a-4d3f-9d5d-5f0c7c77f111',
          source: 'manual-source',
        }),
      }, 'Add record'),
      flagRecord && react.createElement('button', {
        'data-action': 'mark-flag-deleted',
        onClick: () => props.onMarkFlagDeleted?.(flagRecord.id, true),
      }, 'Mark flag deleted'),
      flagRecord && assignedCategoryId && react.createElement('button', {
        'data-action': 'remove-flag-category',
        onClick: () => props.onRemoveFlagCategory?.(flagRecord.id, assignedCategoryId),
      }, 'Remove flag category'),
      flagRecord && assignCategoryId && react.createElement('button', {
        'data-action': 'assign-flag-category',
        onClick: () => props.onAssignFlagCategory?.(flagRecord.id, assignCategoryId),
      }, 'Assign flag category')
    );
  };

  return { RecentRecords: MockRecentRecords };
});

vi.mock('./views/timing/recentRecords', async () => {
  const react = await import('react');
  const MockRecentRecords = (props: MockRecentRecordsProps): React.ReactElement => {
    const flagRecord = props.records.find((record) => record.flagType);
    const assignedCategoryId = flagRecord?.categoryIds?.[0];
    const assignCategoryId = props.raceStateLookup?.categories?.find((category) => category.id !== assignedCategoryId)?.id ||
      props.raceStateLookup?.categories?.[0]?.id;

    return react.createElement(
      'div',
      {
        'data-timing-categories': JSON.stringify(props.raceStateLookup?.categories || []),
        'data-timing-record-count': props.records.length,
      },
      `Recent Records (${props.records.length})`,
      react.createElement('button', {
        'data-action': 'add-record',
        onClick: () => props.onAddRecord?.({
          id: 'manual-record-1',
          recordType: 16,
          sequence: 999,
          sessionId: '1b6f4b9f-5b0a-4d3f-9d5d-5f0c7c77f111',
          source: 'manual-source',
        }),
      }, 'Add record'),
      flagRecord && react.createElement('button', {
        'data-action': 'mark-flag-deleted',
        onClick: () => props.onMarkFlagDeleted?.(flagRecord.id, true),
      }, 'Mark flag deleted'),
      flagRecord && assignedCategoryId && react.createElement('button', {
        'data-action': 'remove-flag-category',
        onClick: () => props.onRemoveFlagCategory?.(flagRecord.id, assignedCategoryId),
      }, 'Remove flag category'),
      flagRecord && assignCategoryId && react.createElement('button', {
        'data-action': 'assign-flag-category',
        onClick: () => props.onAssignFlagCategory?.(flagRecord.id, assignCategoryId),
      }, 'Assign flag category')
    );
  };

  return { RecentRecords: MockRecentRecords };
});

const SEED_QUALIFYING_SESSION_ID = createSessionId('session-1-qualifying');
const SEED_RACE_SESSION_ID = createSessionId('session-1-race');
const UUID_TEXT_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const readFixtureBuffer = async (filePath: string): Promise<Buffer> => {
  const fileName = path.basename(filePath);
  const fixturePath = path.join(process.cwd(), 'src', 'testdata', fileName);
  return readFile(fixturePath);
};

const readGeneratedFixture = async (filePath: string): Promise<string> => {
  if (filePath.includes('event-catalog.json')) {
    return JSON.stringify({ mutations: [], schemaVersion: 1 });
  }

  if (filePath.includes('system-config.json')) {
    return JSON.stringify({
      dataSources: [],
      eventSourceAssignments: {},
      schemaVersion: 1,
      sessionSourceAssignments: {},
    });
  }

  if (filePath.includes('admin-overrides.json')) {
    return JSON.stringify({ entrantCategories: {}, excludedCrossings: {}, schemaVersion: 1 });
  }

  throw new Error(`Unknown generated file requested: ${filePath}`);
};

const readGeneratedFixtureWithConfiguredApicalSource = async (filePath: string): Promise<string> => {
  if (filePath.includes('event-catalog.json')) {
    return JSON.stringify({ mutations: [], schemaVersion: 1 });
  }

  if (filePath.includes('system-config.json')) {
    return JSON.stringify({
      dataSources: [
        {
          apiConfig: {
            apicalEventId: 1001,
            authHeaderName: 'Authorization',
            authHeaderValue: 'Bearer token',
            baseUrl: 'https://apical.example.com',
            companyId: 2,
            httpTimeoutSeconds: 10,
            live: false,
            pollIntervalSeconds: 30,
            selectedEventIds: [1001],
          },
          enabled: true,
          id: 'source-apical',
          listedEvents: [],
          name: 'Apical Source',
          type: 'api-apical-excel-file',
        },
      ],
      eventSourceAssignments: {},
      schemaVersion: 1,
      sessionSourceAssignments: {},
    });
  }

  if (filePath.includes('admin-overrides.json')) {
    throw new Error('ENOENT: no such file or directory');
  }

  throw new Error(`Unknown generated file requested: ${filePath}`);
};

const readGeneratedFixtureWithTimingAssignedApicalSource = async (filePath: string): Promise<string> => {
  if (filePath.includes('event-catalog.json')) {
    return JSON.stringify({ mutations: [], schemaVersion: 1 });
  }

  if (filePath.includes('system-config.json')) {
    return JSON.stringify({
      dataSources: [
        {
          apiConfig: {
            apicalEventId: 1001,
            authHeaderName: 'Authorization',
            authHeaderValue: 'Bearer token',
            baseUrl: 'https://apical.example.com',
            companyId: 2,
            httpTimeoutSeconds: 10,
            live: false,
            pollIntervalSeconds: 30,
            selectedEventIds: [1001],
          },
          enabled: true,
          id: 'source-apical',
          listedEvents: [],
          name: 'Apical Source',
          type: 'api-apical-excel-file',
        },
      ],
      eventSourceAssignments: {},
      schemaVersion: 1,
      sessionSourceAssignments: {
        [SEED_QUALIFYING_SESSION_ID]: {
          mode: 'specific',
          sourceIds: ['source-apical'],
        },
      },
    });
  }

  if (filePath.includes('admin-overrides.json')) {
    return JSON.stringify({ entrantCategories: {}, excludedCrossings: {}, schemaVersion: 1 });
  }

  throw new Error(`Unknown generated file requested: ${filePath}`);
};

const readGeneratedFixtureWithListedApicalSource = (sourceName: string) => async (filePath: string): Promise<string> => {
  if (filePath.includes('event-catalog.json')) {
    return JSON.stringify({ mutations: [], schemaVersion: 1 });
  }

  if (filePath.includes('system-config.json')) {
    return JSON.stringify({
      dataSources: [
        {
          apiConfig: {
            apicalEventId: 1001,
            authHeaderName: 'Authorization',
            authHeaderValue: '',
            baseUrl: 'https://apical.example.com',
            companyId: 2,
            httpTimeoutSeconds: 10,
            live: false,
            pollIntervalSeconds: 30,
            selectedEventIds: [1001],
          },
          enabled: true,
          id: 'source-apical',
          listedEvents: [
            {
              eventDate: '2025-06-06T00:00:00.000Z',
              id: 1001,
              name: 'Apical Downloaded Round',
            },
          ],
          name: sourceName,
          type: 'api-apical-excel-file',
        },
      ],
      eventSourceAssignments: {},
      schemaVersion: 1,
      sessionSourceAssignments: {},
    });
  }

  if (filePath.includes('admin-overrides.json')) {
    throw new Error('ENOENT: no such file or directory');
  }

  throw new Error(`Unknown generated file requested: ${filePath}`);
};

const readApicalDataFixture = async (): Promise<ApicalLapByCategory> => {
  const content = await readFile(path.join(process.cwd(), 'src', 'testdata', '2025-06-06-data.json'), 'utf8');
  return JSON.parse(content) as ApicalLapByCategory;
};

const apicalDataToSpreadsheetRows = (apicalData: ApicalLapByCategory): ApicalSpreadsheetLapsRow[] => {
  return apicalData.flatMap((category) => {
    return category.ParticipantViewModels.flatMap((entrant) => {
      return entrant.LapByCategoryViewModels.map((lap): ApicalSpreadsheetLapsRow => {
        const lapWithOptionalTimeOfDay = lap as typeof lap & { TimeOfDay?: string | number };
        return {
          CategoryName: category.CategoryName,
          CumulativeLapTimeSpan: lap.CumulativeLapTimeSpan,
          FullName: lap.FullName,
          LapNumber: lap.LapNumber,
          LapTimeSpan: lap.LapTimeSpan,
          Position: entrant.Position,
          RaceNumber: lap.RaceNumber,
          TeamNameDisplay: entrant.TeamNameDisplay,
          TimeOfDay: lapWithOptionalTimeOfDay.TimeOfDay || lap.CumulativeLapTimeSpan,
        };
      });
    });
  });
};

const expectRequiredDownloadHeaders = (headers: Headers, baseUrl: string, eventId: number, cookie: string): void => {
  const trimmedBaseUrl = baseUrl.replace(/\/$/, '');
  expect(headers.get('Accept')).toBe(APICAL_EXCEL_DOWNLOAD_ACCEPT_HEADER);
  expect(headers.get('Accept-Encoding')).toBe('gzip, deflate, br, zstd');
  expect(headers.get('Cache-Control')).toBe('max-age=0');
  expect(headers.get('Cookie')).toBe(cookie);
  expect(headers.get('Referrer')).toBe(`${trimmedBaseUrl}/raceresult/event/detail?id=${eventId}`);
  expect(headers.get('Sec-Fetch-Dest')).toBe('document');
  expect(headers.get('Sec-Fetch-Mode')).toBe('navigate');
  expect(headers.get('Sec-Fetch-Site')).toBe('none');
  expect(headers.get('Sec-Fetch-User')).toBe('?1');
  expect(headers.get('Upgrade-Insecure-Requests')).toBe('1');
};

const createApicalWorkbookResponse = (apicalData: ApicalLapByCategory): Response => {
  const rows = apicalDataToSpreadsheetRows(apicalData);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Laps');
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;

  return new Response(buffer, { status: 200 });
};

const createApicalWorkbookBuffer = async (apicalData: ApicalLapByCategory): Promise<Buffer> => {
  const response = createApicalWorkbookResponse(apicalData);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

const clickSectionButton = async (container: HTMLDivElement, sectionName: string): Promise<void> => {
  const sectionButton = container.querySelector(`button[aria-label="${sectionName}"]`) as HTMLButtonElement | null;
  expect(sectionButton).toBeTruthy();

  await act(async () => {
    sectionButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const waitForLoadedApp = async (container: HTMLDivElement): Promise<void> => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (!container.textContent?.includes('Loading...')) {
      return;
    }

    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
    });
  }

  throw new Error('Timed out waiting for RaceSweetMainApp to load');
};

const setInputValue = (input: HTMLInputElement | HTMLTextAreaElement, value: string): void => {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

const blurInput = (input: HTMLInputElement | HTMLTextAreaElement): void => {
  input.dispatchEvent(new Event('focusout', { bubbles: true }));
};

const setSelectValue = (select: HTMLSelectElement, value: string): void => {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  descriptor?.set?.call(select, value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
};

const clickButtonByText = async (container: HTMLDivElement, label: string): Promise<void> => {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent === label) as HTMLButtonElement | undefined;
  expect(button).toBeTruthy();

  await act(async () => {
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const getIndividualEntrantCards = (container: HTMLDivElement): HTMLButtonElement[] => {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button.events-list-item'))
    .filter((button) => button.querySelector('.entrant-list-type')?.textContent === 'rider');
};

const getEntrantCardName = (card: HTMLButtonElement): string => {
  const cardName = card.querySelector('.entrant-list-name')?.textContent || '';
  expect(cardName.length).toBeGreaterThan(0);
  return cardName;
};

const waitForText = async (container: HTMLDivElement, text: string): Promise<void> => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (container.textContent?.includes(text)) {
      return;
    }

    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
    });
  }

  throw new Error(`Timed out waiting for text: ${text}; current text: ${container.textContent?.slice(0, 1000) || ''}`);
};

const waitForInputValue = async (container: HTMLDivElement, selector: string, value: string): Promise<void> => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const input = container.querySelector(selector) as HTMLInputElement | null;
    if (input && input.value === value) {
      return;
    }

    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
    });
  }

  throw new Error(`Timed out waiting for input value: ${selector}=${value}`);
};

const waitForTextNotPresent = async (container: HTMLDivElement, text: string): Promise<void> => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (!container.textContent?.includes(text)) {
      return;
    }

    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
    });
  }

  throw new Error(`Timed out waiting for text to disappear: ${text}`);
};

const APP_TEST_STYLE_TAG = 'data-testid';
const APP_TEST_STYLE_TAG_VALUE = 'racesweet-app-styles';

const ensureAppStylesLoaded = async (): Promise<void> => {
  const existingStyle = document.head.querySelector(`style[${APP_TEST_STYLE_TAG}="${APP_TEST_STYLE_TAG_VALUE}"]`);
  if (existingStyle) {
    return;
  }

  const stylePath = path.join(process.cwd(), 'src', 'app', 'index.css');
  const cssText = await readFile(stylePath, 'utf8');
  const style = document.createElement('style');
  style.setAttribute(APP_TEST_STYLE_TAG, APP_TEST_STYLE_TAG_VALUE);
  style.textContent = cssText;
  document.head.appendChild(style);
};

const getAppStylesheet = (): CSSStyleSheet => {
  const styleElement = document.head.querySelector(`style[${APP_TEST_STYLE_TAG}="${APP_TEST_STYLE_TAG_VALUE}"]`) as HTMLStyleElement | null;
  expect(styleElement).toBeTruthy();
  expect(styleElement!.sheet).toBeTruthy();
  return styleElement!.sheet as CSSStyleSheet;
};

const getMediaRule = (sheet: CSSStyleSheet, queryText: string): CSSMediaRule | undefined => {
  const rules = Array.from(sheet.cssRules);
  return rules.find((rule) => {
    return rule instanceof CSSMediaRule && rule.conditionText.includes(queryText);
  }) as CSSMediaRule | undefined;
};

const getFirstBodyRule = (mediaRule: CSSMediaRule): CSSStyleRule | undefined => {
  const rules = Array.from(mediaRule.cssRules);
  return rules.find((rule) => {
    return rule instanceof CSSStyleRule && rule.selectorText === 'body';
  }) as CSSStyleRule | undefined;
};

interface ApicalImportScenario {
  apicalData: ApicalLapByCategory;
  expectedCategoryCount: number;
  expectedCrossingCount: number;
  expectedEntrantCount: number;
  expectedRecentRecordCount: number;
  fetchMock: ReturnType<typeof vi.spyOn>;
  importedEventId: EventId;
  writtenConfig: {
    dataSources: Array<{ apicalDataFilePath?: string; dataLastRetrieved?: string; name?: string }>;
    eventSourceAssignments: Record<string, string[]>;
    sessionSourceAssignments: Record<string, { mode: string; sourceIds: string[] }>;
  };
  writtenFiles: Array<{ content: string; dataType?: string; filePath: string }>;
}

const createApicalImportExpectations = async (): Promise<{
  apicalData: ApicalLapByCategory;
  expectedCategoryCount: number;
  expectedCrossingCount: number;
  expectedEntrantCount: number;
  expectedRecentRecordCount: number;
}> => {
  const apicalData = await readApicalDataFixture();
  const excelApicalData = convertApicalSpreadsheetRowsToApicalData(apicalDataToSpreadsheetRows(apicalData));
  const convertedFixture = convertDataToRaceState(
    createApicalCatalogEventId(1001),
    new Date('2025-06-06T00:00:00.000Z'),
    excelApicalData,
    200000
  );
  const expectedCategoryCount = new Set((convertedFixture.categories || []).map((category) => {
    return `${(category.code || '').trim().toLowerCase()}|${(category.name || '').trim().toLowerCase()}`;
  })).size;
  const participantGroups = new Map<string, number>();
  (convertedFixture.participants || []).forEach((participant) => {
    const entrantId = participant.entrantId.toString() || participant.id.toString();
    participantGroups.set(entrantId, (participantGroups.get(entrantId) || 0) + 1);
  });
  const expectedEntrantCount = (convertedFixture.participants || []).length +
    Array.from(participantGroups.values()).filter((count) => count > 1).length;
  const expectedCrossingCount = apicalData.reduce((count, category) => {
    return count + category.ParticipantViewModels.reduce((lapCount, entrant) => lapCount + entrant.LapByCategoryViewModels.length, 0);
  }, 0);
  const expectedRecentRecordCount = (convertedFixture.records || []).length;

  return {
    apicalData,
    expectedCategoryCount,
    expectedCrossingCount,
    expectedEntrantCount,
    expectedRecentRecordCount,
  };
};

const mockApicalExcelFetch = (apicalData: ApicalLapByCategory): ReturnType<typeof vi.spyOn> => {
  return vi.spyOn(globalThis, 'fetch')
    .mockImplementation(async (url) => {
      const requestUrl = String(url);
      if (requestUrl.includes('/RaceResult/Event/ExportToExcel')) {
        return new Response(JSON.stringify({
          FileGuid: '11111111-1111-4111-8111-111111111111',
          FileName: 'Apical Downloaded Round.xlsx',
        }), {
          headers: {
            'set-cookie': 'session=apical-cookie',
          },
          status: 200,
        });
      }

      if (requestUrl.includes('/Download/DownloadExcel')) {
        return createApicalWorkbookResponse(apicalData);
      }

      return new Response('Unexpected Apical test URL', { status: 404, statusText: 'Not Found' });
    });
};

const renderAndFetchApicalImport = async (
  root: Root,
  container: HTMLDivElement,
  requestFileContent = readGeneratedFixtureWithListedApicalSource('Apical Source')
): Promise<ApicalImportScenario> => {
  const writtenFiles: Array<{ content: string; dataType?: string; filePath: string }> = [];
  const expectations = await createApicalImportExpectations();

  (window as unknown as {
    api: {
      requestBuffer: (filePath: string) => Promise<Buffer>;
      requestFileContent: <T>(filePath: string, dataType: string) => Promise<T>;
      writeFileContent: (filePath: string, content: string, dataType?: string) => Promise<void>;
    };
  }).api = {
    requestBuffer: async (filePath: string): Promise<Buffer> => {
      const writtenFile = writtenFiles.find((write) => write.filePath === filePath && write.dataType === 'base64');
      if (writtenFile) {
        return Buffer.from(writtenFile.content, 'base64');
      }

      return readFixtureBuffer(filePath);
    },
    requestFileContent: requestFileContent as <T>(filePath: string, dataType: string) => Promise<T>,
    writeFileContent: async (filePath: string, content: string, dataType?: string) => {
      writtenFiles.push({ content, dataType, filePath });
    },
  };

  const fetchMock = mockApicalExcelFetch(expectations.apicalData);

  await act(async () => {
    root.render(<RaceSweetMainApp />);
  });

  await waitForLoadedApp(container);
  await clickButtonByText(container, 'Fetch event data now');
  await waitForTextNotPresent(container, 'Data last retrieved: Never');

  const latestConfigWrite = writtenFiles
    .filter((write) => write.filePath.includes('system-config.json'))
    .at(-1);
  expect(latestConfigWrite).toBeDefined();
  const writtenConfig = JSON.parse(latestConfigWrite!.content) as ApicalImportScenario['writtenConfig'];
  const importedEventId = Object.keys(writtenConfig.eventSourceAssignments).find((eventId) => {
    return writtenConfig.eventSourceAssignments[eventId]?.includes('source-apical');
  });
  expect(importedEventId).toBeDefined();

  return {
    ...expectations,
    fetchMock,
    importedEventId: importedEventId!,
    writtenConfig,
    writtenFiles,
  };
};

describe('RaceSweetMainApp integration', () => {
  let container: HTMLDivElement;
  let root: Root;

  useUiConsoleGuards({
    allowErrorPatterns: [/Apical .* request returned HTTP/, /Failed to fetch Apical events for source/, /Failed to fetch Apical event data for source/],
    allowWarnPatterns: [
      /Apical authentication response did not include readable cookie data/,
      /RaceSweet cannot (read from|write to) .*Windows denied file access/i,
    ],
  });

  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    const requestFileContent = async (filePath: string, _dataType: string): Promise<string> => {
      return readGeneratedFixture(filePath);
    };

    (window as unknown as {
      api: {
        requestBuffer: (filePath: string) => Promise<Buffer>;
        requestFileContent: <T>(filePath: string, dataType: string) => Promise<T>;
        writeFileContent: (filePath: string, content: string) => Promise<void>;
      };
    }).api = {
      requestBuffer: readFixtureBuffer,
      requestFileContent: requestFileContent as <T>(filePath: string, dataType: string) => Promise<T>,
      writeFileContent: async () => undefined,
    };
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.head.querySelector(`style[${APP_TEST_STYLE_TAG}="${APP_TEST_STYLE_TAG_VALUE}"]`)?.remove();
    delete (window as unknown as { api?: unknown }).api;
    vi.restoreAllMocks();
  });

  it('renders each main panel with key controls visible', async () => {
    await ensureAppStylesLoaded();

    await act(async () => {
      root.render(<RaceSweetMainApp />);
    });

    await waitForLoadedApp(container);

    expect(container.textContent).not.toContain('Error loading content');
    expect(container.querySelector('h1')?.textContent).toBe('System');
    expect(container.textContent).not.toContain('Recent Records');

    await clickSectionButton(container, 'System');
    expect(container.querySelector('h1')?.textContent).toBe('System');
    expect(container.textContent).toContain('Data Source Type');
    expect(container.textContent).toContain('Add Data Source');

    await clickSectionButton(container, 'Events');
    expect(container.querySelector('h1')?.textContent).toBe('Events');
    expect(container.textContent).toContain('Event Details');
    expect(container.textContent).toContain('Session List');

    await clickSectionButton(container, 'Entrants');
    expect(container.querySelector('h1')?.textContent).toBe('Entrants');
    expect(container.textContent).toContain('Create Entrant');
    expect(container.querySelector('input[aria-label="Entrant Name"]')).toBeTruthy();

    await clickSectionButton(container, 'Categories');
    expect(container.querySelector('h1')?.textContent).toBe('Categories');
    expect(container.textContent).toContain('Create Category');
    expect(container.querySelector('input[aria-label="Category Name"]')).toBeTruthy();

    await clickSectionButton(container, 'Sessions');
    expect(container.querySelector('h1')?.textContent).toBe('Sessions');
    expect(container.textContent).toContain('Create Session');
    expect(container.textContent).toContain('Active Session');
    expect(container.querySelector('input[aria-label="Sessions Page Name"]')).toBeTruthy();

    await clickSectionButton(container, 'Timing');
    expect(container.querySelector('h1')?.textContent).toBe('Timing');
    expect(container.textContent).toContain('Recent Records');

    await clickSectionButton(container, 'Results');
    expect(container.querySelector('h1')?.textContent).toBe('Results');
    expect(container.textContent).toContain('Session race standings and lap-chart view for the selected category scope.');
    expect(container.querySelector('select[aria-label="Race View Event Session"]')).toBeTruthy();
    expect(container.querySelector('select[aria-label="Race View Category"]')).toBeTruthy();
    expect(container.querySelector('select[aria-label="Results View Type"]')).toBeTruthy();

    await clickSectionButton(container, 'Reports');
    expect(container.querySelector('h1')?.textContent).toBe('Reports');
    expect(container.textContent).toContain('Category-scoped reports for fastest laps, participant lap times, and lap chart.');
    expect(container.querySelector('select[aria-label="Race View Event Session"]')).toBeTruthy();
    expect(container.querySelector('select[aria-label="Reports View Type"]')).toBeTruthy();
    expect(container.querySelector('select[aria-label="Race View Category"]')).toBeTruthy();
    expect(container.textContent).toContain('Handicap Data');
  });

  it('routes individual entrant card selections through app state to details and identification panels', async () => {
    await act(async () => {
      root.render(<RaceSweetMainApp />);
    });

    await waitForLoadedApp(container);
    await clickSectionButton(container, 'Entrants');
    await waitForText(container, 'Entrant List');

    const individualCards = getIndividualEntrantCards(container)
      .filter((card) => card.querySelector('.entrant-race-number'));
    expect(individualCards.length).toBeGreaterThanOrEqual(2);

    const firstCardName = getEntrantCardName(individualCards[0]);
    const secondCardName = getEntrantCardName(individualCards[1]);
    expect(firstCardName).not.toBe(secondCardName);

    await act(async () => {
      individualCards[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect((container.querySelector('input[aria-label="Entrant Name"]') as HTMLInputElement).value).toBe(firstCardName);
    const initialRacePlateInput = container.querySelector<HTMLInputElement>('input[aria-label^="Race plate "]');
    expect(initialRacePlateInput?.getAttribute('aria-label')).toContain(firstCardName);

    await act(async () => {
      individualCards[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect((container.querySelector('input[aria-label="Entrant Name"]') as HTMLInputElement).value).toBe(secondCardName);
    const selectedRacePlateInput = container.querySelector<HTMLInputElement>('input[aria-label^="Race plate "]');
    expect(selectedRacePlateInput?.getAttribute('aria-label')).toContain(secondCardName);
  });

  it('adds identifiers for a selected rider before that rider has a race-state participant', async () => {
    await act(async () => {
      root.render(<RaceSweetMainApp />);
    });

    await waitForLoadedApp(container);
    await clickSectionButton(container, 'Entrants');
    await clickButtonByText(container, 'Create Entrant');
    await waitForInputValue(container, 'input[aria-label="Entrant Name"]', 'New Entrant');

    const racePlateInput = container.querySelector('input[aria-label="Race plate New Entrant 1"]') as HTMLInputElement | null;
    expect(racePlateInput).toBeTruthy();

    await act(async () => {
      setInputValue(racePlateInput!, '#66');
      blurInput(racePlateInput!);
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain('ParticipantNotFoundError');
    expect(container.textContent).not.toContain('Error loading content');
  });

  it('shows source-mapped stack details when content loading fails', async () => {
    const persistenceError = new Error('Catalog ledger could not be written');
    persistenceError.stack = [
      'Error: Catalog ledger could not be written',
      '    at writeCatalog (webpack://racesweet/./src/app/eventCatalogPersistence.ts:84:7)',
      '    at async RaceSweetMainApp (webpack://racesweet/./src/app/App.tsx:659:15)',
    ].join('\n');

    (window as unknown as {
      api: {
        requestBuffer: (filePath: string) => Promise<Buffer>;
        requestFileContent: <T>(filePath: string, dataType: string) => Promise<T>;
        writeFileContent: (filePath: string, content: string) => Promise<void>;
      };
    }).api = {
      requestBuffer: readFixtureBuffer,
      requestFileContent: readGeneratedFixture as <T>(filePath: string, dataType: string) => Promise<T>,
      writeFileContent: async (filePath: string) => {
        if (filePath.includes('event-catalog.json')) {
          throw persistenceError;
        }
      },
    };

    await act(async () => {
      root.render(<RaceSweetMainApp />);
    });

    await waitForText(container, 'Error loading content');

    const errorDetails = container.querySelector('.error pre');
    expect(errorDetails).toBeTruthy();
    expect(errorDetails!.textContent).toContain('Catalog ledger could not be written');
    expect(errorDetails!.textContent).toContain('Error: Catalog ledger could not be written');
    expect(errorDetails!.textContent).toContain('webpack://racesweet/./src/app/eventCatalogPersistence.ts:84:7');
    expect(errorDetails!.textContent).toContain('webpack://racesweet/./src/app/App.tsx:659:15');
  });

  it('supports results and reports view selection dropdowns', async () => {
    await ensureAppStylesLoaded();

    await act(async () => {
      root.render(<RaceSweetMainApp />);
    });

    await waitForLoadedApp(container);

    await clickSectionButton(container, 'Results');
    const resultsViewSelect = container.querySelector('select[aria-label="Results View Type"]') as HTMLSelectElement;
    expect(resultsViewSelect).toBeTruthy();

    await act(async () => {
      resultsViewSelect.value = 'lap-chart';
      resultsViewSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.textContent).toContain('Lap Chart');
    expect(container.querySelector('table[aria-label="Results Lap Chart Table"]')).toBeTruthy();

    await clickSectionButton(container, 'Reports');
    const reportViewSelect = container.querySelector('select[aria-label="Reports View Type"]') as HTMLSelectElement;
    expect(reportViewSelect).toBeTruthy();

    await act(async () => {
      reportViewSelect.value = 'lap-times';
      reportViewSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.textContent).toContain('Lap Times Report');
    expect(container.textContent).toContain('Show as');
    expect(container.textContent).toContain('Participant');

    await act(async () => {
      reportViewSelect.value = 'fastest-laps';
      reportViewSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.querySelector('table[aria-label="Fastest Laps Report Table"]')).toBeTruthy();
  });

  it('keeps panel rendering healthy after edits and panel switches', async () => {
    await ensureAppStylesLoaded();

    await act(async () => {
      root.render(<RaceSweetMainApp />);
    });

    await waitForLoadedApp(container);
    expect(container.textContent).not.toContain('Error loading content');

    await clickSectionButton(container, 'Entrants');
    const entrantNameInput = container.querySelector('input[aria-label="Entrant Name"]') as HTMLInputElement;
    expect(entrantNameInput).toBeTruthy();

    await act(async () => {
      setInputValue(entrantNameInput, 'Renderer Regression Entrant');
    });

    await clickButtonByText(container, 'Save Entrant');
    await waitForInputValue(container, 'input[aria-label="Entrant Name"]', 'Renderer Regression Entrant');

    await clickSectionButton(container, 'Categories');
    expect(container.querySelector('h1')?.textContent).toBe('Categories');
    expect(container.querySelector('input[aria-label="Category Name"]')).toBeTruthy();

    await clickSectionButton(container, 'Sessions');
    const sessionNameInput = container.querySelector('input[aria-label="Sessions Page Name"]') as HTMLInputElement;
    expect(sessionNameInput).toBeTruthy();

    await act(async () => {
      setInputValue(sessionNameInput, 'Renderer Regression Session');
    });

    await clickButtonByText(container, 'Save Session');
    await waitForInputValue(container, 'input[aria-label="Sessions Page Name"]', 'Renderer Regression Session');

    await clickSectionButton(container, 'Events');
    expect(container.querySelector('h1')?.textContent).toBe('Events');
    expect(container.textContent).toContain('Event Details');

    await clickSectionButton(container, 'System');
    expect(container.querySelector('h1')?.textContent).toBe('System');
    expect(container.textContent).toContain('Configured Data Sources');

    await clickSectionButton(container, 'Timing');
    expect(container.querySelector('h1')?.textContent).toBe('Timing');
    expect(container.textContent).toContain('Recent Records');

    await clickSectionButton(container, 'Reports');
    expect(container.querySelector('h1')?.textContent).toBe('Reports');
    expect(container.textContent).toContain('Category-scoped reports for fastest laps, participant lap times, and lap chart.');

    await clickSectionButton(container, 'Entrants');
    expect(container.querySelector('h1')?.textContent).toBe('Entrants');
    await waitForInputValue(container, 'input[aria-label="Entrant Name"]', 'Renderer Regression Entrant');

    await clickSectionButton(container, 'Categories');
    expect(container.querySelector('h1')?.textContent).toBe('Categories');
    expect(container.querySelector('input[aria-label="Category Name"]')).toBeTruthy();

    await clickSectionButton(container, 'Sessions');
    expect(container.querySelector('h1')?.textContent).toBe('Sessions');
    await waitForInputValue(container, 'input[aria-label="Sessions Page Name"]', 'Renderer Regression Session');
  });

  it('updates Timing category state after saving a category result exclusion', async () => {
    const writtenFiles: Array<{ content: string; filePath: string }> = [];

    (window as unknown as {
      api: {
        requestBuffer: (filePath: string) => Promise<Buffer>;
        requestFileContent: <T>(filePath: string, dataType: string) => Promise<T>;
        writeFileContent: (filePath: string, content: string) => Promise<void>;
      };
    }).api = {
      requestBuffer: readFixtureBuffer,
      requestFileContent: readGeneratedFixture as <T>(filePath: string, dataType: string) => Promise<T>,
      writeFileContent: async (filePath: string, content: string) => {
        writtenFiles.push({ content, filePath });
      },
    };

    await act(async () => {
      root.render(<RaceSweetMainApp />);
    });

    await waitForLoadedApp(container);
    await clickSectionButton(container, 'Categories');
    const categoryAButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'A') as HTMLButtonElement | undefined;
    expect(categoryAButton).toBeDefined();
    await act(async () => {
      categoryAButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const excludeFromResultsInput = container.querySelector('input[aria-label="Category Exclude From Results"]') as HTMLInputElement;
    expect(excludeFromResultsInput).toBeTruthy();
    expect(excludeFromResultsInput.checked).toBe(false);

    await act(async () => {
      excludeFromResultsInput.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(excludeFromResultsInput.checked).toBe(true);

    await clickButtonByText(container, 'Save Category');

    let latestCatalogWrite: { content: string; filePath: string } | undefined;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      latestCatalogWrite = writtenFiles
        .filter((write) => write.filePath.includes('event-catalog.json'))
        .at(-1);
      if (latestCatalogWrite?.content.includes('"excludeFromResults":true')) {
        break;
      }

      await act(async () => {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 10);
        });
      });
    }

    expect(latestCatalogWrite).toBeDefined();
    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
    });
    expect(JSON.parse(latestCatalogWrite!.content)).toEqual(expect.objectContaining({
      mutations: expect.arrayContaining([
        expect.objectContaining({
          changes: expect.objectContaining({
            excludeFromResults: true,
            name: 'A',
          }),
          type: 'category-updated',
        }),
      ]),
    }));

    await clickSectionButton(container, 'Timing');
    if (container.querySelector('h1')?.textContent !== 'Timing') {
      const promptDiscardButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Discard') as HTMLButtonElement | undefined;
      expect(promptDiscardButton).toBeDefined();
      await act(async () => {
        promptDiscardButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
      });
      await waitForText(container, 'Recent Records');
    }
    const timingRecords = container.querySelector('[data-timing-categories]') as HTMLElement | null;
    expect(timingRecords).toBeTruthy();
    const timingCategories = JSON.parse(timingRecords!.getAttribute('data-timing-categories') || '[]') as Array<{ excludeFromResults?: boolean; name: string }>;
    expect(timingCategories).toEqual(expect.arrayContaining([
      expect.objectContaining({
        excludeFromResults: true,
        name: 'A',
      }),
    ]));
  });

  it('supports create and delete operations and still renders correctly after panel switches', async () => {
    await ensureAppStylesLoaded();

    await act(async () => {
      root.render(<RaceSweetMainApp />);
    });

    await waitForLoadedApp(container);
    expect(container.textContent).not.toContain('Error loading content');

    await clickSectionButton(container, 'Entrants');
    await clickButtonByText(container, 'Create Entrant');
    await waitForText(container, 'New Entrant');

    await clickButtonByText(container, 'Delete Entrant');
    await waitForTextNotPresent(container, 'New Entrant');

    await clickSectionButton(container, 'Sessions');
    await clickButtonByText(container, 'Create Session');
    await waitForText(container, 'New Session');

    await clickButtonByText(container, 'Delete Session');
    await waitForTextNotPresent(container, 'New Session');

    await clickSectionButton(container, 'Events');
    expect(container.querySelector('h1')?.textContent).toBe('Events');
    expect(container.textContent).toContain('Session List');

    await clickSectionButton(container, 'System');
    expect(container.querySelector('h1')?.textContent).toBe('System');
    expect(container.textContent).toContain('Configured Data Sources');

    await clickSectionButton(container, 'Entrants');
    expect(container.querySelector('h1')?.textContent).toBe('Entrants');
    expect(container.querySelector('input[aria-label="Entrant Name"]')).toBeTruthy();

    await clickSectionButton(container, 'Sessions');
    expect(container.querySelector('h1')?.textContent).toBe('Sessions');
    expect(container.querySelector('input[aria-label="Sessions Page Name"]')).toBeTruthy();
  });

  it('makes a selected session and its parent event active through persisted catalog mutations', async () => {
    const writtenFiles: Array<{ content: string; filePath: string }> = [];
    const requestFileContent = async (filePath: string, _dataType: string): Promise<string> => {
      return readGeneratedFixture(filePath);
    };

    (window as unknown as {
      api: {
        requestBuffer: (filePath: string) => Promise<Buffer>;
        requestFileContent: <T>(filePath: string, dataType: string) => Promise<T>;
        writeFileContent: (filePath: string, content: string) => Promise<void>;
      };
    }).api = {
      requestBuffer: readFixtureBuffer,
      requestFileContent: requestFileContent as <T>(filePath: string, dataType: string) => Promise<T>,
      writeFileContent: async (filePath: string, content: string) => {
        writtenFiles.push({ content, filePath });
      },
    };

    await act(async () => {
      root.render(<RaceSweetMainApp />);
    });

    await waitForLoadedApp(container);

    await clickSectionButton(container, 'Events');
    await clickButtonByText(container, 'New');
    await waitForText(container, 'New Event');

    await clickSectionButton(container, 'Sessions');
    await waitForText(container, 'No sessions are defined for this event.');
    await clickButtonByText(container, 'Create Session');
    await waitForText(container, 'New Session');

    await clickButtonByText(container, 'Make Active');
    await waitForText(container, 'Active Session');

    const latestCatalogWrite = writtenFiles
      .filter((write) => write.filePath.includes('event-catalog.json'))
      .at(-1);
    expect(latestCatalogWrite).toBeDefined();

    const ledger = JSON.parse(latestCatalogWrite!.content) as { mutations: Array<{ eventId?: string; sessionId?: string; type: string }> };
    const sessionActivation = ledger.mutations.find((mutation) => mutation.type === 'session-activated');
    expect(sessionActivation).toEqual(expect.objectContaining({
      eventId: expect.stringMatching(UUID_TEXT_PATTERN),
      sessionId: expect.stringMatching(UUID_TEXT_PATTERN),
      type: 'session-activated',
    }));
    expect(ledger.mutations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sessionId: sessionActivation?.sessionId,
        type: 'session-updated',
      }),
    ]));

    await clickSectionButton(container, 'Events');
    expect(container.textContent).toContain('New Event');
    expect(container.textContent).toContain('Active Event');
  });

  it('keeps Timing pinned to an explicitly selected session when the active session changes', async () => {
    await act(async () => {
      root.render(<RaceSweetMainApp />);
    });

    await waitForLoadedApp(container);

    await clickSectionButton(container, 'Timing');
    const timingEventSelect = container.querySelector('select[aria-label="Timing Event"]') as HTMLSelectElement;
    const timingSessionSelect = container.querySelector('select[aria-label="Timing Session"]') as HTMLSelectElement;
    expect(timingEventSelect).toBeTruthy();
    expect(timingSessionSelect).toBeTruthy();
    expect(timingSessionSelect.value).toBe('active');

    await act(async () => {
      timingSessionSelect.value = SEED_QUALIFYING_SESSION_ID;
      timingSessionSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await waitForInputValue(container, 'select[aria-label="Timing Session"]', SEED_QUALIFYING_SESSION_ID);
    expect(container.textContent).toContain('Recent Records (0)');

    await clickSectionButton(container, 'Sessions');
    const featureRaceButton = Array.from(container.querySelectorAll('button')).find((button) => {
      return button.textContent?.includes('Feature Race');
    }) as HTMLButtonElement | undefined;
    expect(featureRaceButton).toBeTruthy();

    await act(async () => {
      featureRaceButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await clickButtonByText(container, 'Make Active');
    await waitForText(container, 'Active Session');

    await clickSectionButton(container, 'Timing');
    const pinnedTimingSessionSelect = container.querySelector('select[aria-label="Timing Session"]') as HTMLSelectElement;
    expect(pinnedTimingSessionSelect).toBeTruthy();
    expect(pinnedTimingSessionSelect.value).toBe(SEED_QUALIFYING_SESSION_ID);
    expect(container.textContent).toContain('Active session (Feature Race)');
    expect(container.textContent).toContain('Recent Records (0)');
  });

  it('keeps navigation visible, dismisses Timing errors when navigating away, and saves them to the System log', async () => {
    const requestFileContent = async (filePath: string, _dataType: string): Promise<string> => {
      return readGeneratedFixtureWithTimingAssignedApicalSource(filePath);
    };

    (window as unknown as {
      api: {
        requestBuffer: (filePath: string) => Promise<Buffer>;
        requestFileContent: <T>(filePath: string, dataType: string) => Promise<T>;
        writeFileContent: (filePath: string, content: string) => Promise<void>;
      };
    }).api = {
      requestBuffer: readFixtureBuffer,
      requestFileContent: requestFileContent as <T>(filePath: string, dataType: string) => Promise<T>,
      writeFileContent: async () => undefined,
    };

    await act(async () => {
      root.render(<RaceSweetMainApp />);
    });

    await waitForLoadedApp(container);
    await clickSectionButton(container, 'Timing');
    const timingSessionSelect = container.querySelector('select[aria-label="Timing Session"]') as HTMLSelectElement;
    expect(timingSessionSelect).toBeTruthy();

    await act(async () => {
      timingSessionSelect.value = SEED_QUALIFYING_SESSION_ID;
      timingSessionSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await waitForText(container, 'Cached Apical Excel spreadsheet was not found');
    expect(container.querySelector('nav[aria-label="Application sections"]')).toBeTruthy();
    expect(container.querySelector('button[aria-label="Events"]')).toBeTruthy();
    expect(container.querySelector('h1')?.textContent).toBe('Timing');
    expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent === 'Dismiss')).toBe(true);

    await clickSectionButton(container, 'Events');
    expect(container.querySelector('h1')?.textContent).toBe('Events');
    expect(container.textContent).not.toContain('Cached Apical Excel spreadsheet was not found');
    expect(container.querySelector('nav[aria-label="Application sections"]')).toBeTruthy();

    await clickSectionButton(container, 'System');
    const errorLog = container.querySelector('textarea[aria-label="Application Error Log"]') as HTMLTextAreaElement;
    expect(errorLog).toBeTruthy();
    expect(errorLog.value).toContain('Timing');
    expect(errorLog.value).toContain('Cached Apical Excel spreadsheet was not found');
  });

  it('persists enriched entrant profile edits across panel switches', async () => {
    await ensureAppStylesLoaded();

    await act(async () => {
      root.render(<RaceSweetMainApp />);
    });

    await waitForLoadedApp(container);
    expect(container.textContent).not.toContain('Error loading content');

    await clickSectionButton(container, 'Entrants');

    const firstNameInput = container.querySelector('input[aria-label="Entrant First Name"]') as HTMLInputElement;
    const surnameInput = container.querySelector('input[aria-label="Entrant Surname"]') as HTMLInputElement;
    const genderInput = container.querySelector('select[aria-label="Entrant Gender"]') as HTMLSelectElement;
    const dobInput = container.querySelector('input[aria-label="Entrant Date Of Birth"]') as HTMLInputElement;
    expect(firstNameInput).toBeTruthy();
    expect(surnameInput).toBeTruthy();
    expect(genderInput).toBeTruthy();
    expect(dobInput).toBeTruthy();

    await act(async () => {
      setInputValue(firstNameInput, 'Integrated');
      setInputValue(surnameInput, 'Rider');
      setSelectValue(genderInput, 'female');
      setInputValue(dobInput, '2001-01-15');
    });

    await clickButtonByText(container, 'Save Entrant');
    await waitForInputValue(container, 'input[aria-label="Entrant First Name"]', 'Integrated');
    await waitForInputValue(container, 'input[aria-label="Entrant Surname"]', 'Rider');
    await waitForInputValue(container, 'select[aria-label="Entrant Gender"]', 'female');
    await waitForInputValue(container, 'input[aria-label="Entrant Date Of Birth"]', '2001-01-15');

    await clickSectionButton(container, 'System');
    expect(container.querySelector('h1')?.textContent).toBe('System');

    await clickSectionButton(container, 'Entrants');
    await waitForInputValue(container, 'input[aria-label="Entrant First Name"]', 'Integrated');
    await waitForInputValue(container, 'input[aria-label="Entrant Surname"]', 'Rider');
    await waitForInputValue(container, 'select[aria-label="Entrant Gender"]', 'female');
    await waitForInputValue(container, 'input[aria-label="Entrant Date Of Birth"]', '2001-01-15');
  });

  it('keeps app usable when admin overrides file is missing and Apical event list fetch fails', async () => {
    await ensureAppStylesLoaded();

    const requestFileContent = async (filePath: string, _dataType: string): Promise<string> => {
      return readGeneratedFixtureWithConfiguredApicalSource(filePath);
    };

    (window as unknown as {
      api: {
        requestBuffer: (filePath: string) => Promise<Buffer>;
        requestFileContent: <T>(filePath: string, dataType: string) => Promise<T>;
        writeFileContent: (filePath: string, content: string) => Promise<void>;
      };
    }).api = {
      requestBuffer: readFixtureBuffer,
      requestFileContent: requestFileContent as <T>(filePath: string, dataType: string) => Promise<T>,
      writeFileContent: async () => undefined,
    };

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('boom', { status: 500, statusText: 'Server Error' }));

    await act(async () => {
      root.render(<RaceSweetMainApp />);
    });

    await waitForLoadedApp(container);
    expect(container.querySelector('h1')?.textContent).toBe('System');
    expect(container.textContent).not.toContain('Failed to read admin-overrides.json');

    const fetchEventsButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Fetch Apical Events');
    expect(fetchEventsButton).toBeDefined();

    await act(async () => {
      fetchEventsButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await waitForText(container, 'Failed to fetch Apical events:');
    expect(container.textContent).not.toContain('Error loading content');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fetches Apical event data now and persists source assignments', async () => {
    const { fetchMock, writtenConfig, writtenFiles } = await renderAndFetchApicalImport(root, container);

    expect(container.querySelector('h1')?.textContent).toBe('System');
    expect(container.textContent).toMatch(/Data last retrieved: \d{4}-\d{2}-\d{2}T/);
    expect(container.textContent).not.toContain('Active Event');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('https://apical.example.com/Download/DownloadExcel?fileGuid=11111111-1111-4111-8111-111111111111&filename=Apical%20Downloaded%20Round.xlsx'),
      expect.any(Object)
    );
    const fetchCalls = fetchMock.mock.calls as Parameters<typeof fetch>[];
    const exportCall = fetchCalls.find((call) => String(call[0]).includes('/RaceResult/Event/ExportToExcel'));
    expect(exportCall).toBeDefined();
    const exportHeaders = new Headers((exportCall![1] as RequestInit).headers);
    expect(exportHeaders.get('X-Requested-With')).toBe('XMLHttpRequest');
    expect(exportHeaders.get('Accept')).toBe('application/json');

    const downloadCall = fetchCalls.find((call) => String(call[0]).includes('/Download/DownloadExcel'));
    expect(downloadCall).toBeDefined();
    const downloadHeaders = new Headers((downloadCall![1] as RequestInit).headers);
    expectRequiredDownloadHeaders(downloadHeaders, 'https://apical.example.com', 1001, 'session=apical-cookie');

    expect(writtenConfig.dataSources[0]?.dataLastRetrieved).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(writtenConfig.dataSources[0]?.apicalDataFilePath).toBe(getCachedApicalExcelFilePath(1001));
    expect(Object.values(writtenConfig.eventSourceAssignments)).toContainEqual(['source-apical']);
    expect(Object.values(writtenConfig.sessionSourceAssignments)).toContainEqual({
      mode: 'specific',
      sourceIds: ['source-apical'],
    });
    const latestCatalogWrite = writtenFiles
      .filter((write) => write.filePath.includes('event-catalog.json'))
      .at(-1);
    expect(latestCatalogWrite).toBeDefined();
    expect(JSON.parse(latestCatalogWrite!.content)).toEqual(expect.objectContaining({
      mutations: expect.arrayContaining([
        expect.objectContaining({
          apicalDataFilePath: getCachedApicalExcelFilePath(1001),
          type: 'race-state-imported',
        }),
      ]),
    }));
    expect(writtenFiles).toEqual(expect.arrayContaining([
      expect.objectContaining({
        dataType: 'base64',
        filePath: getCachedApicalExcelFilePath(1001),
      }),
    ]));

    const catalogWriteCountBeforeReprocess = writtenFiles.filter((write) => write.filePath.includes('event-catalog.json')).length;
    fetchMock.mockClear();

    await clickButtonByText(container, 'Reprocess data');

    for (let attempt = 0; attempt < 120; attempt += 1) {
      const catalogWriteCount = writtenFiles.filter((write) => write.filePath.includes('event-catalog.json')).length;
      if (catalogWriteCount > catalogWriteCountBeforeReprocess) {
        break;
      }

      await act(async () => {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 10);
        });
      });
    }

    expect(writtenFiles.filter((write) => write.filePath.includes('event-catalog.json')).length).toBeGreaterThan(catalogWriteCountBeforeReprocess);
    expect(fetchMock).toHaveBeenCalled();
    await waitForText(container, 'Data Reloaded');
    const reloadRows = Array.from(container.querySelectorAll('table[aria-label="Reload summary"] tbody tr')).map((row) => (
      Array.from(row.querySelectorAll('th, td')).map((cell) => cell.textContent || '')
    ));
    const categorySummaryRow = reloadRows.find((row) => row[0] === 'Categories');
    const crossingSummaryRow = reloadRows.find((row) => row[0] === 'Crossings');
    expect(Number(categorySummaryRow?.[3] || 0)).toBeGreaterThan(0);
    expect(Number(crossingSummaryRow?.[3] || 0)).toBeGreaterThan(0);
  });

  it('reprocesses every session linked to the Apical data source', async () => {
    const { apicalData } = await createApicalImportExpectations();
    const apicalDataFilePath = getCachedApicalExcelFilePath(1001);
    const cachedWorkbook = await createApicalWorkbookBuffer(apicalData);
    const writtenFiles: Array<{ content: string; dataType?: string; filePath: string }> = [];

    const requestFileContent = async (filePath: string, _dataType: string): Promise<string> => {
      if (filePath.includes('event-catalog.json')) {
        return JSON.stringify(createSeedEventCatalogLedger());
      }

      if (filePath.includes('system-config.json')) {
        return JSON.stringify({
          dataSources: [
            {
              apiConfig: {
                apicalEventId: 1001,
                authHeaderName: 'Authorization',
                authHeaderValue: 'Bearer token',
                baseUrl: 'https://apical.example.com',
                companyId: 2,
                httpTimeoutSeconds: 10,
                live: false,
                pollIntervalSeconds: 30,
                selectedEventIds: [1001],
              },
              apicalDataFilePath,
              dataLastRetrieved: '2026-06-08T09:10:11.123Z',
              enabled: true,
              id: 'source-apical',
              listedEvents: [
                {
                  eventDate: '2025-06-06T00:00:00.000Z',
                  id: 1001,
                  name: 'Apical Downloaded Round',
                },
              ],
              name: 'Apical Source',
              type: 'api-apical-excel-file',
            },
          ],
          eventSourceAssignments: {},
          schemaVersion: 1,
          sessionSourceAssignments: {
            [SEED_QUALIFYING_SESSION_ID]: {
              mode: 'specific',
              sourceIds: ['source-apical'],
            },
            [SEED_RACE_SESSION_ID]: {
              mode: 'specific',
              sourceIds: ['source-apical'],
            },
          },
        });
      }

      if (filePath.includes('admin-overrides.json')) {
        return JSON.stringify({ entrantCategories: {}, excludedCrossings: {}, schemaVersion: 1 });
      }

      throw new Error(`Unknown generated file requested: ${filePath}`);
    };

    (window as unknown as {
      api: {
        requestBuffer: (filePath: string) => Promise<Buffer>;
        requestFileContent: <T>(filePath: string, dataType: string) => Promise<T>;
        writeFileContent: (filePath: string, content: string, dataType?: string) => Promise<void>;
      };
    }).api = {
      requestBuffer: async (filePath: string): Promise<Buffer> => {
        if (filePath === apicalDataFilePath) {
          return cachedWorkbook;
        }

        return readFixtureBuffer(filePath);
      },
      requestFileContent: requestFileContent as <T>(filePath: string, dataType: string) => Promise<T>,
      writeFileContent: async (filePath: string, content: string, dataType?: string) => {
        writtenFiles.push({ content, dataType, filePath });
      },
    };
    const fetchMock = mockApicalExcelFetch(apicalData);

    await act(async () => {
      root.render(<RaceSweetMainApp />);
    });

    await waitForLoadedApp(container);
    await clickButtonByText(container, 'Reprocess data');

    let latestCatalogWrite: { content: string; dataType?: string; filePath: string } | undefined;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      latestCatalogWrite = writtenFiles
        .filter((write) => write.filePath.includes('event-catalog.json'))
        .at(-1);

      if (
        latestCatalogWrite?.content.includes('"type":"race-state-imported"') &&
        latestCatalogWrite.content.includes(SEED_QUALIFYING_SESSION_ID) &&
        latestCatalogWrite.content.includes(SEED_RACE_SESSION_ID)
      ) {
        break;
      }

      await act(async () => {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 10);
        });
      });
    }

    expect(latestCatalogWrite).toBeDefined();
    const persistedLedger = JSON.parse(latestCatalogWrite!.content) as { mutations: Array<{ sessionId?: string; type: string }> };
    const reloadedSessionIds = persistedLedger.mutations
      .filter((mutation) => mutation.type === 'race-state-imported')
      .map((mutation) => mutation.sessionId);
    expect(reloadedSessionIds).toEqual(expect.arrayContaining([
      SEED_QUALIFYING_SESSION_ID,
      SEED_RACE_SESSION_ID,
    ]));
    expect(fetchMock).toHaveBeenCalled();
    await waitForText(container, 'Data Reloaded');
    const reloadSummaryTable = container.querySelector('table[aria-label="Reload summary"]');
    expect(reloadSummaryTable).toBeTruthy();
    expect(reloadSummaryTable?.textContent).toContain('Categories');
    expect(reloadSummaryTable?.textContent).toContain('Participants');
    expect(reloadSummaryTable?.textContent).toContain('Teams');
    expect(reloadSummaryTable?.textContent).toContain('Flag records');
    expect(reloadSummaryTable?.textContent).toContain('Crossings');
  });

  it('renames a default Apical source to the fetched event name when event data is retrieved', async () => {
    const { writtenConfig } = await renderAndFetchApicalImport(
      root,
      container,
      readGeneratedFixtureWithListedApicalSource(APICAL_DEFAULT_SOURCE_NAME)
    );

    expect(writtenConfig.dataSources[0]?.name).toBe('Apical Downloaded Round');
  });

  it('loads Apical cache paths from event data and shows them with the retrieval timestamp', async () => {
    const importedEventId = createApicalCatalogEventId(1001);
    const importedSessionId = createApicalCatalogSessionId(1001);
    const apicalDataFilePath = getCachedApicalExcelFilePath(1001);
    const writtenFiles: Array<{ content: string; dataType?: string; filePath: string }> = [];

    const requestFileContent = async (filePath: string, _dataType: string): Promise<string> => {
      if (filePath.includes('event-catalog.json')) {
        return JSON.stringify({
          mutations: [
            {
              event: {
                categoryIds: [],
                date: '2025-06-06',
                entrantIds: [],
                format: 'race-weekend',
                id: importedEventId,
                name: 'Apical Downloaded Round',
                sessionIds: [importedSessionId],
                timeZone: 'Australia/Sydney',
              },
              id: 'mutation-apical-event',
              timestamp: '2025-06-06T00:00:00.000Z',
              type: 'event-created',
            },
            {
              id: 'mutation-apical-session',
              session: {
                eventId: importedEventId,
                id: importedSessionId,
                kind: 'race',
                name: 'Apical Downloaded Round',
                scheduledStart: '2025-06-06T00:00:00.000Z',
                status: 'completed',
              },
              timestamp: '2025-06-06T00:00:01.000Z',
              type: 'session-created',
            },
            {
              apicalDataFilePath,
              eventId: importedEventId,
              id: 'mutation-apical-race-state',
              raceState: {},
              sessionId: importedSessionId,
              timestamp: '2025-06-06T00:00:02.000Z',
              type: 'race-state-imported',
            },
          ],
          schemaVersion: 1,
        });
      }

      if (filePath.includes('system-config.json')) {
        return JSON.stringify({
          dataSources: [
            {
              apiConfig: {
                apicalEventId: 1001,
                authHeaderName: 'Authorization',
                authHeaderValue: 'Bearer token',
                baseUrl: 'https://apical.example.com',
                companyId: 2,
                httpTimeoutSeconds: 10,
                live: false,
                pollIntervalSeconds: 30,
                selectedEventIds: [1001],
              },
              dataLastRetrieved: '2026-06-08T09:10:11.123Z',
              enabled: true,
              id: 'source-apical',
              listedEvents: [
                {
                  eventDate: '2025-06-06T00:00:00.000Z',
                  id: 1001,
                  name: 'Apical Downloaded Round',
                },
              ],
              name: 'Apical Source',
              type: 'api-apical-excel-file',
            },
          ],
          eventSourceAssignments: {
            [importedEventId]: ['source-apical'],
          },
          schemaVersion: 1,
          sessionSourceAssignments: {
            [importedSessionId]: {
              mode: 'specific',
              sourceIds: ['source-apical'],
            },
          },
        });
      }

      if (filePath.includes('admin-overrides.json')) {
        throw new Error('ENOENT: no such file or directory');
      }

      throw new Error(`Unknown generated file requested: ${filePath}`);
    };

    (window as unknown as {
      api: {
        openLocalFile: (filePath: string) => Promise<void>;
        requestBuffer: (filePath: string) => Promise<Buffer>;
        requestFileContent: <T>(filePath: string, dataType: string) => Promise<T>;
        writeFileContent: (filePath: string, content: string, dataType?: string) => Promise<void>;
      };
    }).api = {
      openLocalFile: vi.fn(async () => undefined),
      requestBuffer: readFixtureBuffer,
      requestFileContent: requestFileContent as <T>(filePath: string, dataType: string) => Promise<T>,
      writeFileContent: async (filePath: string, content: string, dataType?: string) => {
        writtenFiles.push({ content, dataType, filePath });
      },
    };

    await act(async () => {
      root.render(<RaceSweetMainApp />);
    });

    await waitForLoadedApp(container);

    expect(container.textContent).toContain('Data last retrieved: 2026-06-08T09:10:11.123Z');
    expect(container.textContent).toContain(apicalDataFilePath);
    const latestConfigWrite = writtenFiles
      .filter((write) => write.filePath.includes('system-config.json'))
      .at(-1);
    expect(latestConfigWrite).toBeDefined();
    expect(JSON.parse(latestConfigWrite!.content)).toEqual(expect.objectContaining({
      dataSources: [
        expect.objectContaining({
          apicalDataFilePath,
          dataLastRetrieved: '2026-06-08T09:10:11.123Z',
          id: 'source-apical',
        }),
      ],
    }));
  });

  it('loads imported Apical timing sessions from the event ledger without re-reading the Excel source', async () => {
    const { expectedRecentRecordCount, fetchMock, importedEventId } = await renderAndFetchApicalImport(root, container);

    expect(fetchMock).toHaveBeenCalledTimes(2);

    await clickSectionButton(container, 'Timing');
    const timingEventSelect = container.querySelector('select[aria-label="Timing Event"]') as HTMLSelectElement;
    expect(timingEventSelect).toBeTruthy();

    await act(async () => {
      timingEventSelect.value = importedEventId;
      timingEventSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await waitForText(container, `Recent Records (${expectedRecentRecordCount})`);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('loads selected Timing sessions from imported Apical ledger data for the assigned source before reading cached spreadsheets', async () => {
    const { apicalData, expectedRecentRecordCount } = await createApicalImportExpectations();
    const importedEventId = createApicalCatalogEventId(1001);
    const importedSessionId = createApicalCatalogSessionId(1001);
    const apicalDataFilePath = getCachedApicalExcelFilePath(1001);
    const excelApicalData = convertApicalSpreadsheetRowsToApicalData(apicalDataToSpreadsheetRows(apicalData));
    const importedRaceState = convertDataToRaceState(
      importedEventId,
      new Date('2025-06-06T00:00:00.000Z'),
      excelApicalData,
      200000
    );
    const requestBuffer = vi.fn(async (filePath: string): Promise<Buffer> => {
      if (filePath === apicalDataFilePath) {
        throw new Error(`Cached spreadsheet should not be read: ${filePath}`);
      }

      return readFixtureBuffer(filePath);
    });

    const requestFileContent = async (filePath: string, _dataType: string): Promise<string> => {
      if (filePath.includes('event-catalog.json')) {
        return JSON.stringify({
          mutations: [
            ...createSeedEventCatalogLedger().mutations,
            {
              apicalDataFilePath,
              eventId: importedEventId,
              id: 'mutation-apical-race-state',
              raceState: importedRaceState,
              sessionId: importedSessionId,
              timestamp: '2025-06-06T00:00:02.000Z',
              type: 'race-state-imported',
            },
          ],
          schemaVersion: 1,
        });
      }

      if (filePath.includes('system-config.json')) {
        return JSON.stringify({
          dataSources: [
            {
              apiConfig: {
                apicalEventId: 1001,
                authHeaderName: 'Authorization',
                authHeaderValue: 'Bearer token',
                baseUrl: 'https://apical.example.com',
                companyId: 2,
                httpTimeoutSeconds: 10,
                live: false,
                pollIntervalSeconds: 30,
                selectedEventIds: [1001],
              },
              apicalDataFilePath,
              dataLastRetrieved: '2026-06-08T09:10:11.123Z',
              enabled: true,
              id: 'source-apical',
              listedEvents: [
                {
                  eventDate: '2025-06-06T00:00:00.000Z',
                  id: 1001,
                  name: 'Apical Downloaded Round',
                },
              ],
              name: 'Apical Source',
              type: 'api-apical-excel-file',
            },
          ],
          eventSourceAssignments: {},
          schemaVersion: 1,
          sessionSourceAssignments: {
            [SEED_QUALIFYING_SESSION_ID]: {
              mode: 'specific',
              sourceIds: ['source-apical'],
            },
          },
        });
      }

      if (filePath.includes('admin-overrides.json')) {
        return JSON.stringify({ entrantCategories: {}, excludedCrossings: {}, schemaVersion: 1 });
      }

      throw new Error(`Unknown generated file requested: ${filePath}`);
    };

    (window as unknown as {
      api: {
        requestBuffer: (filePath: string) => Promise<Buffer>;
        requestFileContent: <T>(filePath: string, dataType: string) => Promise<T>;
        writeFileContent: (filePath: string, content: string, dataType?: string) => Promise<void>;
      };
    }).api = {
      requestBuffer,
      requestFileContent: requestFileContent as <T>(filePath: string, dataType: string) => Promise<T>,
      writeFileContent: async () => undefined,
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network should not be used'));

    await act(async () => {
      root.render(<RaceSweetMainApp />);
    });

    await waitForLoadedApp(container);
    await clickSectionButton(container, 'Timing');
    const timingSessionSelect = container.querySelector('select[aria-label="Timing Session"]') as HTMLSelectElement;
    expect(timingSessionSelect).toBeTruthy();

    await act(async () => {
      timingSessionSelect.value = SEED_QUALIFYING_SESSION_ID;
      timingSessionSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await waitForText(container, `Recent Records (${expectedRecentRecordCount})`);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(requestBuffer).not.toHaveBeenCalledWith(apicalDataFilePath);
  });

  it('falls back to the cached Apical spreadsheet on disk when timing session ledger data is unavailable', async () => {
    const { apicalData, expectedRecentRecordCount } = await createApicalImportExpectations();
    const importedEventId = createApicalCatalogEventId(1001);
    const importedSessionId = createApicalCatalogSessionId(1001);
    const cachedWorkbook = await createApicalWorkbookBuffer(apicalData);
    const writtenFiles: Array<{ content: string; dataType?: string; filePath: string }> = [];

    const requestFileContent = async (filePath: string, _dataType: string): Promise<string> => {
      if (filePath.includes('event-catalog.json')) {
        return JSON.stringify({
          mutations: [
            {
              event: {
                categoryIds: [],
                date: '2025-06-06',
                entrantIds: [],
                format: 'race-weekend',
                id: importedEventId,
                name: 'Apical Downloaded Round',
                sessionIds: [importedSessionId],
                timeZone: 'Australia/Sydney',
              },
              id: 'mutation-apical-event',
              timestamp: '2025-06-06T00:00:00.000Z',
              type: 'event-created',
            },
            {
              id: 'mutation-apical-session',
              session: {
                eventId: importedEventId,
                id: importedSessionId,
                kind: 'race',
                name: 'Apical Downloaded Round',
                scheduledStart: '2025-06-06T00:00:00.000Z',
                status: 'completed',
              },
              timestamp: '2025-06-06T00:00:01.000Z',
              type: 'session-created',
            },
          ],
          schemaVersion: 1,
        });
      }

      if (filePath.includes('system-config.json')) {
        return JSON.stringify({
          dataSources: [
            {
              apiConfig: {
                apicalEventId: 1001,
                authHeaderName: 'Authorization',
                authHeaderValue: 'Bearer token',
                baseUrl: 'https://apical.example.com',
                companyId: 2,
                httpTimeoutSeconds: 10,
                live: false,
                pollIntervalSeconds: 30,
                selectedEventIds: [1001],
              },
              enabled: true,
              id: 'source-apical',
              listedEvents: [
                {
                  eventDate: '2025-06-06T00:00:00.000Z',
                  id: 1001,
                  name: 'Apical Downloaded Round',
                },
              ],
              name: 'Apical Source',
              type: 'api-apical-excel-file',
            },
          ],
          eventSourceAssignments: {
            [importedEventId]: ['source-apical'],
          },
          schemaVersion: 1,
          sessionSourceAssignments: {
            [importedSessionId]: {
              mode: 'specific',
              sourceIds: ['source-apical'],
            },
          },
        });
      }

      if (filePath.includes('admin-overrides.json')) {
        throw new Error('ENOENT: no such file or directory');
      }

      throw new Error(`Unknown generated file requested: ${filePath}`);
    };

    (window as unknown as {
      api: {
        requestBuffer: (filePath: string) => Promise<Buffer>;
        requestFileContent: <T>(filePath: string, dataType: string) => Promise<T>;
        writeFileContent: (filePath: string, content: string, dataType?: string) => Promise<void>;
      };
    }).api = {
      requestBuffer: async (filePath: string): Promise<Buffer> => {
        if (filePath === getCachedApicalExcelFilePath(1001)) {
          return cachedWorkbook;
        }
        return readFixtureBuffer(filePath);
      },
      requestFileContent: requestFileContent as <T>(filePath: string, dataType: string) => Promise<T>,
      writeFileContent: async (filePath: string, content: string, dataType?: string) => {
        writtenFiles.push({ content, dataType, filePath });
      },
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network should not be used'));

    await act(async () => {
      root.render(<RaceSweetMainApp />);
    });

    await waitForLoadedApp(container);
    await clickSectionButton(container, 'Timing');
    const timingEventSelect = container.querySelector('select[aria-label="Timing Event"]') as HTMLSelectElement;
    expect(timingEventSelect).toBeTruthy();

    await act(async () => {
      timingEventSelect.value = importedEventId;
      timingEventSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await waitForText(container, `Recent Records (${expectedRecentRecordCount})`);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writtenFiles).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        filePath: getCachedApicalExcelFilePath(1001),
      }),
    ]));
  });

  it('scaffolds entrants and categories for fetched Apical event data', async () => {
    const { apicalData, expectedCategoryCount, expectedEntrantCount } = await renderAndFetchApicalImport(root, container);

    await clickSectionButton(container, 'Entrants');
    await waitForText(container, 'Apical Downloaded Round');
    expect(container.querySelectorAll('[aria-label="Entrants for selected event"] .events-list-item')).toHaveLength(expectedEntrantCount);
    expect(container.textContent).toContain(apicalData[0]!.ParticipantViewModels[0]!.TeamNameDisplay);

    await clickSectionButton(container, 'Categories');
    expect(container.querySelectorAll('[aria-label="Categories for selected event"] .events-list-item')).toHaveLength(expectedCategoryCount);
    expect(container.textContent).toContain(apicalData[0]!.CategoryName);
  });

  it('keeps the selected Categories event when saving one of its categories', async () => {
    const { importedEventId, writtenFiles } = await renderAndFetchApicalImport(root, container);

    await clickSectionButton(container, 'Sessions');
    const sessionsEventSelect = container.querySelector('select[aria-label="Sessions Event"]') as HTMLSelectElement;
    expect(sessionsEventSelect).toBeTruthy();
    const fixtureEventOption = Array.from(sessionsEventSelect.options).find((option) => option.value !== importedEventId);
    expect(fixtureEventOption).toBeDefined();
    await act(async () => {
      sessionsEventSelect.value = fixtureEventOption!.value;
      sessionsEventSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await waitForInputValue(container, 'select[aria-label="Sessions Event"]', fixtureEventOption!.value);

    await clickSectionButton(container, 'Categories');
    const categoriesEventSelect = container.querySelector('select[aria-label="Categories Event"]') as HTMLSelectElement;
    expect(categoriesEventSelect).toBeTruthy();
    await act(async () => {
      categoriesEventSelect.value = importedEventId;
      categoriesEventSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await waitForInputValue(container, 'select[aria-label="Categories Event"]', importedEventId);
    expect(container.querySelector('input[aria-label="Category Name"]')).toBeTruthy();

    await clickButtonByText(container, 'Save Category');

    let latestCatalogWrite: { content: string; dataType?: string; filePath: string } | undefined;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      latestCatalogWrite = writtenFiles
        .filter((write) => write.filePath.includes('event-catalog.json'))
        .at(-1);
      if (latestCatalogWrite?.content.includes('"type":"category-updated"')) {
        break;
      }

      await act(async () => {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 10);
        });
      });
    }

    expect(latestCatalogWrite).toBeDefined();
    expect(container.textContent).not.toContain('does not exist');
    expect((container.querySelector('select[aria-label="Categories Event"]') as HTMLSelectElement).value).toBe(importedEventId);
    expect(container.querySelector('input[aria-label="Category Name"]')).toBeTruthy();
  });

  it('populates timing and results when the imported Apical session is activated', async () => {
    const { expectedRecentRecordCount, importedEventId } = await renderAndFetchApicalImport(root, container);

    await clickSectionButton(container, 'Sessions');
    const sessionsEventSelect = container.querySelector('select[aria-label="Sessions Event"]') as HTMLSelectElement;
    expect(sessionsEventSelect).toBeTruthy();
    await act(async () => {
      sessionsEventSelect.value = importedEventId!;
      sessionsEventSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await waitForText(container, 'Apical Downloaded Round');
    expect(container.textContent).toContain('Effective sources: 1');

    await clickButtonByText(container, 'Make Active');
    await waitForText(container, 'Active Session');

    await clickSectionButton(container, 'Timing');
    await waitForText(container, `Recent Records (${expectedRecentRecordCount})`);

    await clickSectionButton(container, 'Results');
    expect(container.querySelector('select[aria-label="Race View Category"]')).toBeTruthy();
    expect(container.querySelector('table[aria-label="Results Table"]')).toBeTruthy();
  });

  it('shows an actionable warning banner when Windows file permissions block optional generated files', async () => {
    await ensureAppStylesLoaded();

    const requestFileContent = async (filePath: string, _dataType: string): Promise<string> => {
      if (filePath.includes('admin-overrides.json')) {
        throw new Error('EACCES: access is denied');
      }
      return readGeneratedFixture(filePath);
    };

    (window as unknown as {
      api: {
        requestBuffer: (filePath: string) => Promise<Buffer>;
        requestFileContent: <T>(filePath: string, dataType: string) => Promise<T>;
        writeFileContent: (filePath: string, content: string) => Promise<void>;
      };
    }).api = {
      requestBuffer: readFixtureBuffer,
      requestFileContent: requestFileContent as <T>(filePath: string, dataType: string) => Promise<T>,
      writeFileContent: async () => undefined,
    };

    await act(async () => {
      root.render(<RaceSweetMainApp />);
    });

    await waitForLoadedApp(container);
    await waitForText(container, 'Windows denied file access');
    expect(container.querySelector('.load-warnings')).toBeTruthy();
    expect(container.textContent).toContain('Close any app locking that file/folder');
    expect(container.textContent).not.toContain('Error loading content');
  });

  it('applies expected CSS layout rules without stylesheet parse errors', async () => {
    await ensureAppStylesLoaded();

    await act(async () => {
      root.render(<RaceSweetMainApp />);
    });

    await waitForLoadedApp(container);

    const appShell = container.querySelector('.app-shell') as HTMLElement;
    const sectionNav = container.querySelector('.section-nav') as HTMLElement;
    expect(appShell).toBeTruthy();
    expect(sectionNav).toBeTruthy();

    const appShellStyle = getComputedStyle(appShell);
    const sectionNavStyle = getComputedStyle(sectionNav);
    expect(appShellStyle.display).toBe('flex');
    expect(sectionNavStyle.display).toBe('flex');
    expect(sectionNavStyle.flexDirection).toBe('column');

    await clickSectionButton(container, 'Events');
    const eventsLayout = container.querySelector('.events-layout') as HTMLElement;
    expect(eventsLayout).toBeTruthy();
    expect(getComputedStyle(eventsLayout).display).toBe('grid');

    const loadedCssText = document.head.querySelector(`style[${APP_TEST_STYLE_TAG}="${APP_TEST_STYLE_TAG_VALUE}"]`)?.textContent || '';
    expect(loadedCssText).toContain('.section-tile.active');
    expect(loadedCssText).toContain('.error pre');
    expect(loadedCssText).toContain('white-space: pre-wrap');
    expect(loadedCssText).toContain('overflow-wrap: anywhere');
    expect(loadedCssText).toContain('@media (prefers-color-scheme: dark)');
  });

  it('supports both dark and light themes via parsed media-query rules', async () => {
    await ensureAppStylesLoaded();

    const stylesheet = getAppStylesheet();
    const darkRule = getMediaRule(stylesheet, 'prefers-color-scheme: dark');
    const lightRule = getMediaRule(stylesheet, 'prefers-color-scheme: light');

    expect(darkRule).toBeTruthy();
    expect(lightRule).toBeTruthy();

    const darkCssText = darkRule!.cssText;
    const darkBodyRule = getFirstBodyRule(darkRule!);
    expect(darkCssText).toContain('--color-bg: #1e1e1e');
    expect(darkCssText).toContain('--color-fg: #f0f0f0');
    expect(darkBodyRule?.style.getPropertyValue('background').trim()).toBe('var(--color-bg)');
    expect(darkBodyRule?.style.getPropertyValue('color').trim()).toBe('var(--color-fg)');

    const lightCssText = lightRule!.cssText;
    const lightBodyRule = getFirstBodyRule(lightRule!);
    expect(lightCssText).toMatch(/background:\s*(#ddd|rgb\(221,\s*221,\s*221\))/i);
    expect(lightCssText).toContain('color: black');
    expect(lightBodyRule?.style.getPropertyValue('background').trim()).toMatch(/^(#ddd|rgb\(221,\s*221,\s*221\))$/i);
    expect(lightBodyRule?.style.getPropertyValue('color').trim()).toBe('black');
  });
});
