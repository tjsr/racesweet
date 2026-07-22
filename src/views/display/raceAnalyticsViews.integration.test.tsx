// @vitest-environment jsdom

import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { tableTimeString } from '../../app/utils/timeutils.js';
import type { EventCatalogEntrant, EventCatalogEntry, EventCatalogEvent } from '../../catalog/eventCatalog.js';
import { CategoryId } from '../../processing/category.js';
import { createGreenFlagEvent } from '../../processing/flag.js';
import { EventEntrantId } from '../../model/entrant.js';
import type { EventCategory } from '../../model/eventcategory.js';
import type { EventParticipant, EventParticipantId } from '../../model/eventparticipant.js';
import { createCategoryId, createEventEntrantId, createEventId, createEventParticipantId, createSessionId, createTimeRecordId, createTimeRecordSourceId } from '../../model/ids.js';
import { type RaceStateLookup, Session } from '../../model/racestate.js';
import {
  CROSSING_FLAG_LAP_UNDER_MINIMUM,
  CROSSING_UNRELATED_AFTER_FINISH,
  CROSSING_UNRELATED_LAP_UNDER_MINIMUM,
  type EventTimeRecord,
  type ParticipantPassingRecord,
  RECORD_TX_CROSSING,
} from '../../model/timerecord.js';
import { useUiConsoleGuards } from '../../testing/uiConsoleGuards.js';
import { ReportsPage, ResultsPage } from './raceAnalyticsViews.js';
import { RecentRecords } from './recent.js';

const setSelectValue = (select: HTMLSelectElement, value: string): void => {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  descriptor?.set?.call(select, value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
};

const createLap = (
  id: string,
  participantId: EventParticipantId,
  entrantId: EventEntrantId,
  lapNo: number,
  elapsedTime: number,
  lapTime: number,
): ParticipantPassingRecord => ({
  elapsedTime,
  entrantId,
  id,
  isExcluded: false,
  isValid: true,
  lapNo,
  lapTime,
  participantId,
  recordType: 16,
  sequence: lapNo,
  source: createTimeRecordSourceId('source-1'),
  time: new Date(`2026-06-12T10:00:${String(lapNo).padStart(2, '0')}.000Z`),
});

const categories: Array<{ excludeFromResults?: boolean; id: CategoryId; name: string }> = [
  { id: createCategoryId('cat-a'), name: 'Category A' },
  { id: createCategoryId('cat-a-duplicate-id'), name: 'Category A' },
  { id: createCategoryId('cat-b'), name: 'Category B' },
  { excludeFromResults: true, id: createCategoryId('cat-error'), name: 'Timing Error List' },
];

const participants: EventParticipant[] = [
  {
    categoryId: createCategoryId('cat-a'),
    currentResult: undefined,
    entrantId: createEventEntrantId('team-1'),
    firstname: 'Team',
    id: createEventParticipantId('p-team-1'),
    identifiers: [],
    lastRecordTime: null,
    resultDuration: null,
    surname: 'One',
  },
  {
    categoryId: createCategoryId('cat-a'),
    currentResult: undefined,
    entrantId: createEventEntrantId('team-1'),
    firstname: 'Team',
    id: createEventParticipantId('p-team-2'),
    identifiers: [],
    lastRecordTime: null,
    resultDuration: null,
    surname: 'Two',
  },
  {
    categoryId: createCategoryId('cat-b'),
    currentResult: undefined,
    entrantId: createEventEntrantId('rider-1'),
    firstname: 'Solo',
    id: createEventParticipantId('p-rider-1'),
    identifiers: [],
    lastRecordTime: null,
    resultDuration: null,
    surname: 'Rider',
  },
  {
    categoryId: createCategoryId('cat-error'),
    currentResult: undefined,
    entrantId: createEventEntrantId('timing-error-entrant'),
    firstname: 'Timing',
    id: createEventParticipantId('p-error'),
    identifiers: [],
    lastRecordTime: null,
    resultDuration: null,
    surname: 'Error',
  },
];

const catalogEntrants: EventCatalogEntrant[] = [
  {
    categoryIds: [createCategoryId('cat-a')],
    entrantType: 'team',
    eventId: createEventId('event-1'),
    id: createEventEntrantId('team-1'),
    memberParticipantIds: [createEventParticipantId('p-team-1'), createEventParticipantId('p-team-2')],
    name: 'Team Rocket',
    sessionIds: [createSessionId('session-1')],
  },
  {
    categoryIds: [createCategoryId('cat-b')],
    entrantType: 'rider',
    eventId: createEventId('event-1'),
    id: createEventEntrantId('rider-1'),
    memberParticipantIds: [createEventParticipantId('p-rider-1')],
    name: 'Solo Rider',
    sessionIds: [createSessionId('session-1')],
  },
  {
    categoryIds: [createCategoryId('cat-error')],
    entrantType: 'rider',
    eventId: createEventId('event-1'),
    id: createEventEntrantId('timing-error-entrant'),
    memberParticipantIds: [createEventParticipantId('p-error')],
    name: 'Timing Error Entrant',
    sessionIds: [createSessionId('session-1')],
  },
];

const lapsByParticipant = new Map<string, ParticipantPassingRecord[]>([
  [
    createEventParticipantId('p-team-1'),
    [
      createLap('team1-lap1', createEventParticipantId('p-team-1'), createEventEntrantId('team-1'), 1, 65000, 65000),
      createLap('team1-lap2', createEventParticipantId('p-team-1'), createEventEntrantId('team-1'), 2, 132000, 67000),
    ],
  ],
  [
    createEventParticipantId('p-team-2'),
    [
      createLap('team2-lap1', createEventParticipantId('p-team-2'), createEventEntrantId('team-1'), 1, 64000, 64000),
      createLap('team2-lap2', createEventParticipantId('p-team-2'), createEventEntrantId('team-1'), 2, 130000, 63000),
    ],
  ],
  [
    createEventParticipantId('p-rider-1'),
    [
      createLap('rider-lap1', createEventParticipantId('p-rider-1'), createEventEntrantId('rider-1'), 1, 70000, 70000),
      createLap('rider-lap2', createEventParticipantId('p-rider-1'), createEventEntrantId('rider-1'), 2, 145000, 75000),
    ],
  ],
  [
    createEventParticipantId('p-error'),
    [
      createLap('error-lap1', createEventParticipantId('p-error'), createEventEntrantId('timing-error-entrant'), 1, 10000, 10000),
    ],
  ],
]);

const categoryLookup = new Map<string, EventCategory>([
  [createCategoryId('cat-a'), { id: createCategoryId('cat-a'), name: 'Category A' }],
  [createCategoryId('cat-b'), { id: createCategoryId('cat-b'), name: 'Category B' }],
  [createCategoryId('cat-error'), { excludeFromResults: true, id: createCategoryId('cat-error'), name: 'Timing Error List' }],
]);

const raceState = {
  categories: Array.from(categoryLookup.values()),
  countTransponderCrossings: () => 0,
  excludeCrossing: () => undefined,
  getCategoryById: (categoryId: CategoryId) => categoryLookup.get(categoryId),
  getEntrantIdForParticipant: (participantId: EventParticipantId) => participants.find((item) => item.id === participantId)?.entrantId,
  getParticipantById: (participantId: EventParticipantId) => participants.find((item) => item.id === participantId),
  getParticipantLaps: (participantId: EventParticipantId) => lapsByParticipant.get(participantId) || [],
  getTransponderCrossings: () => [],
  participants,
  records: [],
  teams: [],
  updateCategoryDetails: () => undefined,
  updateEntrantCategory: () => undefined,
  updateParticipantCategory: () => undefined,
} as unknown as Session & RaceStateLookup;

describe('race analytics views integration', () => {
  let container: HTMLDivElement;
  let root: Root;

  useUiConsoleGuards();

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('shows correct overall and per-category standings for team and individual entrants', async () => {
    await act(async () => {
      root.render(
        <ResultsPage
          categories={categories}
          catalogEntrants={catalogEntrants}
          eventSessionOptions={[
            { eventId: createEventId('event-1'), eventName: 'Winter Round', value: 'event:event-1' },
            { eventId: createEventId('event-1'), eventName: 'Winter Round', sessionId: createSessionId('session-1'), sessionName: 'Feature Race', value: 'session:event-1:session-1' },
          ]}
          onSelectEventSession={vi.fn()}
          raceState={raceState}
          selectedCategoryId={undefined}
          selectedEventSessionValue="session:event-1:session-1"
        />,
      );
    });

    expect(container.textContent).toContain('Team Rocket');
    expect(container.textContent).toContain('Solo Rider');
    expect(container.textContent).not.toContain('Timing Error Entrant');
    expect(container.textContent).toContain('2:12.000');
    expect(container.textContent).toContain('2:25.000');
    expect(container.textContent).toContain('1:03.000');
    expect(container.textContent).toContain('1:10.000');

    const categorySelect = container.querySelector('select[aria-label="Race View Category"]') as HTMLSelectElement;
    expect(categorySelect).toBeTruthy();
    const eventSessionSelect = container.querySelector('select[aria-label="Race View Event Session"]') as HTMLSelectElement;
    expect(eventSessionSelect).toBeTruthy();
    expect(Array.from(eventSessionSelect.options).map((option) => option.textContent)).toEqual(['Winter Round', '-> Feature Race']);
    expect(eventSessionSelect.options[0].disabled).toBe(true);
    expect(eventSessionSelect.options[1].disabled).toBe(false);

    const categoryOptions = Array.from(categorySelect.querySelectorAll('option')).map((option) => option.textContent);
    expect(categoryOptions.filter((text) => text === 'Category A')).toHaveLength(1);
    expect(categoryOptions).toContain('Timing Error List');

    await act(async () => {
      setSelectValue(categorySelect, createCategoryId('cat-a'));
    });

    expect(container.textContent).toContain('Team Rocket');
    expect(container.textContent).not.toContain('Solo Rider');

    await act(async () => {
      setSelectValue(categorySelect, createCategoryId('cat-b'));
    });

    expect(container.textContent).not.toContain('Team Rocket');
    expect(container.textContent).toContain('Solo Rider');

    const viewSelect = container.querySelector('select[aria-label="Results View Type"]') as HTMLSelectElement;
    await act(async () => {
      setSelectValue(categorySelect, createCategoryId('cat-a'));
      setSelectValue(viewSelect, 'lap-chart');
    });

    expect(container.querySelector('table[aria-label="Results Lap Chart Table"]')).toBeTruthy();
    const lapEntryButton = container.querySelector('button.lap-entry-button') as HTMLButtonElement;
    expect(lapEntryButton).toBeTruthy();

    await act(async () => {
      lapEntryButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[aria-label="Lap Entry Details"]')).toBeTruthy();
    expect(container.textContent).toContain(`Entrant: Team Rocket (${createEventEntrantId('team-1')})`);
  });

  it('renders calculated INDY Entry laps without merging Penske drivers', async () => {
    const indyEventId = createEventId('indy-entry-results');
    const indyCategoryId = createCategoryId('indy-entry-category');
    const penskeEntrantId = createEventEntrantId('indy-penske-entrant');
    const driverData = [
      { entrySeed: 'indy-mears-entry', firstName: 'Rick', laps: 200, number: '3', surname: 'Mears', totalTime: 10_000_000 },
      { entrySeed: 'indy-andretti-entry', firstName: 'Michael', laps: 200, number: '10', surname: 'Andretti', totalTime: 10_001_000 },
      { entrySeed: 'indy-fittipaldi-entry', firstName: 'Emerson', laps: 171, number: '5', surname: 'Fittipaldi', totalTime: 9_000_000 },
    ];
    const indyParticipants: EventParticipant[] = driverData.map((driver) => {
      const entryId = createEventEntrantId(driver.entrySeed);
      return {
        categoryId: undefined,
        currentResult: undefined,
        entrantId: penskeEntrantId,
        entryId,
        firstname: driver.firstName,
        id: createEventParticipantId(`${driver.entrySeed}-participant`),
        identifiers: [],
        lastRecordTime: null,
        resultDuration: null,
        surname: driver.surname,
      };
    });
    const indyEntries: EventCatalogEntry[] = driverData.map((driver, index) => ({
      categoryId: indyCategoryId,
      entrantId: penskeEntrantId,
      eventId: indyEventId,
      id: createEventEntrantId(driver.entrySeed),
      identifiers: [],
      name: `${driver.firstName} ${driver.surname}`,
      participantIds: [indyParticipants[index].id],
      raceNumber: driver.number,
    }));
    const indyCategory: EventCategory = { id: indyCategoryId, name: 'INDY 500' };
    const indyRaceState = {
      ...raceState,
      categories: [indyCategory],
      getCategoryById: (categoryId: CategoryId) => categoryId === indyCategoryId ? indyCategory : undefined,
      getFinishLineNumbers: () => [1],
      getParticipantById: (participantId: EventParticipantId) => indyParticipants.find((participant) => participant.id === participantId),
      getParticipantLaps: (participantId: EventParticipantId) => {
        const driverIndex = indyParticipants.findIndex((participant) => participant.id === participantId);
        const driver = driverData[driverIndex];
        return driver
          ? Array.from({ length: driver.laps }, (_, lapIndex) => createLap(
            `${driver.entrySeed}-lap-${lapIndex + 1}`,
            participantId,
            createEventEntrantId(driver.entrySeed),
            lapIndex + 1,
            Math.round((driver.totalTime * (lapIndex + 1)) / driver.laps),
            Math.round(driver.totalTime / driver.laps),
          ))
          : [];
      },
      participants: indyParticipants,
    } as unknown as Session & RaceStateLookup;

    await act(async () => {
      root.render(
        <ResultsPage
          categories={[indyCategory]}
          catalogEntries={indyEntries}
          catalogEntrants={[{
            categoryIds: [],
            entrantType: 'team',
            entryIds: indyEntries.map((entry) => entry.id),
            eventId: indyEventId,
            id: penskeEntrantId,
            isEntryOwner: true,
            memberParticipantIds: [],
            name: 'Penske Racing',
          }]}
          event={{
            categoryIds: [indyCategoryId],
            date: '1991-05-26',
            discipline: 'motorsport',
            entrantIds: [penskeEntrantId],
            entryIds: indyEntries.map((entry) => entry.id),
            format: 'race-weekend',
            id: indyEventId,
            name: 'INDY500',
            sessionIds: [],
            timeZone: 'America/Indiana/Indianapolis',
          }}
          raceState={indyRaceState}
        />,
      );
    });

    const rows = Array.from(container.querySelectorAll<HTMLTableRowElement>('table[aria-label="Results Table"] tbody tr'));
    expect(rows.map((row) => Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent))).toEqual([
      ['1', '3', 'Rick MEARS', 'INDY 500', '200', '02:46:40.000', '0:50.000'],
      ['2', '10', 'Michael ANDRETTI', 'INDY 500', '200', '02:46:41.000', '0:50.005'],
      ['3', '5', 'Emerson FITTIPALDI', 'INDY 500', '171', '02:30:00.000', '0:52.632'],
    ]);

    await act(async () => {
      root.render(
        <ReportsPage
          categories={[indyCategory]}
          catalogEntries={indyEntries}
          catalogEntrants={[{
            categoryIds: [],
            entrantType: 'team',
            entryIds: indyEntries.map((entry) => entry.id),
            eventId: indyEventId,
            id: penskeEntrantId,
            isEntryOwner: true,
            memberParticipantIds: [],
            name: 'Penske Racing',
          }]}
          raceState={indyRaceState}
        />,
      );
    });

    const reportRows = Array.from(container.querySelectorAll<HTMLTableRowElement>('table[aria-label="Fastest Laps Report Table"] tbody tr'));
    expect(reportRows).toHaveLength(3);
    expect(reportRows.every((row) => row.textContent?.includes('INDY 500'))).toBe(true);
    expect(reportRows.map((row) => row.querySelectorAll('td')[1]?.textContent)).toEqual([
      'Rick Mears',
      'Michael Andretti',
      'Emerson Fittipaldi',
    ]);
  });

  it('uses counted finish-line crossings only for results and reports', async () => {
    const soloParticipantId = createEventParticipantId('p-rider-1');
    const soloEntrantId = createEventEntrantId('rider-1');
    const countedFinish = {
      ...createLap('counted-finish', soloParticipantId, soloEntrantId, 1, 70000, 70000),
      lineNumber: 1,
    };
    const sectorCrossing = {
      ...createLap('sector-crossing', soloParticipantId, soloEntrantId, 1, 71000, 1000),
      lineNumber: 2,
    };
    const speedTrapCrossing = {
      ...createLap('speed-trap-crossing', soloParticipantId, soloEntrantId, 1, 72000, 500),
      lineNumber: 3,
    };
    const countedPitFinish = {
      ...createLap('counted-pit-finish', soloParticipantId, soloEntrantId, 2, 125000, 55000),
      lineNumber: 9,
    };
    const excludedFinish = {
      ...createLap('excluded-finish', soloParticipantId, soloEntrantId, 3, 126000, 1000),
      isExcluded: true,
      lineNumber: 1,
    };
    const afterFinishCrossing = {
      ...createLap('after-finish', soloParticipantId, soloEntrantId, 3, 127000, 1000),
      isExcluded: undefined,
      lineNumber: 1,
      unrelatedReasonCode: CROSSING_UNRELATED_AFTER_FINISH,
    };
    const raceStateWithMixedCrossings = {
      ...raceState,
      getFinishLineNumbers: () => [1, 9],
      getParticipantLaps: (participantId: EventParticipantId) => participantId === soloParticipantId
        ? [countedFinish, sectorCrossing, speedTrapCrossing, countedPitFinish, excludedFinish, afterFinishCrossing]
        : lapsByParticipant.get(participantId) || [],
    } as unknown as Session & RaceStateLookup;

    await act(async () => {
      root.render(
        <ResultsPage
          categories={categories}
          catalogEntrants={catalogEntrants}
          raceState={raceStateWithMixedCrossings}
        />,
      );
    });

    const resultsRows = Array.from(container.querySelectorAll('table[aria-label="Results Table"] tbody tr'));
    const soloResult = resultsRows.find((row) => row.textContent?.includes('Solo Rider'));
    expect(Array.from(soloResult!.querySelectorAll('td')).map((cell) => cell.textContent)).toEqual([
      '2',
      '-',
      'Solo Rider',
      'Category B',
      '2',
      '2:05.000',
      '0:55.000',
    ]);

    await act(async () => {
      root.render(
        <ReportsPage
          categories={categories}
          catalogEntrants={catalogEntrants}
          raceState={raceStateWithMixedCrossings}
        />,
      );
    });

    const fastestRow = Array.from(container.querySelectorAll('table[aria-label="Fastest Laps Report Table"] tbody tr'))
      .find((row) => row.textContent?.includes('Solo Rider'));
    expect(Array.from(fastestRow!.querySelectorAll('td')).map((cell) => cell.textContent)).toEqual([
      soloParticipantId,
      'Solo Rider',
      'Category B',
      '0:55.000',
      '2',
      '2',
    ]);

    const reportSelect = container.querySelector('select[aria-label="Reports View Type"]') as HTMLSelectElement;
    const categorySelect = container.querySelector('select[aria-label="Race View Category"]') as HTMLSelectElement;
    await act(async () => {
      setSelectValue(categorySelect, createCategoryId('cat-b'));
      setSelectValue(reportSelect, 'lap-times');
    });

    const lapRows = Array.from(container.querySelectorAll('table[aria-label="Lap Times Report Table"] tbody tr'));
    expect(lapRows).toHaveLength(2);
    expect(lapRows.map((row) => row.querySelectorAll('td')[1]?.textContent)).toEqual(['1:10.000', '0:55.000']);
    expect(container.textContent).toContain('0:55.000');
    expect(container.textContent).not.toContain('0:00.500');
  });

  it('uses the same finish-line and minimum-lap rules in Timing, Results, and Reports', async () => {
    const soloParticipantId = createEventParticipantId('p-rider-1');
    const soloEntrantId = createEventEntrantId('rider-1');
    const firstLap = {
      ...createLap('parity-lap-1', soloParticipantId, soloEntrantId, 1, 90_000, 90_000),
      chipCode: 12_345,
      lineNumber: 1,
    };
    const fastestCountedLap = {
      ...createLap('parity-lap-2', soloParticipantId, soloEntrantId, 2, 160_000, 70_000),
      chipCode: 12_345,
      lineNumber: 1,
    };
    const sectorCrossing = {
      ...createLap('parity-sector', soloParticipantId, soloEntrantId, 2, 161_000, 1_000),
      chipCode: 12_345,
      lineNumber: 2,
    };
    const underMinimumLap = {
      ...createLap('parity-under-minimum', soloParticipantId, soloEntrantId, 2, 170_000, 10_000),
      chipCode: 12_345,
      infoFlags: CROSSING_FLAG_LAP_UNDER_MINIMUM,
      lineNumber: 1,
      unrelatedReasonCode: CROSSING_UNRELATED_LAP_UNDER_MINIMUM,
    };
    const parityLaps = [firstLap, fastestCountedLap, sectorCrossing, underMinimumLap];
    const parityRaceState = {
      ...raceState,
      getFinishLineNumbers: () => [1],
      getParticipantLaps: (participantId: EventParticipantId) => participantId === soloParticipantId
        ? parityLaps
        : [],
      records: parityLaps,
    } as unknown as Session & RaceStateLookup;

    await act(async () => {
      root.render(
        <RecentRecords
          raceStateLookup={parityRaceState}
          records={parityLaps}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
        />,
      );
    });

    const timingFastestRow = container.querySelector('tr[data-record-id="parity-lap-2"]');
    const timingUnderMinimumRow = container.querySelector('tr[data-record-id="parity-under-minimum"]');
    expect(timingFastestRow).toBeTruthy();
    expect(timingUnderMinimumRow).toBeTruthy();
    expect(timingFastestRow!.querySelector('.overallFastest')).toBeTruthy();
    expect(timingUnderMinimumRow!.querySelector('.overallFastest')).toBeFalsy();

    await act(async () => {
      root.render(
        <ResultsPage
          categories={categories}
          catalogEntrants={catalogEntrants}
          raceState={parityRaceState}
        />,
      );
    });

    const resultsRow = Array.from(container.querySelectorAll('table[aria-label="Results Table"] tbody tr'))
      .find((row) => row.textContent?.includes('Solo Rider'));
    expect(Array.from(resultsRow!.querySelectorAll('td')).map((cell) => cell.textContent)).toEqual([
      '1',
      '-',
      'Solo Rider',
      'Category B',
      '2',
      '2:40.000',
      '1:10.000',
    ]);

    await act(async () => {
      root.render(
        <ReportsPage
          categories={categories}
          catalogEntrants={catalogEntrants}
          raceState={parityRaceState}
        />,
      );
    });

    const reportsRow = Array.from(container.querySelectorAll('table[aria-label="Fastest Laps Report Table"] tbody tr'))
      .find((row) => row.textContent?.includes('Solo Rider'));
    expect(Array.from(reportsRow!.querySelectorAll('td')).map((cell) => cell.textContent)).toEqual([
      soloParticipantId,
      'Solo Rider',
      'Category B',
      '1:10.000',
      '2',
      '2',
    ]);
  });

  it('uses a green flag with no categories for Timing, Results, and Reports calculations', async () => {
    const categoryId = createCategoryId('unscoped-flag-category');
    const entrantId = createEventEntrantId('unscoped-flag-entrant');
    const participantId = createEventParticipantId('unscoped-flag-participant');
    const sourceId = createTimeRecordSourceId('unscoped-flag-source');
    const participant: EventParticipant = {
      categoryId,
      currentResult: undefined,
      entrantId,
      firstname: 'Unscoped',
      id: participantId,
      identifiers: [{ fromTime: undefined, toTime: undefined, txNo: 99 }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Flag',
    };
    const greenFlag = createGreenFlagEvent({
      categoryIds: [],
      id: createTimeRecordId('unscoped-flag-green'),
      indicatesRaceStart: true,
      sequence: 1,
      source: sourceId,
      time: new Date('2026-06-12T10:00:00.000Z'),
    });
    const crossings: ParticipantPassingRecord[] = [{
      chipCode: 99,
      entrantId,
      id: createTimeRecordId('unscoped-flag-lap-1'),
      lineNumber: 1,
      participantId,
      recordType: RECORD_TX_CROSSING,
      sequence: 2,
      source: sourceId,
      time: new Date('2026-06-12T10:01:30.000Z'),
    } as unknown as ParticipantPassingRecord, {
      chipCode: 99,
      entrantId,
      id: createTimeRecordId('unscoped-flag-lap-2'),
      lineNumber: 1,
      participantId,
      recordType: RECORD_TX_CROSSING,
      sequence: 3,
      source: sourceId,
      time: new Date('2026-06-12T10:02:40.000Z'),
    } as unknown as ParticipantPassingRecord];
    const calculatedRaceState = new Session({
      categories: [{ id: categoryId, name: 'Unscoped Flag Category' }],
      participants: [participant],
      records: [greenFlag, ...crossings],
      teams: [],
    });
    calculatedRaceState.setFinishLineNumbers([1]);
    calculatedRaceState.setMinimumLapTimeMilliseconds(60_000);
    calculatedRaceState.setSessionValidCategoryIds(new Set([categoryId]));
    const calculatedEntrants: EventCatalogEntrant[] = [{
      categoryId,
      categoryIds: [categoryId],
      entrantType: 'rider',
      eventId: createEventId('unscoped-flag-event'),
      id: entrantId,
      memberParticipantIds: [participantId],
      name: 'Unscoped Flag',
      sessionIds: [createSessionId('unscoped-flag-session')],
    }];

    await act(async () => {
      root.render(
        <RecentRecords
          raceStateLookup={calculatedRaceState}
          records={calculatedRaceState.records as EventTimeRecord[]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
        />,
      );
    });
    expect((calculatedRaceState.getParticipantLaps(participantId) || []).map((lap) => lap.lapNo)).toEqual([1, 2]);
    expect(container.querySelector(`tr[data-record-id="${crossings[1]!.id}"] .overallFastest`)).toBeTruthy();

    await act(async () => {
      root.render(
        <ResultsPage
          categories={calculatedRaceState.categories}
          catalogEntrants={calculatedEntrants}
          raceState={calculatedRaceState}
        />,
      );
    });
    const resultRow = container.querySelector('table[aria-label="Results Table"] tbody tr');
    expect(Array.from(resultRow!.querySelectorAll('td')).map((cell) => cell.textContent)).toEqual([
      '1',
      '-',
      'Unscoped Flag',
      'Unscoped Flag Category',
      '2',
      '2:40.000',
      '1:10.000',
    ]);

    await act(async () => {
      root.render(
        <ReportsPage
          categories={calculatedRaceState.categories}
          catalogEntrants={calculatedEntrants}
          raceState={calculatedRaceState}
        />,
      );
    });
    const reportRow = container.querySelector('table[aria-label="Fastest Laps Report Table"] tbody tr');
    expect(Array.from(reportRow!.querySelectorAll('td')).map((cell) => cell.textContent)).toEqual([
      participantId,
      'Unscoped Flag',
      'Unscoped Flag Category',
      '1:10.000',
      '2',
      '2',
    ]);
  });

  it('uses the Timing source-loop lap-completion rules in Results and Reports', async () => {
    const soloParticipantId = createEventParticipantId('p-rider-1');
    const soloEntrantId = createEventEntrantId('rider-1');
    const sourceId = createTimeRecordSourceId('configured-source');
    const configuredLap = {
      ...createLap('configured-lap', soloParticipantId, soloEntrantId, 1, 90000, 90000),
      isLapCompletion: false,
      lineNumber: 2,
      loopNumber: 1,
      source: sourceId,
    };
    const sourceLoop = {
      card: 1,
      comPort: 1,
      isLapCompletion: true,
      loopNumber: 1,
      siteAddress: 2,
    };
    const raceStateWithConfiguredLapCompletion = {
      ...raceState,
      getFinishLineNumbers: () => [1],
      getParticipantLaps: (participantId: EventParticipantId) => participantId === soloParticipantId
        ? [configuredLap]
        : [],
      getTimeRecordSourceById: () => ({
        ctcTrackConfig: {
          eventDescriptions: {},
          networks: [{
            lines: [{ line: 2, loops: [sourceLoop], name: 'Alternate finish' }],
            name: 'Timing network',
          }],
        },
        id: sourceId,
        name: 'Configured source',
      }),
      records: [configuredLap],
    } as unknown as Session & RaceStateLookup;

    await act(async () => {
      root.render(
        <ResultsPage
          categories={categories}
          catalogEntrants={catalogEntrants}
          raceState={raceStateWithConfiguredLapCompletion}
        />,
      );
    });

    const resultsRows = Array.from(container.querySelectorAll('table[aria-label="Results Table"] tbody tr'));
    const soloResult = resultsRows.find((row) => row.textContent?.includes('Solo Rider'));
    expect(Array.from(soloResult!.querySelectorAll('td')).map((cell) => cell.textContent)).toEqual([
      '1',
      '-',
      'Solo Rider',
      'Category B',
      '1',
      '1:30.000',
      '1:30.000',
    ]);

    await act(async () => {
      root.render(
        <ReportsPage
          categories={categories}
          catalogEntrants={catalogEntrants}
          raceState={raceStateWithConfiguredLapCompletion}
        />,
      );
    });

    const ignoreFirstLapCheckbox = container.querySelector('input[aria-label="Ignore first lap"]') as HTMLInputElement;
    await act(async () => {
      ignoreFirstLapCheckbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const fastestRow = Array.from(container.querySelectorAll('table[aria-label="Fastest Laps Report Table"] tbody tr'))
      .find((row) => row.textContent?.includes('Solo Rider'));
    expect(Array.from(fastestRow!.querySelectorAll('td')).map((cell) => cell.textContent)).toEqual([
      soloParticipantId,
      'Solo Rider',
      'Category B',
      '1:30.000',
      '1',
      '1',
    ]);

    sourceLoop.isLapCompletion = false;
    await act(async () => {
      root.render(
        <ReportsPage
          categories={categories}
          catalogEntrants={catalogEntrants}
          raceState={raceStateWithConfiguredLapCompletion}
        />,
      );
    });

    const updatedFastestRow = Array.from(container.querySelectorAll('table[aria-label="Fastest Laps Report Table"] tbody tr'))
      .find((row) => row.textContent?.includes('Solo Rider'));
    expect(Array.from(updatedFastestRow!.querySelectorAll('td')).map((cell) => cell.textContent)).toEqual([
      '-',
      'Solo Rider',
      'Category B',
      '--:--:--.---',
      '-',
      '0',
    ]);
  });

  it('reports fastest laps and participant lap times correctly for team and individual entrants', async () => {
    await act(async () => {
      root.render(
        <ReportsPage
          categories={categories}
          catalogEntrants={catalogEntrants}
          eventSessionOptions={[
            { eventId: createEventId('event-1'), eventName: 'Winter Round', value: `event:${createEventId('event-1')}` },
            { eventId: createEventId('event-1'), eventName: 'Winter Round', sessionId: createSessionId('session-1'), sessionName: 'Feature Race', value: `session:${createEventId('event-1')}:session:${createSessionId('session-1')}` },
          ]}
          onSelectEventSession={vi.fn()}
          raceState={raceState}
          selectedCategoryId={undefined}
          selectedEventSessionValue={`session:${createEventId('event-1')}:session:${createSessionId('session-1')}`}
        />,
      );
    });

    expect(container.querySelector('table[aria-label="Fastest Laps Report Table"]')).toBeTruthy();
    const fastestTable = container.querySelector('table[aria-label="Fastest Laps Report Table"]') as HTMLTableElement;
    expect(fastestTable.textContent).toContain('On');
    expect(Array.from(fastestTable.querySelectorAll('thead th')).map((cell) => cell.textContent)).toEqual([
      'Plate',
      'Entrant',
      'Category',
      'Fastest Lap',
      'On',
      'Total Laps',
    ]);
    expect(container.textContent).toContain('Team Rocket');
    expect(container.textContent).toContain('Solo Rider');
    expect(container.textContent).not.toContain('Timing Error Entrant');
    expect(container.textContent).toContain('1:03.000');
    expect(container.textContent).toContain('1:15.000');
    expect(container.textContent).not.toContain('1:10.000');
    expect(container.textContent).not.toContain('0:10.000');
    const fastestRows = (): HTMLTableRowElement[] => Array.from(fastestTable.querySelectorAll('tbody tr'));
    const fastestRowCells = (entrantName: string): (string | null)[] => {
      const row = fastestRows().find((item) => item.textContent?.includes(entrantName));
      expect(row).toBeTruthy();
      return Array.from(row!.querySelectorAll('td')).map((cell) => cell.textContent);
    };
    const fastestIgnoreFirstLapCheckbox = container.querySelector('input[aria-label="Ignore first lap"]') as HTMLInputElement;
    expect(fastestIgnoreFirstLapCheckbox).toBeTruthy();
    expect(fastestIgnoreFirstLapCheckbox.checked).toBe(true);
    expect(fastestRowCells('Team Rocket')).toEqual([
      createEventParticipantId('p-team-2'),
      'Team Rocket',
      'Category A',
      '1:03.000',
      '2',
      '4',
    ]);
    expect(fastestRowCells('Solo Rider')).toEqual([
      createEventParticipantId('p-rider-1'),
      'Solo Rider',
      'Category B',
      '1:15.000',
      '2',
      '2',
    ]);

    await act(async () => {
      fastestIgnoreFirstLapCheckbox.click();
    });

    expect(fastestRowCells('Solo Rider')).toEqual([
      createEventParticipantId('p-rider-1'),
      'Solo Rider',
      'Category B',
      '1:10.000',
      '1',
      '2',
    ]);

    const reportSelect = container.querySelector('select[aria-label="Reports View Type"]') as HTMLSelectElement;
    await act(async () => {
      setSelectValue(reportSelect, 'fastest-lap-timeline');
    });

    const timelineTable = container.querySelector('table[aria-label="Fastest Lap Timeline Report Table"]') as HTMLTableElement;
    expect(timelineTable).toBeTruthy();
    expect(Array.from(timelineTable.querySelectorAll('thead th')).map((cell) => cell.textContent)).toEqual([
      'Plate',
      'Participant',
      'Team',
      'Time of day',
      'Elapsed',
      'On',
      'Lap Time',
    ]);
    const timelineRows = (): (string | null)[][] => {
      return Array.from(timelineTable.querySelectorAll('tbody tr')).map((row) => Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent));
    };
    const ignoreFirstLapCheckbox = container.querySelector('input[aria-label="Ignore first lap"]') as HTMLInputElement;
    expect(ignoreFirstLapCheckbox).toBeTruthy();
    expect(ignoreFirstLapCheckbox.checked).toBe(true);
    expect(timelineRows()).toEqual([
      [
        createEventParticipantId('p-team-2'),
        'Team Two',
        'Team Rocket',
        tableTimeString(lapsByParticipant.get(createEventParticipantId('p-team-2'))![1].time),
        '2:10.000',
        '2',
        '1:03.000',
      ],
    ]);

    await act(async () => {
      ignoreFirstLapCheckbox.click();
    });

    expect(timelineRows()).toEqual([
      [
        createEventParticipantId('p-team-2'),
        'Team Two',
        'Team Rocket',
        tableTimeString(lapsByParticipant.get(createEventParticipantId('p-team-2'))![0].time),
        '1:04.000',
        '1',
        '1:04.000',
      ],
      [
        createEventParticipantId('p-team-2'),
        'Team Two',
        'Team Rocket',
        tableTimeString(lapsByParticipant.get(createEventParticipantId('p-team-2'))![1].time),
        '2:10.000',
        '2',
        '1:03.000',
      ],
    ]);

    const categorySelect = container.querySelector('select[aria-label="Race View Category"]') as HTMLSelectElement;
    expect(container.querySelector('select[aria-label="Race View Event Session"]')).toBeTruthy();

    await act(async () => {
      setSelectValue(categorySelect, createCategoryId('cat-a'));
    });

    expect(container.textContent).toContain('Team Rocket');
    expect(container.textContent).not.toContain('Solo Rider');

    await act(async () => {
      setSelectValue(reportSelect, 'lap-times');
    });

    expect(container.textContent).toContain('Lap Times Report');
    expect(container.textContent).toContain('Team Rocket');
    const individualLapTimesTable = container.querySelector('table[aria-label="Lap Times Report Table"]') as HTMLTableElement;
    expect(individualLapTimesTable).toBeTruthy();
    expect(Array.from(individualLapTimesTable.querySelectorAll('thead th')).map((cell) => cell.textContent)).toEqual([
      'Lap',
      'Lap Time',
      'Time of day',
      'Elapsed',
    ]);
    expect(Array.from(individualLapTimesTable.querySelectorAll('tbody tr:first-child td')).map((cell) => cell.textContent)).toEqual([
      '1',
      '1:04.000',
      tableTimeString(lapsByParticipant.get(createEventParticipantId('p-team-2'))![0].time),
      '1:04.000',
    ]);

    const lapTimesModeSelect = container.querySelector('.lap-times-report__toolbar select') as HTMLSelectElement;
    expect(lapTimesModeSelect).toBeTruthy();

    await act(async () => {
      setSelectValue(lapTimesModeSelect, 'table');
    });

    expect(container.querySelector('table.lap-times-block-table')).toBeTruthy();
    expect(container.textContent).toContain('1:05.000');
    expect(container.textContent).toContain('1:07.000');

    await act(async () => {
      setSelectValue(reportSelect, 'fastest-laps');
    });

    const categorySelectAfterViewChange = container.querySelector('select[aria-label="Race View Category"]') as HTMLSelectElement;
    await act(async () => {
      setSelectValue(categorySelectAfterViewChange, createCategoryId('cat-b'));
    });

    expect(container.textContent).toContain('Solo Rider');
    expect(container.textContent).not.toContain('Team Rocket');

    await act(async () => {
      setSelectValue(reportSelect, 'lap-chart');
    });

    expect(container.querySelector('table[aria-label="Reports Lap Chart Table"]')).toBeTruthy();
  });

  it('highlights every lap chart cell for the selected reports entrant and toggles the selection', async () => {
    await act(async () => {
      root.render(
        <ReportsPage
          categories={categories}
          catalogEntrants={catalogEntrants}
          raceState={raceState}
          selectedCategoryId={undefined}
        />,
      );
    });

    const reportSelect = container.querySelector('select[aria-label="Reports View Type"]') as HTMLSelectElement;
    await act(async () => {
      setSelectValue(reportSelect, 'lap-chart');
    });

    const selectedCells = (): HTMLTableCellElement[] => {
      return Array.from(container.querySelectorAll('td.lap-chart-table__entrant-cell--selected'));
    };
    const lapEntryButton = (raceNumber: string): HTMLButtonElement => {
      const buttons = Array.from(container.querySelectorAll('button.lap-entry-button'));
      const button = buttons.find((item) => item.textContent === raceNumber) as HTMLButtonElement | undefined;
      expect(button).toBeTruthy();
      return button!;
    };

    await act(async () => {
      lapEntryButton(createEventParticipantId('p-team-1')).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(selectedCells()).toHaveLength(4);
    expect(selectedCells().filter((cell) => cell.textContent === createEventParticipantId('p-team-1'))).toHaveLength(2);
    expect(selectedCells().filter((cell) => cell.textContent === createEventParticipantId('p-team-2'))).toHaveLength(2);
    expect(selectedCells().some((cell) => cell.textContent === createEventParticipantId('p-rider-1'))).toBe(false);
    expect(lapEntryButton(createEventParticipantId('p-team-1')).getAttribute('aria-pressed')).toBe('true');
    expect(lapEntryButton(createEventParticipantId('p-team-2')).getAttribute('aria-pressed')).toBe('true');
    expect(lapEntryButton(createEventParticipantId('p-rider-1')).getAttribute('aria-pressed')).toBe('false');

    await act(async () => {
      lapEntryButton(createEventParticipantId('p-team-2')).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(selectedCells()).toHaveLength(0);
    expect(container.querySelector('[aria-label="Lap Entry Details"]')).toBeFalsy();

    await act(async () => {
      lapEntryButton(createEventParticipantId('p-team-1')).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      lapEntryButton(createEventParticipantId('p-rider-1')).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(selectedCells()).toHaveLength(2);
    expect(selectedCells().map((cell) => cell.textContent)).toEqual([
      createEventParticipantId('p-rider-1'),
      createEventParticipantId('p-rider-1'),
    ]);
    expect(lapEntryButton(createEventParticipantId('p-team-1')).getAttribute('aria-pressed')).toBe('false');
    expect(lapEntryButton(createEventParticipantId('p-rider-1')).getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).toContain(`Entrant: Solo Rider (${createEventEntrantId('rider-1')})`);
  });

  it('draws entrant line chart segments behind reports lap chart plates when enabled', async () => {
    await act(async () => {
      root.render(
        <ReportsPage
          categories={categories}
          catalogEntrants={catalogEntrants}
          raceState={raceState}
          selectedCategoryId={undefined}
        />,
      );
    });

    const reportSelect = container.querySelector('select[aria-label="Reports View Type"]') as HTMLSelectElement;
    await act(async () => {
      setSelectValue(reportSelect, 'lap-chart');
    });

    expect(container.textContent).toContain('Draw line chart');
    expect(container.querySelector('svg.lap-chart-line-overlay')).toBeFalsy();

    const lineChartCheckbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(lineChartCheckbox).toBeTruthy();

    await act(async () => {
      lineChartCheckbox.click();
    });

    const overlay = container.querySelector('svg.lap-chart-line-overlay') as SVGSVGElement;
    expect(overlay).toBeTruthy();
    const lines = Array.from(overlay.querySelectorAll('line.lap-chart-line-overlay__line'));
    const teamLines = lines.filter((line) => line.getAttribute('data-lap-chart-entrant-id') === createEventEntrantId('team-1'));
    const riderLines = lines.filter((line) => line.getAttribute('data-lap-chart-entrant-id') === createEventEntrantId('rider-1'));
    expect(teamLines).toHaveLength(3);
    expect(riderLines).toHaveLength(1);
    expect(teamLines[0].getAttribute('stroke')).toBeTruthy();
    expect(riderLines[0].getAttribute('stroke')).toBeTruthy();
    expect(teamLines[0].getAttribute('stroke')).not.toBe(riderLines[0].getAttribute('stroke'));

    await act(async () => {
      lineChartCheckbox.click();
    });

    expect(container.querySelector('svg.lap-chart-line-overlay')).toBeFalsy();
  });

  it('renders Yellow Flag periods with leader and revocation details', async () => {
    const yellowTime = new Date('2026-06-12T10:00:10.000Z');
    const greenTime = new Date('2026-06-12T10:00:25.000Z');
    const yellow = {
      flagType: 'yellow', flagValue: 'caution', id: createTimeRecordId('report-yellow'), recordType: 4, sequence: 10,
      source: createTimeRecordSourceId('report-flags'), time: yellowTime,
    };
    const green = {
      flagType: 'green', flagValue: 'course', id: createTimeRecordId('report-green'), indicatesRaceStart: false, recordType: 4, sequence: 11,
      source: createTimeRecordSourceId('report-flags'), time: greenTime,
    };
    const reportRaceState = {
      ...raceState,
      getParticipantLaps: (participantId: EventParticipantId) => participantId === createEventParticipantId('p-rider-1')
        ? [{ ...lapsByParticipant.get(participantId)![0], lapNo: 2, time: new Date('2026-06-12T10:00:08.000Z') }]
        : [],
      records: [yellow, green],
    } as unknown as Session & RaceStateLookup;

    await act(async () => {
      root.render(<ReportsPage categories={[categories[2]!]} catalogEntrants={[catalogEntrants[1]!]} event={{
        categoryIds: [categories[2]!.id],
        date: '2026-06-12',
        entrantIds: [catalogEntrants[1]!.id],
        format: 'race-weekend',
        id: createEventId('report-timezone-event'),
        name: 'Timezone Event',
        sessionIds: [],
        timeZone: 'Australia/Sydney',
      }} raceState={reportRaceState} />);
    });
    const reportSelect = container.querySelector('select[aria-label="Reports View Type"]') as HTMLSelectElement;
    await act(async () => {
      setSelectValue(reportSelect, 'yellow-flag-periods');
    });

    const table = container.querySelector('table[aria-label="Yellow Flag Periods Report Table"]') as HTMLTableElement;
    expect(Array.from(table.querySelectorAll('thead th')).map((cell) => cell.textContent)).toEqual(['From Lap', 'Time of Day', 'Duration', 'Leader at Flag', 'Until Lap', 'Until Time']);
    expect(Array.from(table.querySelectorAll('tbody td')).map((cell) => cell.textContent)).toEqual(['2', tableTimeString(yellowTime, 'Australia/Sydney'), '0:15.000', 'Solo RIDER', '2', tableTimeString(greenTime, 'Australia/Sydney')]);
  });

  it('renders the GPX track-map report with playback controls and clickable entrant state', async () => {
    const trackRecords = Array.from(lapsByParticipant.values()).flat().map((record) => ({
      ...record,
      lineNumber: 1,
      time: record.participantId === createEventParticipantId('p-rider-1')
        ? new Date(`2026-06-12T10:04:${String(record.lapNo).padStart(2, '0')}.000Z`)
        : record.time,
      txNumber: 7,
    }));
    const trackRaceState = {
      ...raceState,
      getFinishLineNumbers: () => [1],
      records: trackRecords,
    } as unknown as Session & RaceStateLookup;
    const event: EventCatalogEvent = {
      categoryIds: [createCategoryId('cat-a'), createCategoryId('cat-b')],
      date: '2026-06-12',
      entrantIds: catalogEntrants.map((entrant) => entrant.id),
      format: 'race-weekend',
      id: createEventId('event-1'),
      name: 'Winter Round',
      sessionIds: [createSessionId('session-1')],
      timeZone: 'Australia/Sydney',
      trackMap: {
        racingLineCsvContent: '# x_m,y_m\n1,1\n9,1\n9,9\n1,9',
        racingLineCsvFileName: 'IMS.csv',
        sourceType: 'racetrack-csv',
        timingLines: [{ label: 'Finish', lineNumber: 1, progress: 0.25 }],
        trackCsvContent: '# x_m,y_m,w_tr_right_m,w_tr_left_m\n0,0,1,1\n10,0,1,1\n10,10,1,1\n0,10,1,1',
        trackCsvFileName: 'IMS.csv',
      },
    };

    await act(async () => {
      root.render(
        <ReportsPage
          categories={categories}
          catalogEntries={[{
            categoryId: createCategoryId('cat-a'),
            entrantId: createEventEntrantId('team-1'),
            eventId: createEventId('event-1'),
            id: createEventEntrantId('team-1'),
            identifiers: [],
            participantIds: [createEventParticipantId('p-team-1'), createEventParticipantId('p-team-2')],
            raceNumber: '42',
          }]}
          catalogEntrants={catalogEntrants}
          event={event}
          raceState={trackRaceState}
        />,
      );
    });

    const reportSelect = container.querySelector('select[aria-label="Reports View Type"]') as HTMLSelectElement;
    await act(async () => {
      setSelectValue(reportSelect, 'track-map');
    });

    expect(container.querySelector('svg[aria-label="Track Map"]')).toBeTruthy();
    expect(container.querySelector('g[aria-label="Track entrant 42"]')).toBeTruthy();
    expect(container.querySelector('polyline[aria-label="Racing Line"]')).toBeTruthy();
    expect(container.querySelector('input[aria-label="Track Map Session Progress"]')).toBeTruthy();
    expect(container.querySelector('circle[aria-label="Timing line 1"]')).toBeTruthy();
    const speedSelect = container.querySelector('select[aria-label="Track Map Playback Speed"]') as HTMLSelectElement;
    expect(Array.from(speedSelect.options).map((option) => option.textContent)).toContain('0.1x');
    expect(Array.from(speedSelect.options).map((option) => option.textContent)).toContain('100x');
    const checkLineOrder = container.querySelector('button[aria-label="Check Track Map Line Order"]') as HTMLButtonElement;
    await act(async () => {
      checkLineOrder.click();
    });
    expect(container.querySelector('[aria-label="Track Map Line Order Check"]')?.textContent).toContain('Timing-line order matches the observed crossing sequence.');
    expect(container.textContent).toContain('Event elapsed time:');
    expect(container.textContent).toContain('Time of day:');

    const entrantMarker = container.querySelector('g[aria-label^="Track entrant"]') as SVGGElement;
    expect(entrantMarker).toBeTruthy();
    const selectedMarkerLabel = entrantMarker.getAttribute('aria-label');
    await act(async () => {
      entrantMarker.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[aria-label="Selected Track Entrant"]')).toBeTruthy();
    expect(container.textContent).toContain('Race position:');
    expect(container.textContent).toContain('Fastest lap:');
    expect(container.textContent).toContain('Last lap:');
    expect(container.textContent).toContain('Laps:');
    expect(container.textContent).toContain('Race elapsed:');

    const progressSlider = container.querySelector('input[aria-label="Track Map Session Progress"]') as HTMLInputElement;
    await act(async () => {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      descriptor?.set?.call(progressSlider, progressSlider.max);
      progressSlider.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.querySelector('[aria-label="DNF Entrants"]')).toBeTruthy();
    const dnfPanel = container.querySelector('[aria-label="DNF Entrants"]') as HTMLElement;
    expect(dnfPanel.style.maxHeight).toBe('min(64vh, 720px)');
    expect(dnfPanel.style.overflowY).toBe('auto');
    expect(container.querySelector(`g[aria-label="${selectedMarkerLabel}"]`)).toBeFalsy();
    expect(container.querySelector('[aria-label="Selected Track Entrant"]')?.textContent).toContain('Race position: DNF');
  });
});


