// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EventCategory } from '../../model/eventcategory.js';
import type { EventParticipant } from '../../model/eventparticipant.js';
import type { FlagRecord } from '../../model/flag.js';
import type { RaceStateLookup } from '../../model/racestate.js';
import { RECORD_TX_CROSSING, type ParticipantPassingRecord } from '../../model/timerecord.js';
import { updateCategorySelectionsForChangedParticipant } from '../../app/categoryChangeState.js';
import { selectedCategoriesForParticipants } from '../../app/selectionState.js';
import { useUiConsoleGuards } from '../../testing/uiConsoleGuards.js';
import { RecentRecords } from './recent.js';

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

describe('RecentRecords integration', () => {
  let container: HTMLDivElement;
  let root: Root;

  useUiConsoleGuards();

  beforeEach(() => {
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