// @vitest-environment jsdom

import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import type { EventCatalogEntrant } from '../../app/eventCatalog.js';
import { tableTimeString } from '../../app/utils/timeutils.js';
import { CategoryId } from '../../controllers/category.js';
import { EventEntrantId } from '../../model/entrant.js';
import type { EventCategory } from '../../model/eventcategory.js';
import type { EventParticipant, EventParticipantId } from '../../model/eventparticipant.js';
import { createCategoryId, createEventEntrantId, createEventId, createEventParticipantId, createSessionId, createTimeRecordSourceId } from '../../model/ids.js';
import type { RaceStateLookup, Session } from '../../model/racestate.js';
import type { ParticipantPassingRecord } from '../../model/timerecord.js';
import { useUiConsoleGuards } from '../../testing/uiConsoleGuards.js';
import { ReportsPage, ResultsPage } from './raceAnalyticsViews.js';

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
    expect(container.textContent).toContain('00:02:12.000');
    expect(container.textContent).toContain('00:02:25.000');
    expect(container.textContent).toContain('00:01:03.000');
    expect(container.textContent).toContain('00:01:10.000');

    const categorySelect = container.querySelector('select[aria-label="Race View Category"]') as HTMLSelectElement;
    expect(categorySelect).toBeTruthy();
    const eventSessionSelect = container.querySelector('select[aria-label="Race View Event Session"]') as HTMLSelectElement;
    expect(eventSessionSelect).toBeTruthy();
    expect(Array.from(eventSessionSelect.options).map((option) => option.textContent)).toEqual(['Winter Round', '-> Feature Race']);
    expect(eventSessionSelect.options[0].disabled).toBe(true);
    expect(eventSessionSelect.options[1].disabled).toBe(false);

    const categoryOptions = Array.from(categorySelect.querySelectorAll('option')).map((option) => option.textContent);
    expect(categoryOptions.filter((text) => text === 'Category A')).toHaveLength(1);
    expect(categoryOptions).not.toContain('Timing Error List');

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
    expect(container.textContent).toContain('Team Rocket');
    expect(container.textContent).toContain('Solo Rider');
    expect(container.textContent).not.toContain('Timing Error Entrant');
    expect(container.textContent).toContain('00:01:03.000');
    expect(container.textContent).toContain('00:01:10.000');
    expect(container.textContent).not.toContain('00:00:10.000');
    const fastestRows = Array.from(fastestTable.querySelectorAll('tbody tr'));
    const teamFastestRow = fastestRows.find((row) => row.textContent?.includes('Team Rocket'));
    expect(teamFastestRow).toBeTruthy();
    expect(Array.from(teamFastestRow!.querySelectorAll('td')).map((cell) => cell.textContent)).toEqual([
      'Team Rocket',
      'Category A',
      '00:01:03.000',
      '2',
      '4',
    ]);

    const categorySelect = container.querySelector('select[aria-label="Race View Category"]') as HTMLSelectElement;
    expect(container.querySelector('select[aria-label="Race View Event Session"]')).toBeTruthy();
    const reportSelect = container.querySelector('select[aria-label="Reports View Type"]') as HTMLSelectElement;

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
      '00:01:04.000',
      tableTimeString(lapsByParticipant.get(createEventParticipantId('p-team-2'))![0].time),
      '00:01:04.000',
    ]);

    const lapTimesModeSelect = container.querySelector('.lap-times-report__toolbar select') as HTMLSelectElement;
    expect(lapTimesModeSelect).toBeTruthy();

    await act(async () => {
      setSelectValue(lapTimesModeSelect, 'table');
    });

    expect(container.querySelector('table.lap-times-block-table')).toBeTruthy();
    expect(container.textContent).toContain('00:01:05.000');
    expect(container.textContent).toContain('00:01:07.000');

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
});


