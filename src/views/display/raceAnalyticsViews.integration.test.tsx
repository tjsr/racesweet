// @vitest-environment jsdom

import type { RaceStateLookup, Session } from '../../model/racestate.js';
import { ReportsPage, ResultsPage } from './raceAnalyticsViews.js';
import { type Root, createRoot } from 'react-dom/client';
import type { EventCatalogEntrant } from '../../app/eventCatalog.js';
import type { EventCategory } from '../../model/eventcategory.js';
import type { EventParticipant } from '../../model/eventparticipant.js';
import type { ParticipantPassingRecord } from '../../model/timerecord.js';
import React from 'react';
import { act } from 'react';

import { useUiConsoleGuards } from '../../testing/uiConsoleGuards.js';

const setSelectValue = (select: HTMLSelectElement, value: string): void => {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  descriptor?.set?.call(select, value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
};

const createLap = (
  id: string,
  participantId: string,
  entrantId: string,
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
  source: 'source-1',
  time: new Date(`2026-06-12T10:00:${String(lapNo).padStart(2, '0')}.000Z`),
});

const categories: Array<{ id: string; name: string }> = [
  { id: 'cat-a', name: 'Category A' },
  { id: 'cat-a-duplicate-id', name: 'Category A' },
  { id: 'cat-b', name: 'Category B' },
];

const participants: EventParticipant[] = [
  {
    categoryId: 'cat-a',
    currentResult: undefined,
    entrantId: 'team-1',
    firstname: 'Team',
    id: 'p-team-1',
    identifiers: [],
    lastRecordTime: null,
    resultDuration: null,
    surname: 'One',
  },
  {
    categoryId: 'cat-a',
    currentResult: undefined,
    entrantId: 'team-1',
    firstname: 'Team',
    id: 'p-team-2',
    identifiers: [],
    lastRecordTime: null,
    resultDuration: null,
    surname: 'Two',
  },
  {
    categoryId: 'cat-b',
    currentResult: undefined,
    entrantId: 'rider-1',
    firstname: 'Solo',
    id: 'p-rider-1',
    identifiers: [],
    lastRecordTime: null,
    resultDuration: null,
    surname: 'Rider',
  },
];

const catalogEntrants: EventCatalogEntrant[] = [
  {
    categoryIds: ['cat-a'],
    entrantType: 'team',
    eventId: 'event-1',
    id: 'team-1',
    memberParticipantIds: ['p-team-1', 'p-team-2'],
    name: 'Team Rocket',
    sessionIds: ['session-1'],
  },
  {
    categoryIds: ['cat-b'],
    entrantType: 'rider',
    eventId: 'event-1',
    id: 'rider-1',
    memberParticipantIds: ['p-rider-1'],
    name: 'Solo Rider',
    sessionIds: ['session-1'],
  },
];

const lapsByParticipant = new Map<string, ParticipantPassingRecord[]>([
  [
    'p-team-1',
    [
      createLap('team1-lap1', 'p-team-1', 'team-1', 1, 65000, 65000),
      createLap('team1-lap2', 'p-team-1', 'team-1', 2, 132000, 67000),
    ],
  ],
  [
    'p-team-2',
    [
      createLap('team2-lap1', 'p-team-2', 'team-1', 1, 64000, 64000),
      createLap('team2-lap2', 'p-team-2', 'team-1', 2, 130000, 66000),
    ],
  ],
  [
    'p-rider-1',
    [
      createLap('rider-lap1', 'p-rider-1', 'rider-1', 1, 70000, 70000),
      createLap('rider-lap2', 'p-rider-1', 'rider-1', 2, 145000, 75000),
    ],
  ],
]);

const categoryLookup = new Map<string, EventCategory>([
  ['cat-a', { id: 'cat-a', name: 'Category A' }],
  ['cat-b', { id: 'cat-b', name: 'Category B' }],
]);

const raceState = {
  categories: Array.from(categoryLookup.values()),
  countTransponderCrossings: () => 0,
  excludeCrossing: () => undefined,
  getCategoryById: (categoryId: string) => categoryLookup.get(categoryId),
  getEntrantIdForParticipant: (participantId: string) => participants.find((item) => item.id === participantId)?.entrantId,
  getParticipantById: (participantId: string) => participants.find((item) => item.id === participantId),
  getParticipantLaps: (participantId: string) => lapsByParticipant.get(participantId) || [],
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
          raceState={raceState}
          selectedCategoryId={undefined}
        />,
      );
    });

    expect(container.textContent).toContain('Team Rocket');
    expect(container.textContent).toContain('Solo Rider');
    expect(container.textContent).toContain('00:02:12.000');
    expect(container.textContent).toContain('00:02:25.000');
    expect(container.textContent).toContain('00:01:04.000');
    expect(container.textContent).toContain('00:01:10.000');

    const categorySelect = container.querySelector('select[aria-label="Race View Category"]') as HTMLSelectElement;
    expect(categorySelect).toBeTruthy();

    const categoryOptions = Array.from(categorySelect.querySelectorAll('option')).map((option) => option.textContent);
    expect(categoryOptions.filter((text) => text === 'Category A')).toHaveLength(1);

    await act(async () => {
      setSelectValue(categorySelect, 'cat-a');
    });

    expect(container.textContent).toContain('Team Rocket');
    expect(container.textContent).not.toContain('Solo Rider');

    await act(async () => {
      setSelectValue(categorySelect, 'cat-b');
    });

    expect(container.textContent).not.toContain('Team Rocket');
    expect(container.textContent).toContain('Solo Rider');

    const viewSelect = container.querySelector('select[aria-label="Results View Type"]') as HTMLSelectElement;
    await act(async () => {
      setSelectValue(categorySelect, 'cat-a');
      setSelectValue(viewSelect, 'lap-chart');
    });

    expect(container.querySelector('table[aria-label="Results Lap Chart Table"]')).toBeTruthy();
    const lapEntryButton = container.querySelector('button.lap-entry-button') as HTMLButtonElement;
    expect(lapEntryButton).toBeTruthy();

    await act(async () => {
      lapEntryButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[aria-label="Lap Entry Details"]')).toBeTruthy();
    expect(container.textContent).toContain('Entrant: Team Rocket (team-1)');
  });

  it('reports fastest laps and participant lap times correctly for team and individual entrants', async () => {
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

    expect(container.querySelector('table[aria-label="Fastest Laps Report Table"]')).toBeTruthy();
    expect(container.textContent).toContain('Team Rocket');
    expect(container.textContent).toContain('Solo Rider');
    expect(container.textContent).toContain('00:01:04.000');
    expect(container.textContent).toContain('00:01:10.000');

    const categorySelect = container.querySelector('select[aria-label="Race View Category"]') as HTMLSelectElement;
    const reportSelect = container.querySelector('select[aria-label="Reports View Type"]') as HTMLSelectElement;

    await act(async () => {
      setSelectValue(categorySelect, 'cat-a');
    });

    expect(container.textContent).toContain('Team Rocket');
    expect(container.textContent).not.toContain('Solo Rider');

    await act(async () => {
      setSelectValue(reportSelect, 'lap-times');
    });

    expect(container.textContent).toContain('Lap Times Report');
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
      setSelectValue(categorySelectAfterViewChange, 'cat-b');
    });

    expect(container.textContent).toContain('Solo Rider');
    expect(container.textContent).not.toContain('Team Rocket');

    await act(async () => {
      setSelectValue(reportSelect, 'lap-chart');
    });

    expect(container.querySelector('table[aria-label="Reports Lap Chart Table"]')).toBeTruthy();
  });
});
