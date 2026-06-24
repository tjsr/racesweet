// @vitest-environment jsdom

import { type ParticipantPassingRecord, RECORD_TX_CROSSING } from '../../model/timerecord.js';
import { type Root, createRoot } from 'react-dom/client';
import type { EventCategory } from '../../model/eventcategory.js';
import type { EventParticipant } from '../../model/eventparticipant.js';
import type { EventTeam } from '../../model/eventteam.js';
import type { FlagRecord } from '../../model/flag.js';
import type { RaceStateLookup } from '../../model/racestate.js';
import React from 'react';
import { RecentRecords } from './recent.js';
import { act } from 'react';
import { selectedCategoriesForParticipants } from '../../app/selectionState.js';
import { updateCategorySelectionsForChangedParticipant } from '../../app/categoryChangeState.js';
import { useUiConsoleGuards } from '../../testing/uiConsoleGuards.js';

const ensureMatchMedia = (): void => {
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockImplementation((query: string) => {
        return {
          addEventListener: vi.fn(),
          addListener: vi.fn(),
          dispatchEvent: vi.fn(),
          matches: false,
          media: query,
          onchange: null,
          removeEventListener: vi.fn(),
          removeListener: vi.fn(),
        };
      }),
      writable: true,
    });
  }
};

const getDisplayedRecordIds = (container: HTMLElement): Array<string | null> => {
  return Array.from(container.querySelectorAll('tr[data-record-id]')).map((row) => row.getAttribute('data-record-id'));
};

const getRecentRecordsFilterSelect = (): Element | undefined => {
  return Array.from(document.querySelectorAll('[role="combobox"]')).find((element) => {
    return element.textContent?.includes('All records') ||
      element.textContent?.includes('Only selected category') ||
      element.textContent?.includes('Only selected team') ||
      element.textContent?.includes('Only selected rider');
  });
};

const selectRecentRecordsFilter = async (filterLabel: string): Promise<void> => {
  const filterSelect = getRecentRecordsFilterSelect();
  expect(filterSelect).toBeDefined();

  await act(async () => {
    filterSelect!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });

  const option = Array.from(document.querySelectorAll('li[role="option"]')).find((element) => {
    return element.textContent?.trim() === filterLabel;
  });
  expect(option).toBeDefined();

  await act(async () => {
    option!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

describe('RecentRecords integration', () => {
  let container: HTMLDivElement;
  let originalMatchMedia: typeof window.matchMedia | undefined;
  let root: Root;

  useUiConsoleGuards();

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    ensureMatchMedia();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia;
    } else {
      delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    }
  });

  it('selects rider/category on row click and emits changed category from context menu', async () => {
    const categoryA: EventCategory = { id: '1', name: 'Category A' };
    const categoryB: EventCategory = { id: '2', name: 'Category B' };

    const participant: EventParticipant = {
      categoryId: categoryA.id,
      currentResult: undefined,
      entrantId: '101',
      firstname: 'Pat',
      id: '101',
      identifiers: [
        { fromTime: undefined, racePlate: '101', toTime: undefined },
        { fromTime: undefined, toTime: undefined, txNo: 100101 },
      ] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Rider',
    };

    const crossing: ParticipantPassingRecord = {
      chipCode: 100101,
      id: '2001',
      isValid: true,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 1,
      source: 'test-source',
      time: new Date('2026-05-29T10:06:00.000Z'),
    } as ParticipantPassingRecord;

    const categories = [categoryA, categoryB];
    const participants = new Map([[participant.id, participant]]);

    const raceStateLookup: RaceStateLookup & { categories: EventCategory[] } = {
      categories,
      countTransponderCrossings: () => 1,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categories.find((category) => category.id === categoryId),
      getEntrantIdForParticipant: (participantId) => participants.get(participantId)?.entrantId,
      getParticipantById: (participantId) => participants.get(participantId),
      getParticipantLaps: () => [crossing],
      getTransponderCrossings: () => [],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    const categorySelected = vi.fn();
    const onChangeCategory = vi.fn();
    const participantSelected = vi.fn();

    await act(async () => {
      root.render(
        <RecentRecords
          categorySelected={categorySelected}
          onChangeCategory={onChangeCategory}
          participantSelected={participantSelected}
          raceStateLookup={raceStateLookup}
          records={[crossing]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
        />
      );
    });

    const row = container.querySelector('tr[data-record-id="2001"]');
    expect(row).not.toBeNull();

    await act(async () => {
      row!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(participantSelected).toHaveBeenCalledTimes(1);
    expect(categorySelected).toHaveBeenCalledTimes(1);

    const participantSelection = participantSelected.mock.calls[0][0] as Set<string>;
    const categorySelection = categorySelected.mock.calls[0][0] as Set<string>;
    expect(participantSelection.has(participant.id)).toBe(true);
    expect(categorySelection.has(categoryA.id)).toBe(true);

    await act(async () => {
      row!.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 60,
        clientY: 80,
      }));
    });

    const menuItem = Array.from(document.querySelectorAll('li[role="menuitem"]')).find((item) => {
      return item.textContent?.trim() === 'Category B';
    });
    expect(menuItem).toBeDefined();

    await act(async () => {
      menuItem!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onChangeCategory).toHaveBeenCalledTimes(1);
    expect(onChangeCategory).toHaveBeenCalledWith(participant.id, categoryB.id);
  });

  it('deselects participant and category when clicking the already-selected row', async () => {
    const categoryA: EventCategory = { id: '1', name: 'Category A' };

    const participant: EventParticipant = {
      categoryId: categoryA.id,
      currentResult: undefined,
      entrantId: '101',
      firstname: 'Pat',
      id: '101',
      identifiers: [
        { fromTime: undefined, racePlate: '101', toTime: undefined },
      ] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Rider',
    };

    const crossing: ParticipantPassingRecord = {
      chipCode: 100101,
      id: '2001',
      isValid: true,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 1,
      source: 'test-source',
      time: new Date('2026-05-29T10:06:00.000Z'),
    } as ParticipantPassingRecord;

    const categories = [categoryA];
    const participants = new Map([[participant.id, participant]]);

    const raceStateLookup: RaceStateLookup & { categories: EventCategory[] } = {
      categories,
      countTransponderCrossings: () => 1,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categories.find((category) => category.id === categoryId),
      getEntrantIdForParticipant: (participantId) => participants.get(participantId)?.entrantId,
      getParticipantById: (participantId) => participants.get(participantId),
      getParticipantLaps: () => [crossing],
      getTransponderCrossings: () => [],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    const categorySelected = vi.fn();
    const participantSelected = vi.fn();

    await act(async () => {
      root.render(
        <RecentRecords
          categorySelected={categorySelected}
          participantSelected={participantSelected}
          raceStateLookup={raceStateLookup}
          records={[crossing]}
          selectedCategories={new Set([categoryA.id])}
          selectedParticipants={new Set([participant.id])}
        />
      );
    });

    const row = container.querySelector('tr[data-record-id="2001"]');
    expect(row).not.toBeNull();

    await act(async () => {
      row!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(participantSelected).toHaveBeenCalledTimes(1);
    expect(categorySelected).toHaveBeenCalledTimes(1);

    const participantSelection = participantSelected.mock.calls[0][0] as Set<string>;
    const categorySelection = categorySelected.mock.calls[0][0] as Set<string>;
    expect(participantSelection.size).toBe(0);
    expect(categorySelection.size).toBe(0);
  });

  it('shows crossing times in the selected event time zone and emits display mode changes', async () => {
    const categoryA: EventCategory = { id: '1', name: 'Category A' };
    const participant: EventParticipant = {
      categoryId: categoryA.id,
      currentResult: undefined,
      entrantId: '101',
      firstname: 'Pat',
      id: '101',
      identifiers: [{ fromTime: undefined, racePlate: '101', toTime: undefined }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Rider',
    };
    const crossing: ParticipantPassingRecord = {
      chipCode: 100101,
      id: '2001',
      isValid: true,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 1,
      source: 'test-source',
      time: new Date('2026-06-07T00:15:30.250Z'),
    } as ParticipantPassingRecord;
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[] } = {
      categories: [categoryA],
      countTransponderCrossings: () => 1,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categoryId === categoryA.id ? categoryA : undefined,
      getEntrantIdForParticipant: () => participant.entrantId,
      getParticipantById: () => participant,
      getParticipantLaps: () => [crossing],
      getTransponderCrossings: () => [],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };
    const onTimeDisplayZoneModeChange = vi.fn();

    await act(async () => {
      root.render(
        <RecentRecords
          eventTimeZone="Australia/Sydney"
          onTimeDisplayZoneModeChange={onTimeDisplayZoneModeChange}
          raceStateLookup={raceStateLookup}
          records={[crossing]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
          timeDisplayZoneMode="event"
        />
      );
    });

    expect(container.textContent).toContain('Show times in');
    expect(container.querySelector('tr[data-record-id="2001"]')?.textContent).toContain('10:15:30.250');

    const timeZoneSelect = Array.from(container.querySelectorAll('[role="combobox"]')).find((element) => {
      return element.textContent?.includes('Event time-zone');
    });
    expect(timeZoneSelect).toBeDefined();

    await act(async () => {
      timeZoneSelect!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    const gmtOption = Array.from(document.querySelectorAll('li[role="option"]')).find((element) => {
      return element.textContent?.trim() === 'GMT';
    });
    expect(gmtOption).toBeDefined();

    await act(async () => {
      gmtOption!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onTimeDisplayZoneModeChange).toHaveBeenCalledWith('gmt');

    await act(async () => {
      root.render(
        <RecentRecords
          eventTimeZone="Australia/Sydney"
          onTimeDisplayZoneModeChange={onTimeDisplayZoneModeChange}
          raceStateLookup={raceStateLookup}
          records={[crossing]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
          timeDisplayZoneMode="gmt"
        />
      );
    });

    expect(container.querySelector('tr[data-record-id="2001"]')?.textContent).toContain('00:15:30.250');
  });

  it('shows the team name only for crossings by a member of a team', async () => {
    const categoryA: EventCategory = { id: '1', name: 'Category A' };
    const teamMember: EventParticipant = {
      categoryId: categoryA.id,
      currentResult: undefined,
      entrantId: 'team-1',
      firstname: 'Pat',
      id: '101',
      identifiers: [{ fromTime: undefined, racePlate: '101', toTime: undefined }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'RIDER',
    };
    const individualEntrant: EventParticipant = {
      categoryId: categoryA.id,
      currentResult: undefined,
      entrantId: '102',
      firstname: 'Quinn',
      id: '102',
      identifiers: [{ fromTime: undefined, racePlate: '102', toTime: undefined }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'SOLO',
    };
    const team: EventTeam = {
      categoryId: categoryA.id,
      description: '',
      id: 'team-1',
      members: [teamMember.id],
      name: 'Rocket Squad',
    };
    const teamCrossing: ParticipantPassingRecord = {
      chipCode: 100101,
      id: '2001',
      isValid: true,
      participantId: teamMember.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 1,
      source: 'test-source',
      time: new Date('2026-05-29T10:06:00.000Z'),
    } as ParticipantPassingRecord;
    const individualCrossing: ParticipantPassingRecord = {
      chipCode: 100102,
      id: '2002',
      isValid: true,
      participantId: individualEntrant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 2,
      source: 'test-source',
      time: new Date('2026-05-29T10:07:00.000Z'),
    } as ParticipantPassingRecord;
    const participants = new Map([
      [teamMember.id, teamMember],
      [individualEntrant.id, individualEntrant],
    ]);
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[], teams: EventTeam[] } = {
      categories: [categoryA],
      countTransponderCrossings: () => 1,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categoryId === categoryA.id ? categoryA : undefined,
      getEntrantIdForParticipant: (participantId) => participants.get(participantId)?.entrantId,
      getParticipantById: (participantId) => participants.get(participantId),
      getParticipantLaps: (participantId) => participantId === teamMember.id ? [teamCrossing] : [individualCrossing],
      getTransponderCrossings: () => [],
      teams: [team],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    await act(async () => {
      root.render(
        <RecentRecords
          raceStateLookup={raceStateLookup}
          records={[teamCrossing, individualCrossing]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
        />
      );
    });

    expect(container.querySelector('tr[data-record-id="2001"]')?.textContent).toContain('Pat RIDER (Rocket Squad)');
    expect(container.querySelector('tr[data-record-id="2002"]')?.textContent).toContain('Quinn SOLO');
    expect(container.querySelector('tr[data-record-id="2002"]')?.textContent).not.toContain('(Rocket Squad)');
  });

  it('filters records by selected category, rider, and team then restores all records', async () => {
    const categoryA: EventCategory = { id: '1', name: 'Category A' };
    const categoryB: EventCategory = { id: '2', name: 'Category B' };
    const categoryC: EventCategory = { id: '3', name: 'Category C' };
    const teamMemberOne: EventParticipant = {
      categoryId: categoryA.id,
      currentResult: undefined,
      entrantId: 'team-1',
      firstname: 'Pat',
      id: '101',
      identifiers: [{ fromTime: undefined, racePlate: '101', toTime: undefined }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'RIDER',
    };
    const teamMemberTwo: EventParticipant = {
      categoryId: categoryA.id,
      currentResult: undefined,
      entrantId: 'team-1',
      firstname: 'Quinn',
      id: '102',
      identifiers: [{ fromTime: undefined, racePlate: '102', toTime: undefined }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'RIDER',
    };
    const soloRider: EventParticipant = {
      categoryId: categoryB.id,
      currentResult: undefined,
      entrantId: '103',
      firstname: 'Sam',
      id: '103',
      identifiers: [{ fromTime: undefined, racePlate: '103', toTime: undefined }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'SOLO',
    };
    const otherTeamRider: EventParticipant = {
      categoryId: categoryC.id,
      currentResult: undefined,
      entrantId: 'team-2',
      firstname: 'Taylor',
      id: '104',
      identifiers: [{ fromTime: undefined, racePlate: '104', toTime: undefined }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'OTHER',
    };
    const team: EventTeam = {
      categoryId: categoryA.id,
      description: '',
      id: 'team-1',
      members: [teamMemberOne.id, teamMemberTwo.id],
      name: 'Rocket Squad',
    };
    const crossings: ParticipantPassingRecord[] = [teamMemberOne, teamMemberTwo, soloRider, otherTeamRider].map((participant, index) => ({
      chipCode: 100100 + index,
      id: `200${index + 1}`,
      isValid: true,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: index + 1,
      source: 'test-source',
      time: new Date(`2026-05-29T10:0${index + 1}:00.000Z`),
    }) as ParticipantPassingRecord);
    const participants = new Map<EventParticipant['id'], EventParticipant>([
      [teamMemberOne.id, teamMemberOne],
      [teamMemberTwo.id, teamMemberTwo],
      [soloRider.id, soloRider],
      [otherTeamRider.id, otherTeamRider],
    ]);
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[], teams: EventTeam[] } = {
      categories: [categoryA, categoryB, categoryC],
      countTransponderCrossings: () => 1,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => [categoryA, categoryB, categoryC].find((category) => category.id === categoryId),
      getEntrantIdForParticipant: (participantId) => participants.get(participantId)?.entrantId,
      getParticipantById: (participantId) => participants.get(participantId),
      getParticipantLaps: (participantId) => crossings.filter((crossing) => crossing.participantId === participantId),
      getTransponderCrossings: () => [],
      teams: [team],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    await act(async () => {
      root.render(
        <RecentRecords
          raceStateLookup={raceStateLookup}
          records={crossings}
          selectedCategories={new Set([categoryA.id])}
          selectedParticipants={new Set([teamMemberOne.id])}
        />
      );
    });

    const allRecordIds = ['2001', '2002', '2003', '2004'];
    expect(getDisplayedRecordIds(container)).toEqual(allRecordIds);

    await selectRecentRecordsFilter('Only selected category');
    expect(getDisplayedRecordIds(container)).toEqual(['2001', '2002']);

    await selectRecentRecordsFilter('All records');
    expect(getDisplayedRecordIds(container)).toEqual(allRecordIds);

    await selectRecentRecordsFilter('Only selected rider');
    expect(getDisplayedRecordIds(container)).toEqual(['2001']);

    await selectRecentRecordsFilter('All records');
    expect(getDisplayedRecordIds(container)).toEqual(allRecordIds);

    await selectRecentRecordsFilter('Only selected team');
    expect(getDisplayedRecordIds(container)).toEqual(['2001', '2002']);

    await selectRecentRecordsFilter('All records');
    expect(getDisplayedRecordIds(container)).toEqual(allRecordIds);
  });

  it('returns to all records when the active show-only selection is deselected', async () => {
    const categoryA: EventCategory = { id: '1', name: 'Category A' };
    const categoryB: EventCategory = { id: '2', name: 'Category B' };
    const teamMemberOne: EventParticipant = {
      categoryId: categoryA.id,
      currentResult: undefined,
      entrantId: 'team-1',
      firstname: 'Pat',
      id: '101',
      identifiers: [{ fromTime: undefined, racePlate: '101', toTime: undefined }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'RIDER',
    };
    const teamMemberTwo: EventParticipant = {
      categoryId: categoryA.id,
      currentResult: undefined,
      entrantId: 'team-1',
      firstname: 'Quinn',
      id: '102',
      identifiers: [{ fromTime: undefined, racePlate: '102', toTime: undefined }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'RIDER',
    };
    const soloRider: EventParticipant = {
      categoryId: categoryB.id,
      currentResult: undefined,
      entrantId: '103',
      firstname: 'Sam',
      id: '103',
      identifiers: [{ fromTime: undefined, racePlate: '103', toTime: undefined }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'SOLO',
    };
    const crossings: ParticipantPassingRecord[] = [teamMemberOne, teamMemberTwo, soloRider].map((participant, index) => ({
      chipCode: 100100 + index,
      id: `200${index + 1}`,
      isValid: true,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: index + 1,
      source: 'test-source',
      time: new Date(`2026-05-29T10:0${index + 1}:00.000Z`),
    }) as ParticipantPassingRecord);
    const participants = new Map<EventParticipant['id'], EventParticipant>([
      [teamMemberOne.id, teamMemberOne],
      [teamMemberTwo.id, teamMemberTwo],
      [soloRider.id, soloRider],
    ]);
    const team: EventTeam = {
      categoryId: categoryA.id,
      description: '',
      id: 'team-1',
      members: [teamMemberOne.id, teamMemberTwo.id],
      name: 'Rocket Squad',
    };
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[], teams: EventTeam[] } = {
      categories: [categoryA, categoryB],
      countTransponderCrossings: () => 1,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => [categoryA, categoryB].find((category) => category.id === categoryId),
      getEntrantIdForParticipant: (participantId) => participants.get(participantId)?.entrantId,
      getParticipantById: (participantId) => participants.get(participantId),
      getParticipantLaps: (participantId) => crossings.filter((crossing) => crossing.participantId === participantId),
      getTransponderCrossings: () => [],
      teams: [team],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };
    const allRecordIds = ['2001', '2002', '2003'];
    const filterCases = [
      { expectedRecordIds: ['2001', '2002'], label: 'Only selected category' },
      { expectedRecordIds: ['2001'], label: 'Only selected rider' },
      { expectedRecordIds: ['2001', '2002'], label: 'Only selected team' },
    ];

    const Harness = () => {
      const [selectedCategories, setSelectedCategories] = React.useState<Set<EventCategory['id']>>(new Set([categoryA.id]));
      const [selectedParticipants, setSelectedParticipants] = React.useState<Set<EventParticipant['id']>>(new Set([teamMemberOne.id]));

      const handleParticipantSelected = (participantIds: Set<EventParticipant['id']>) => {
        setSelectedParticipants(participantIds);
        setSelectedCategories(selectedCategoriesForParticipants(participantIds, raceStateLookup.getParticipantById));
      };

      return (
        <RecentRecords
          categorySelected={setSelectedCategories}
          participantSelected={handleParticipantSelected}
          raceStateLookup={raceStateLookup}
          records={crossings}
          selectedCategories={selectedCategories}
          selectedParticipants={selectedParticipants}
        />
      );
    };

    for (const filterCase of filterCases) {
      await act(async () => {
        root.render(<Harness key={filterCase.label} />);
      });

      expect(getDisplayedRecordIds(container)).toEqual(allRecordIds);

      await selectRecentRecordsFilter(filterCase.label);
      expect(getDisplayedRecordIds(container)).toEqual(filterCase.expectedRecordIds);

      const selectedRow = container.querySelector('tr[data-record-id="2001"]');
      expect(selectedRow).not.toBeNull();

      await act(async () => {
        selectedRow!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await act(async () => {
        await Promise.resolve();
      });

      expect(getRecentRecordsFilterSelect()?.textContent).toContain('All records');
      expect(getDisplayedRecordIds(container)).toEqual(allRecordIds);
    }
  });

  it('deselects by toggling: select then deselect same participant row', async () => {
    const categoryA: EventCategory = { id: '1', name: 'Category A' };

    const participant: EventParticipant = {
      categoryId: categoryA.id,
      currentResult: undefined,
      entrantId: '101',
      firstname: 'Pat',
      id: '101',
      identifiers: [
        { fromTime: undefined, racePlate: '101', toTime: undefined },
      ] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Rider',
    };

    const crossing: ParticipantPassingRecord = {
      chipCode: 100101,
      id: '2001',
      isValid: true,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 1,
      source: 'test-source',
      time: new Date('2026-05-29T10:06:00.000Z'),
    } as ParticipantPassingRecord;

    const categories = [categoryA];
    const participants = new Map([[participant.id, participant]]);

    const raceStateLookup: RaceStateLookup & { categories: EventCategory[] } = {
      categories,
      countTransponderCrossings: () => 1,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categories.find((category) => category.id === categoryId),
      getEntrantIdForParticipant: (participantId) => participants.get(participantId)?.entrantId,
      getParticipantById: (participantId) => participants.get(participantId),
      getParticipantLaps: () => [crossing],
      getTransponderCrossings: () => [],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    const Harness = () => {
      const [selectedCategories, setSelectedCategories] = React.useState<Set<EventCategory['id']>>(new Set());
      const [recordSelectedParticipants, setRecordSelectedParticipants] = React.useState<Set<EventParticipant['id']>>(new Set());

      const handleParticipantSelected = (participantIds: Set<EventParticipant['id']>) => {
        const participantCategories = selectedCategoriesForParticipants(participantIds, raceStateLookup.getParticipantById);
        setRecordSelectedParticipants(participantIds);
        setSelectedCategories(participantCategories);
      };

      return (
        <>
          <RecentRecords
            categorySelected={setSelectedCategories}
            participantSelected={handleParticipantSelected}
            raceStateLookup={raceStateLookup}
            records={[crossing]}
            selectedCategories={selectedCategories}
            selectedParticipants={recordSelectedParticipants}
          />
          <pre data-selection-state>{JSON.stringify({
            recordSelectedParticipants: [...recordSelectedParticipants].sort(),
            selectedCategories: [...selectedCategories].sort(),
          })}</pre>
        </>
      );
    };

    await act(async () => {
      root.render(<Harness />);
    });

    const row = container.querySelector('tr[data-record-id="2001"]');
    expect(row).not.toBeNull();

    await act(async () => {
      row!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    let state = JSON.parse(container.querySelector('[data-selection-state]')!.textContent || '{}');
    expect(state.recordSelectedParticipants).toEqual([participant.id]);
    expect(state.selectedCategories).toEqual([categoryA.id]);
    expect(row!.className).toContain('selected-participant');
    expect(row!.className).toContain('selected-category');

    await act(async () => {
      row!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    state = JSON.parse(container.querySelector('[data-selection-state]')!.textContent || '{}');
    expect(state.recordSelectedParticipants).toEqual([]);
    expect(state.selectedCategories).toEqual([]);
    expect(row!.className).not.toContain('selected-participant');
    expect(row!.className).not.toContain('selected-category');
  });

  it('replaces the previous row highlight when the user clicks another row after a category change', async () => {
    const categoryA: EventCategory = { id: '1', name: 'Category A' };
    const categoryB: EventCategory = { id: '2', name: 'Category B' };

    const participant1: EventParticipant = {
      categoryId: categoryA.id,
      currentResult: undefined,
      entrantId: 'team-a',
      firstname: 'Pat',
      id: '101',
      identifiers: [{ fromTime: undefined, racePlate: '101', toTime: undefined }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'One',
    };

    const participant2: EventParticipant = {
      categoryId: categoryA.id,
      currentResult: undefined,
      entrantId: 'team-b',
      firstname: 'Quinn',
      id: '102',
      identifiers: [{ fromTime: undefined, racePlate: '102', toTime: undefined }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Two',
    };

    const crossing1: ParticipantPassingRecord = {
      chipCode: 100101,
      id: '2001',
      isValid: true,
      participantId: participant1.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 1,
      source: 'test-source',
      time: new Date('2026-05-29T10:06:00.000Z'),
    } as ParticipantPassingRecord;

    const crossing2: ParticipantPassingRecord = {
      chipCode: 100102,
      id: '2002',
      isValid: true,
      participantId: participant2.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 2,
      source: 'test-source',
      time: new Date('2026-05-29T10:07:00.000Z'),
    } as ParticipantPassingRecord;

    const categories = [categoryA, categoryB];
    const participants = new Map<EventParticipant['id'], EventParticipant>([
      [participant1.id, participant1],
      [participant2.id, participant2],
    ]);

    const raceStateLookup: RaceStateLookup & { categories: EventCategory[] } = {
      categories,
      countTransponderCrossings: () => 1,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categories.find((category) => category.id === categoryId),
      getEntrantIdForParticipant: (participantId) => participants.get(participantId)?.entrantId,
      getParticipantById: (participantId) => participants.get(participantId),
      getParticipantLaps: () => [crossing1, crossing2],
      getTransponderCrossings: () => [],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    const Harness = () => {
      const [selectedCategories, setSelectedCategories] = React.useState<Set<EventCategory['id']>>(new Set());
      const [recordSelectedCategories, setRecordSelectedCategories] = React.useState<Set<EventCategory['id']>>(new Set());
      const [recordSelectedParticipants, setRecordSelectedParticipants] = React.useState<Set<EventParticipant['id']>>(new Set());

      const handleParticipantSelected = (participantIds: Set<EventParticipant['id']>) => {
        const participantCategories = selectedCategoriesForParticipants(participantIds, raceStateLookup.getParticipantById);
        setRecordSelectedParticipants(participantIds);
        setSelectedCategories(participantCategories);
        setRecordSelectedCategories(participantCategories);
      };

      const handleChangeCategory = (participantId: string, categoryId: EventCategory['id']) => {
        const updatedSelections = updateCategorySelectionsForChangedParticipant(
          {
            categoryId,
            participantId,
            recordSelectedCategories,
            recordSelectedParticipants,
            selectedCategories,
          },
          false
        );

        setSelectedCategories(updatedSelections.selectedCategories);
        setRecordSelectedCategories(updatedSelections.recordSelectedCategories);
        setRecordSelectedParticipants(updatedSelections.recordSelectedParticipants);
      };

      const hilightCategories = new Set<EventCategory['id']>([...selectedCategories, ...recordSelectedCategories]);

      return (
        <>
          <RecentRecords
            categorySelected={setRecordSelectedCategories}
            onChangeCategory={handleChangeCategory}
            participantSelected={handleParticipantSelected}
            raceStateLookup={raceStateLookup}
            records={[crossing1, crossing2]}
            selectedCategories={hilightCategories}
            selectedParticipants={recordSelectedParticipants}
          />
          <pre data-selection-state>{JSON.stringify({
            recordSelectedCategories: [...recordSelectedCategories].sort(),
            recordSelectedParticipants: [...recordSelectedParticipants].sort(),
            selectedCategories: [...selectedCategories].sort(),
          })}</pre>
        </>
      );
    };

    await act(async () => {
      root.render(<Harness />);
    });

    const firstRow = container.querySelector('tr[data-record-id="2001"]');
    const secondRow = container.querySelector('tr[data-record-id="2002"]');
    expect(firstRow).not.toBeNull();
    expect(secondRow).not.toBeNull();

    await act(async () => {
      firstRow!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(firstRow!.className).toContain('selected-participant');
    expect(firstRow!.className).toContain('selected-category');

    await act(async () => {
      firstRow!.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 60,
        clientY: 80,
      }));
    });

    const changeToCategoryB = Array.from(document.querySelectorAll('li[role="menuitem"]')).find((item) => {
      return item.textContent?.trim() === 'Category B';
    });
    expect(changeToCategoryB).toBeDefined();

    await act(async () => {
      changeToCategoryB!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      secondRow!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      await Promise.resolve();
    });

    const updatedState = container.querySelector('[data-selection-state]');
    expect(updatedState).not.toBeNull();
    expect(JSON.parse(updatedState!.textContent || '{}')).toEqual({
      recordSelectedCategories: ['1'],
      recordSelectedParticipants: ['102'],
      selectedCategories: ['1'],
    });
  });

  it('renders chequered flags inline in time order with crossing records', async () => {
    const categoryA: EventCategory = { id: '1', name: 'Category A' };

    const participant: EventParticipant = {
      categoryId: categoryA.id,
      currentResult: undefined,
      entrantId: '101',
      firstname: 'Pat',
      id: '101',
      identifiers: [{ fromTime: undefined, racePlate: '101', toTime: undefined }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Rider',
    };

    const crossing1: ParticipantPassingRecord = {
      chipCode: 100101,
      id: '2001',
      isValid: true,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 1,
      source: 'test-source',
      time: new Date('2026-05-29T10:06:00.000Z'),
    } as ParticipantPassingRecord;

    const chequeredFlag: FlagRecord = {
      categoryIds: [categoryA.id],
      flagType: 'chequered',
      flagValue: 'course',
      id: 'flag-1',
      recordType: 4,
      sequence: 2,
      source: 'test-source',
      time: new Date('2026-05-29T10:06:30.000Z'),
    };

    const crossing2: ParticipantPassingRecord = {
      chipCode: 100101,
      id: '2002',
      isValid: true,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 3,
      source: 'test-source',
      time: new Date('2026-05-29T10:07:00.000Z'),
    } as ParticipantPassingRecord;

    const categories = [categoryA];
    const participants = new Map([[participant.id, participant]]);

    const raceStateLookup: RaceStateLookup & { categories: EventCategory[] } = {
      categories,
      countTransponderCrossings: () => 2,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categories.find((category) => category.id === categoryId),
      getEntrantIdForParticipant: (participantId) => participants.get(participantId)?.entrantId,
      getParticipantById: (participantId) => participants.get(participantId),
      getParticipantLaps: () => [crossing1, crossing2],
      getTransponderCrossings: () => [],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    await act(async () => {
      root.render(
        <RecentRecords
          raceStateLookup={raceStateLookup}
          records={[crossing1, chequeredFlag as unknown as ParticipantPassingRecord, crossing2]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
        />
      );
    });

    const orderedRowIds = Array.from(container.querySelectorAll('tr[data-record-id]')).map((row) => row.getAttribute('data-record-id'));
    expect(orderedRowIds).toEqual(['2001', 'flag-1', '2002']);

    const flagRow = container.querySelector('tr[data-record-id="flag-1"]');
    expect(flagRow?.textContent).toContain('Chequered flag');
  });
});
