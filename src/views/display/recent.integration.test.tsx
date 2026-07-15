// @vitest-environment jsdom

import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { updateCategorySelectionsForChangedParticipant } from '../../app/categoryChangeState.js';
import { selectedCategoriesForParticipants } from '../../app/selectionState.js';
import { createGreenFlagEvent } from '../../controllers/flag.js';
import type { EventCategory } from '../../model/eventcategory.js';
import type { EventParticipant, EventParticipantId } from '../../model/eventparticipant.js';
import type { EventTeam } from '../../model/eventteam.js';
import type { FlagRecord } from '../../model/flag.js';
import { createCategoryId, createEventEntrantId, createEventParticipantId, createTimeRecordId, createTimeRecordSourceId } from '../../model/ids.js';
import type { EventTimeRecord } from '../../model/index.js';
import { type RaceStateLookup, Session } from '../../model/racestate.js';
import { type ParticipantPassingRecord, RECORD_TX_CROSSING, TimeRecordId } from '../../model/timerecord.js';
import { loadMrScatsCatalogFromLocation } from '../../parsers/mrScats/catalogImport.js';
import { type AdministrativeChanges, type RaceAdminPersistence, createDefaultAdministrativeChanges } from '../../persistence/raceAdminPersistence.js';
import { RaceAdminService } from '../../service/raceAdminService.js';
import { applyPulledRaceStateToSession } from '../../service/sourceApplication.js';
import { useUiConsoleGuards } from '../../testing/uiConsoleGuards.js';
import { RecentRecords } from './recent.js';

interface DbfField {
  length: number;
  name: string;
  type: string;
}

class MemoryRaceAdminPersistence implements RaceAdminPersistence {
  private changes: AdministrativeChanges;

  public constructor(initial?: AdministrativeChanges) {
    this.changes = initial || createDefaultAdministrativeChanges();
  }

  public async load(): Promise<AdministrativeChanges> {
    return this.changes;
  }

  public async save(changes: AdministrativeChanges): Promise<void> {
    this.changes = changes;
  }

  public get snapshot(): AdministrativeChanges {
    return this.changes;
  }
}

const createDbfBuffer = (fields: DbfField[], rows: Record<string, string | number | undefined>[]): Buffer => {
  const headerLength = 32 + (fields.length * 32) + 1;
  const recordLength = 1 + fields.reduce((total, field) => total + field.length, 0);
  const buffer = Buffer.alloc(headerLength + (recordLength * rows.length), 0x20);
  buffer[0] = 3;
  buffer[1] = 97;
  buffer[2] = 6;
  buffer[3] = 28;
  buffer.writeUInt32LE(rows.length, 4);
  buffer.writeUInt16LE(headerLength, 8);
  buffer.writeUInt16LE(recordLength, 10);

  fields.forEach((field, index) => {
    const offset = 32 + (index * 32);
    buffer.write(field.name, offset, 'latin1');
    buffer.write(field.type, offset + 11, 'latin1');
    buffer[offset + 16] = field.length;
  });
  buffer[headerLength - 1] = 0x0d;

  rows.forEach((row, rowIndex) => {
    const recordOffset = headerLength + (rowIndex * recordLength);
    buffer[recordOffset] = 0x20;
    let fieldOffset = recordOffset + 1;
    fields.forEach((field) => {
      const rawValue = row[field.name] === undefined ? '' : String(row[field.name]);
      const value = field.type === 'N'
        ? rawValue.padStart(field.length, ' ')
        : rawValue.padEnd(field.length, ' ');
      buffer.write(value.slice(0, field.length), fieldOffset, 'latin1');
      fieldOffset += field.length;
    });
  });

  return buffer;
};

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
      element.textContent?.includes('Only flags') ||
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

const toggleIgnoreRecordsFilter = async (filterLabel: string): Promise<void> => {
  const ignoreSelect = document.querySelector('#recent-records-ignore-dropdown [role="combobox"]');
  expect(ignoreSelect).toBeDefined();

  await act(async () => {
    ignoreSelect!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });

  const option = Array.from(document.querySelectorAll('li[role="option"]')).find((element) => {
    return element.textContent?.includes(filterLabel);
  });
  expect(option).toBeDefined();

  await act(async () => {
    option!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const setInputValue = (input: HTMLInputElement | HTMLTextAreaElement, value: string): void => {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

const setSelectValue = (select: HTMLSelectElement, value: string): void => {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  descriptor?.set?.call(select, value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
};

const waitForNoDialog = async (): Promise<void> => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!document.querySelector('div[role="dialog"]')) {
      return;
    }

    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 25);
      });
    });
  }

  throw new Error('Timed out waiting for dialog to close');
};

const expectIgnoreRecordsFilterChecked = async (filterLabel: string): Promise<void> => {
  const ignoreSelect = document.querySelector('#recent-records-ignore-dropdown [role="combobox"]');
  expect(ignoreSelect).toBeDefined();
  expect(ignoreSelect!.textContent).toContain(filterLabel);

  let option = Array.from(document.querySelectorAll('li[role="option"]')).find((element) => {
    return element.textContent?.includes(filterLabel);
  });

  if (!option) {
    await act(async () => {
      ignoreSelect!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    option = Array.from(document.querySelectorAll('li[role="option"]')).find((element) => {
      return element.textContent?.includes(filterLabel);
    });
  }

  expect(option).toBeDefined();
  expect(option!.getAttribute('aria-selected')).toBe('true');
  expect((option!.querySelector('input[type="checkbox"]') as HTMLInputElement | null)?.checked).toBe(true);
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

  it('keeps the recent records heading and controls in one sticky toolbar', async () => {
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[] } = {
      categories: [],
      countTransponderCrossings: () => 0,
      excludeCrossing: () => undefined,
      getCategoryById: () => undefined,
      getEntrantIdForParticipant: () => undefined,
      getParticipantById: () => undefined,
      getParticipantLaps: () => [],
      getTransponderCrossings: () => [],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    await act(async () => {
      root.render(
        <RecentRecords
          raceStateLookup={raceStateLookup}
          records={[]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
        />
      );
    });

    const toolbar = container.querySelector('.recent-records-toolbar');
    expect(toolbar).toBeDefined();
    expect(toolbar?.querySelector('h2.recent-records')?.textContent).toBe('Recent Records');
    expect(toolbar?.querySelector('#recent-records-category-dropdown')).toBeDefined();
    expect(toolbar?.querySelector('#recent-records-type-dropdown')).toBeDefined();
    expect(toolbar?.querySelector('#recent-records-time-zone-dropdown')).toBeDefined();
    expect(toolbar?.querySelector('#recent-records-ignore-dropdown')).toBeDefined();
    expect(toolbar?.querySelector('#recent-records-order-dropdown')).toBeDefined();
  });

  it('marks lap time cells with fastest indicators and lap-leading rows', async () => {
    const category: EventCategory = { id: 'category-1', name: 'Category 1' };
    const participantA: EventParticipant = {
      categoryId: category.id,
      currentResult: undefined,
      entrantId: 'entrant-1',
      firstname: 'Pat',
      id: 'participant-1',
      identifiers: [{ fromTime: undefined, racePlate: '101', toTime: undefined }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Rider',
    };
    const participantB: EventParticipant = {
      categoryId: category.id,
      currentResult: undefined,
      entrantId: 'entrant-2',
      firstname: 'Quinn',
      id: 'participant-2',
      identifiers: [{ fromTime: undefined, racePlate: '102', toTime: undefined }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Rider',
    };
    const crossings = [
      {
        chipCode: 100101,
        id: 'participant-a-lap-1',
        isValid: true,
        lapNo: 1,
        lapTime: 100000,
        participantId: participantA.id,
        recordType: RECORD_TX_CROSSING,
        sequence: 1,
        source: 'test-source',
        time: new Date('2026-05-29T10:01:00.000Z'),
      },
      {
        chipCode: 100102,
        id: 'participant-b-lap-1',
        isValid: true,
        lapNo: 1,
        lapTime: 90000,
        participantId: participantB.id,
        recordType: RECORD_TX_CROSSING,
        sequence: 2,
        source: 'test-source',
        time: new Date('2026-05-29T10:01:05.000Z'),
      },
      {
        chipCode: 100101,
        id: 'participant-a-lap-2',
        isValid: true,
        lapNo: 2,
        lapTime: 95000,
        participantId: participantA.id,
        recordType: RECORD_TX_CROSSING,
        sequence: 3,
        source: 'test-source',
        time: new Date('2026-05-29T10:02:35.000Z'),
      },
      {
        chipCode: 100101,
        id: 'participant-a-lap-3',
        isValid: true,
        lapNo: 3,
        lapTime: 97000,
        participantId: participantA.id,
        recordType: RECORD_TX_CROSSING,
        sequence: 4,
        source: 'test-source',
        time: new Date('2026-05-29T10:04:12.000Z'),
      },
    ] as unknown as ParticipantPassingRecord[];
    const participants = new Map<EventParticipantId, EventParticipant>([
      [participantA.id, participantA],
      [participantB.id, participantB],
    ]);
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[] } = {
      categories: [category],
      countTransponderCrossings: () => 0,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categoryId === category.id ? category : undefined,
      getEntrantIdForParticipant: (participantId) => participants.get(participantId)?.entrantId,
      getParticipantById: (participantId) => participants.get(participantId),
      getParticipantLaps: () => crossings,
      getTransponderCrossings: () => [],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    await act(async () => {
      root.render(
        <RecentRecords
          fastestTimeIndicatorColors={{
            entrantFasterTime: '#aaaa00',
            entrantFastestTime: '#00aa00',
            sessionFastestTime: '#6600aa',
          }}
          raceStateLookup={raceStateLookup}
          records={crossings}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
        />
      );
    });

    const tableContainer = container.querySelector('.recent-records-table-container') as HTMLDivElement;
    expect(tableContainer.style.getPropertyValue('--session-fastest-time-color')).toBe('#6600aa');
    expect(tableContainer.style.getPropertyValue('--entrant-fastest-time-color')).toBe('#00aa00');
    expect(tableContainer.style.getPropertyValue('--entrant-faster-time-color')).toBe('#aaaa00');

    const firstLapLeader = container.querySelector('tr[data-record-id="participant-a-lap-1"]');
    const sessionFastestRow = container.querySelector('tr[data-record-id="participant-b-lap-1"]');
    const entrantImprovedRow = container.querySelector('tr[data-record-id="participant-a-lap-2"]');
    const laterLapLeaderRow = container.querySelector('tr[data-record-id="participant-a-lap-3"]');
    const getLapTimeCell = (row: Element | null): Element => row!.querySelectorAll('td')[9]!;

    expect(firstLapLeader?.className).toContain('lapLeader');
    expect(container.querySelector('tr[data-record-id="participant-a-lap-1"].lapLeader > td')).not.toBeNull();
    expect(getLapTimeCell(firstLapLeader).className).toContain('overallFastest');
    expect(sessionFastestRow?.className).not.toContain('lapLeader');
    expect(getLapTimeCell(sessionFastestRow).className).toContain('overallFastest');
    expect(entrantImprovedRow?.className).toContain('lapLeader');
    expect(getLapTimeCell(entrantImprovedRow).className).toContain('entrantFastest');
    expect(getLapTimeCell(entrantImprovedRow).className).toContain('entrantFaster');
    expect(laterLapLeaderRow?.className).toContain('lapLeader');
    expect(getLapTimeCell(laterLapLeaderRow).className).not.toContain('entrantFastest');
    expect(getLapTimeCell(laterLapLeaderRow).className).not.toContain('entrantFaster');

    await act(async () => {
      root.render(
        <RecentRecords
          fastestTimeIndicatorColors={{
            entrantFasterTime: '#aaaa00',
            entrantFastestTime: '#00aa00',
            sessionFastestTime: '#6600aa',
          }}
          raceStateLookup={raceStateLookup}
          records={crossings}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
          sessionKind="qualifying"
        />
      );
    });

    expect(container.querySelector('tr[data-record-id="participant-a-lap-1"]')?.className).toContain('lapLeader');
    expect(container.querySelector('tr[data-record-id="participant-b-lap-1"]')?.className).toContain('lapLeader');
    expect(container.querySelector('tr[data-record-id="participant-a-lap-2"]')?.className).not.toContain('lapLeader');
    expect(container.querySelector('tr[data-record-id="participant-a-lap-3"]')?.className).not.toContain('lapLeader');
  });

  it('selects categories from the recent records toolbar', async () => {
    const categoryA: EventCategory = { code: 'A', id: 'cat-a', name: 'Category A' };
    const categoryB: EventCategory = { code: 'B', id: 'cat-b', name: 'Category B' };
    const selectedCategorySets: string[][] = [];
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[] } = {
      categories: [categoryA, categoryB],
      countTransponderCrossings: () => 0,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => [categoryA, categoryB].find((category) => category.id === categoryId),
      getEntrantIdForParticipant: () => undefined,
      getParticipantById: () => undefined,
      getParticipantLaps: () => [],
      getTransponderCrossings: () => [],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    await act(async () => {
      root.render(
        <RecentRecords
          categorySelected={(categoryIds) => selectedCategorySets.push(Array.from(categoryIds).sort())}
          raceStateLookup={raceStateLookup}
          records={[]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
        />
      );
    });

    const categorySelect = container.querySelector('#recent-records-category-dropdown [role="combobox"]');
    expect(categorySelect).toBeDefined();
    expect(categorySelect?.textContent).toBe('All categories');

    await act(async () => {
      categorySelect!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    const categoryBOption = Array.from(document.querySelectorAll('li[role="option"]')).find((element) => {
      return element.textContent?.includes(categoryB.name);
    });
    expect(categoryBOption).toBeDefined();

    await act(async () => {
      categoryBOption!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(selectedCategorySets).toEqual([[categoryB.id]]);
  });

  it('docks the recent records toolbar when it scrolls past the viewport top', async () => {
    const category: EventCategory = { id: 'category-1', name: 'Category 1' };
    const participant: EventParticipant = {
      categoryId: category.id,
      currentResult: undefined,
      entrantId: 'entrant-1',
      firstname: 'Pat',
      id: 'participant-1',
      identifiers: [{ fromTime: undefined, racePlate: '101', toTime: undefined }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Rider',
    };
    const crossing: ParticipantPassingRecord = {
      chipCode: 100101,
      id: 'crossing-1',
      isValid: true,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 1,
      source: 'test-source',
      time: new Date('2026-05-29T10:06:00.000Z'),
    } as ParticipantPassingRecord;
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[] } = {
      categories: [category],
      countTransponderCrossings: () => 0,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categoryId === category.id ? category : undefined,
      getEntrantIdForParticipant: () => undefined,
      getParticipantById: (participantId) => participantId === participant.id ? participant : undefined,
      getParticipantLaps: () => [crossing],
      getTransponderCrossings: () => [],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    await act(async () => {
      root.render(
        <RecentRecords
          raceStateLookup={raceStateLookup}
          records={[crossing]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
        />
      );
    });

    const anchor = container.querySelector('.recent-records-toolbar-anchor') as HTMLDivElement;
    const toolbar = container.querySelector('.recent-records-toolbar') as HTMLDivElement;
    const tableContainer = container.querySelector('.recent-records-table-container') as HTMLDivElement;
    let anchorTop = 120;

    anchor.getBoundingClientRect = () => ({
      bottom: anchorTop + 52,
      height: 52,
      left: 84,
      right: 984,
      toJSON: () => undefined,
      top: anchorTop,
      width: 900,
      x: 84,
      y: anchorTop,
    });
    toolbar.getBoundingClientRect = () => ({
      bottom: anchorTop + 52,
      height: 52,
      left: 84,
      right: 984,
      toJSON: () => undefined,
      top: anchorTop,
      width: 900,
      x: 84,
      y: anchorTop,
    });

    await act(async () => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(toolbar.classList.contains('docked')).toBe(false);
    expect(tableContainer.style.getPropertyValue('--recent-records-table-header-top')).toBe('0px');

    anchorTop = -1;
    await act(async () => {
      window.dispatchEvent(new Event('scroll'));
    });

    expect(toolbar.classList.contains('docked')).toBe(true);
    expect(toolbar.style.left).toBe('84px');
    expect(toolbar.style.width).toBe('900px');
    expect(anchor.style.height).toBe('52px');
    expect(tableContainer.style.getPropertyValue('--recent-records-table-header-top')).toBe('52px');
    expect(container.querySelector('thead th')?.className).toContain('MuiTableCell-stickyHeader');

    anchorTop = 20;
    await act(async () => {
      window.dispatchEvent(new Event('scroll'));
    });

    expect(toolbar.classList.contains('docked')).toBe(false);
    expect(tableContainer.style.getPropertyValue('--recent-records-table-header-top')).toBe('0px');
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

  it('highlights the selected timing row without clearing category highlights', async () => {
    const categoryA: EventCategory = { id: '1', name: 'Category A' };
    const participant1: EventParticipant = {
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
    const participant2: EventParticipant = {
      categoryId: categoryA.id,
      currentResult: undefined,
      entrantId: '102',
      firstname: 'Quinn',
      id: '102',
      identifiers: [{ fromTime: undefined, racePlate: '102', toTime: undefined }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Rider',
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
    const categories = [categoryA];
    const participants = new Map<EventParticipant['id'], EventParticipant>([
      [participant1.id, participant1],
      [participant2.id, participant2],
    ]);
    const records = [crossing1, crossing2];
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[] } = {
      categories,
      countTransponderCrossings: () => 1,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categories.find((category) => category.id === categoryId),
      getEntrantIdForParticipant: (participantId) => participants.get(participantId)?.entrantId,
      getParticipantById: (participantId) => participants.get(participantId),
      getParticipantLaps: () => records,
      getTransponderCrossings: () => [],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    await act(async () => {
      root.render(
        <RecentRecords
          raceStateLookup={raceStateLookup}
          records={records}
          selectedCategories={new Set([categoryA.id])}
          selectedParticipants={new Set()}
        />
      );
    });

    const firstRow = container.querySelector('tr[data-record-id="2001"]');
    const secondRow = container.querySelector('tr[data-record-id="2002"]');
    expect(firstRow).not.toBeNull();
    expect(secondRow).not.toBeNull();
    expect(firstRow!.className).toContain('selected-category');
    expect(secondRow!.className).toContain('selected-category');

    await act(async () => {
      firstRow!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(firstRow!.className).toContain('selected-row');
    expect(firstRow!.className).toContain('selected-category');
    expect(secondRow!.className).not.toContain('selected-row');
    expect(secondRow!.className).toContain('selected-category');

    await act(async () => {
      secondRow!.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 60,
        clientY: 80,
      }));
    });

    expect(firstRow!.className).not.toContain('selected-row');
    expect(firstRow!.className).toContain('selected-category');
    expect(secondRow!.className).toContain('selected-row');
    expect(secondRow!.className).toContain('selected-category');
  });

  it('renders only the visible recent record rows as the table scrolls', async () => {
    const categoryA: EventCategory = { id: '1', name: 'Category A' };
    const baseTime = new Date('2026-05-29T10:00:00.000Z').getTime();
    const records: ParticipantPassingRecord[] = [];
    const participants = new Map<string, EventParticipant>();
    const lapsByParticipantId = new Map<string, ParticipantPassingRecord[]>();

    for (let index = 0; index < 160; index += 1) {
      const participantId = `${index + 1}`;
      const participant: EventParticipant = {
        categoryId: categoryA.id,
        currentResult: undefined,
        entrantId: participantId,
        firstname: `Rider ${index + 1}`,
        id: participantId,
        identifiers: [{ fromTime: undefined, racePlate: participantId, toTime: undefined }] as unknown as EventParticipant['identifiers'],
        lastRecordTime: null,
        resultDuration: null,
        surname: 'Test',
      };
      const crossing: ParticipantPassingRecord = {
        chipCode: 100000 + index,
        id: `${2000 + index}`,
        isValid: true,
        participantId,
        recordType: RECORD_TX_CROSSING,
        sequence: index + 1,
        source: 'test-source',
        time: new Date(baseTime + (index * 60000)),
      } as ParticipantPassingRecord;

      participants.set(participantId, participant);
      lapsByParticipantId.set(participantId, [crossing]);
      records.push(crossing);
    }

    const raceStateLookup: RaceStateLookup & { categories: EventCategory[] } = {
      categories: [categoryA],
      countTransponderCrossings: () => 1,
      excludeCrossing: () => undefined,
      getCategoryById: () => categoryA,
      getEntrantIdForParticipant: (participantId) => participants.get(participantId)?.entrantId,
      getParticipantById: (participantId) => participants.get(participantId),
      getParticipantLaps: (participantId) => lapsByParticipantId.get(participantId) || [],
      getTransponderCrossings: () => [],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    await act(async () => {
      root.render(
        <RecentRecords
          raceStateLookup={raceStateLookup}
          records={records}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
        />
      );
    });

    const tableContainer = container.querySelector('.recent-records-table-container') as HTMLDivElement;
    let tableTop = 0;
    const tableHeight = records.length * 36;
    tableContainer.getBoundingClientRect = (): DOMRect => ({
      bottom: tableTop + tableHeight,
      height: tableHeight,
      left: 0,
      right: 1200,
      toJSON: () => undefined,
      top: tableTop,
      width: 1200,
      x: 0,
      y: tableTop,
    });

    await act(async () => {
      window.dispatchEvent(new Event('resize'));
    });

    await act(async () => {
      root.render(
        <RecentRecords
          raceStateLookup={raceStateLookup}
          records={records}
          selectedCategories={new Set([categoryA.id])}
          selectedParticipants={new Set()}
        />
      );
    });

    const firstVisibleRow = container.querySelector(`tr[data-record-id="${records[0]!.id}"]`) as HTMLTableRowElement;
    const initialRenderedRows = container.querySelectorAll('tr[data-record-id]');

    expect(firstVisibleRow.className).toContain('selected-category');
    expect(initialRenderedRows.length).toBeLessThan(records.length);
    expect(container.querySelector(`tr[data-record-id="${records[150]!.id}"]`)).toBeNull();

    await act(async () => {
      tableTop = -(150 * 36);
      document.body.dispatchEvent(new Event('scroll'));
    });

    const scrolledRow = container.querySelector(`tr[data-record-id="${records[150]!.id}"]`) as HTMLTableRowElement;
    expect(scrolledRow).not.toBeNull();
    expect(scrolledRow.className).toContain('selected-category');
  });

  it('toggles crossing exclusion from the row context menu while keeping the crossing visible', async () => {
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
      time: new Date('2026-05-29T10:06:00.000Z'),
    } as ParticipantPassingRecord;
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[] } = {
      categories: [categoryA],
      countTransponderCrossings: () => 1,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categoryId === categoryA.id ? categoryA : undefined,
      getEntrantIdForParticipant: (participantId) => participantId === participant.id ? participant.entrantId : undefined,
      getParticipantById: (participantId) => participantId === participant.id ? participant : undefined,
      getParticipantLaps: () => [crossing],
      getTransponderCrossings: () => [],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };
    const onExclude = vi.fn();
    const renderRecords = async (): Promise<void> => {
      await act(async () => {
        root.render(
          <RecentRecords
            onExclude={onExclude}
            raceStateLookup={raceStateLookup}
            records={[crossing]}
            selectedCategories={new Set()}
            selectedParticipants={new Set()}
          />
        );
      });
    };
    const openMenu = async (): Promise<void> => {
      const row = container.querySelector('tr[data-record-id="2001"]');
      expect(row).not.toBeNull();

      await act(async () => {
        row!.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 60,
          clientY: 80,
        }));
      });
    };
    const clickMenuItem = async (label: string): Promise<void> => {
      const menuItem = Array.from(document.querySelectorAll('li[role="menuitem"]')).find((item) => {
        return item.textContent?.trim() === label;
      });
      expect(menuItem).toBeDefined();

      await act(async () => {
        menuItem!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    };

    await renderRecords();
    await openMenu();
    await clickMenuItem('Exclude crossing');

    expect(onExclude).toHaveBeenCalledWith(crossing.id, true);
    expect(container.querySelector('tr[data-record-id="2001"]')).not.toBeNull();

    crossing.isExcluded = true;
    crossing.isManuallyExcluded = true;
    await renderRecords();
    await openMenu();
    await clickMenuItem('Include crossing');

    expect(onExclude).toHaveBeenLastCalledWith(crossing.id, false);
    expect(container.querySelector('tr[data-record-id="2001"]')).not.toBeNull();
  });

  it('shows flag context actions for deleting and changing assigned categories', async () => {
    const categoryA: EventCategory = { id: '1', name: 'Category A' };
    const categoryB: EventCategory = { id: '2', name: 'Category B' };
    const flag: FlagRecord = {
      categoryIds: [categoryA.id],
      flagType: 'green',
      flagValue: 'course',
      id: 'flag-1',
      recordType: 4,
      sequence: 1,
      source: 'test-source',
      time: new Date('2026-05-29T10:00:00.000Z'),
    };
    const categories = [categoryA, categoryB];
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[] } = {
      categories,
      countTransponderCrossings: () => 0,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categories.find((category) => category.id === categoryId),
      getEntrantIdForParticipant: () => undefined,
      getParticipantById: () => undefined,
      getParticipantLaps: () => [],
      getTransponderCrossings: () => [],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };
    const onAssignFlagCategory = vi.fn();
    const onMarkFlagDeleted = vi.fn();
    const onRemoveFlagCategory = vi.fn();
    const getMenuItem = (label: string): Element | undefined => {
      return Array.from(document.querySelectorAll('li[role="menuitem"]')).find((item) => {
        return item.textContent?.trim() === label;
      });
    };
    const openFlagMenu = async (): Promise<void> => {
      const row = container.querySelector('tr[data-record-id="flag-1"]');
      expect(row).not.toBeNull();

      await act(async () => {
        row!.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 60,
          clientY: 80,
        }));
      });
    };

    await act(async () => {
      root.render(
        <RecentRecords
          onAssignFlagCategory={onAssignFlagCategory}
          onMarkFlagDeleted={onMarkFlagDeleted}
          onRemoveFlagCategory={onRemoveFlagCategory}
          raceStateLookup={raceStateLookup}
          records={[flag as unknown as ParticipantPassingRecord]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
        />
      );
    });

    await openFlagMenu();

    expect(getMenuItem('Mark deleted')).toBeDefined();
    expect(document.body.textContent).toContain('Remove category');
    expect(getMenuItem(categoryA.name)).toBeDefined();
    expect(document.body.textContent).toContain('Assign category');
    expect(getMenuItem(categoryB.name)).toBeDefined();

    await act(async () => {
      getMenuItem('Mark deleted')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onMarkFlagDeleted).toHaveBeenCalledWith(flag.id, true);

    await openFlagMenu();

    await act(async () => {
      getMenuItem(categoryA.name)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onRemoveFlagCategory).toHaveBeenCalledWith(flag.id, categoryA.id);

    await openFlagMenu();

    await act(async () => {
      getMenuItem(categoryB.name)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onAssignFlagCategory).toHaveBeenCalledWith(flag.id, categoryB.id);
  });

  it('re-renders recalculated crossing times after persisted flag menu actions', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const categoryAId = createCategoryId('recent-flow-category-a');
    const categoryBId = createCategoryId('recent-flow-category-b');
    const participantId = createEventParticipantId('recent-flow-participant');
    const earlyFlagId = createTimeRecordId('recent-flow-early-start');
    const laterFlagId = createTimeRecordId('recent-flow-later-start');
    const crossingId = createTimeRecordId('recent-flow-crossing');
    const source = createTimeRecordSourceId('recent-flow-source');
    const categories: EventCategory[] = [
      { id: categoryAId, name: 'Category A', startTime: '2026-05-29T09:00:00.000Z' },
      { id: categoryBId, name: 'Category B', startTime: '2026-05-29T09:00:00.000Z' },
    ];
    const participant: EventParticipant = {
      categoryId: categoryBId,
      currentResult: undefined,
      entrantId: participantId,
      firstname: 'Pat',
      id: participantId,
      identifiers: [{ fromTime: undefined, toTime: undefined, txNo: 100606 }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Rider',
    };
    const earlyFlag = createGreenFlagEvent({
      categoryIds: [categoryBId],
      flagValue: 'course',
      id: earlyFlagId,
      sequence: 1,
      source,
      time: new Date('2026-05-29T10:00:00.000Z'),
    });
    const laterFlag = createGreenFlagEvent({
      categoryIds: [categoryAId],
      flagValue: 'course',
      id: laterFlagId,
      sequence: 2,
      source,
      time: new Date('2026-05-29T10:05:00.000Z'),
    });
    const crossing: ParticipantPassingRecord = {
      chipCode: 100606,
      id: crossingId,
      recordType: RECORD_TX_CROSSING,
      sequence: 3,
      source,
      time: new Date('2026-05-29T10:06:00.000Z'),
    } as ParticipantPassingRecord;
    const session = new Session({
      categories,
      participants: [],
      records: [],
      teams: [],
    });

    await session.beginBulkProcess();
    session.addParticipants([participant]);
    await session.addRecords([earlyFlag, laterFlag, crossing]);
    await session.endBulkProcess();

    const persistence = new MemoryRaceAdminPersistence();
    const service = await RaceAdminService.create(async () => session, persistence);
    let latestMutation: Promise<void> = Promise.resolve();
    const getCrossingRow = (): Element | null => container.querySelector(`tr[data-record-id="${crossingId}"]`);
    const getMenuItem = (label: string): Element | undefined => {
      return Array.from(document.querySelectorAll('li[role="menuitem"]')).find((item) => {
        return item.textContent?.trim() === label;
      });
    };
    const openFlagMenu = async (flagId: TimeRecordId): Promise<void> => {
      const row = container.querySelector(`tr[data-record-id="${flagId}"]`);
      expect(row).not.toBeNull();

      await act(async () => {
        row!.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 60,
          clientY: 80,
        }));
      });
    };
    const clickMenuItem = async (label: string): Promise<void> => {
      const menuItem = getMenuItem(label);
      expect(menuItem).toBeDefined();

      await act(async () => {
        menuItem!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await latestMutation;
      });
    };
    const Harness = (): React.ReactElement => {
      const [, setRenderVersion] = React.useState(0);
      const persistMutation = (mutation: Promise<void>): void => {
        latestMutation = mutation.then(() => {
          setRenderVersion((value) => value + 1);
        });
      };

      return (
        <RecentRecords
          onAssignFlagCategory={(flagId, categoryId) => persistMutation(service.assignFlagCategoryForSession(session, flagId, categoryId))}
          onMarkFlagDeleted={(flagId, deleted) => persistMutation(service.markFlagDeletedForSession(session, flagId, deleted))}
          onRemoveFlagCategory={(flagId, categoryId) => persistMutation(service.removeFlagCategoryForSession(session, flagId, categoryId))}
          raceStateLookup={session}
          records={session.records as EventTimeRecord[]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
        />
      );
    };

    await act(async () => {
      root.render(<Harness />);
    });

    expect(getCrossingRow()?.textContent).toContain('6:00.000');
    expect(getCrossingRow()?.textContent).not.toContain('01:06:00.000');

    await openFlagMenu(laterFlagId);
    await clickMenuItem('Category B');

    expect(persistence.snapshot.flagCategoryChanges).toContainEqual({
      action: 'assign',
      categoryId: categoryBId,
      flagId: laterFlagId,
    });
    expect(getCrossingRow()?.textContent).toContain('1:00.000');

    await openFlagMenu(laterFlagId);
    await clickMenuItem('Category B');

    expect(persistence.snapshot.flagCategoryChanges).toContainEqual({
      action: 'remove',
      categoryId: categoryBId,
      flagId: laterFlagId,
    });
    expect(getCrossingRow()?.textContent).toContain('6:00.000');

    await openFlagMenu(earlyFlagId);
    await clickMenuItem('Mark deleted');

    expect(persistence.snapshot.flagDeleted[earlyFlagId]).toBe(true);
    expect(getCrossingRow()?.textContent).toContain('--:--:--.---');
    expect(getCrossingRow()?.className).toContain('invalid-passing');
    debugSpy.mockRestore();
  });

  it('clears displayed lap metrics when the only applicable start flag is removed or deleted', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const categoryAId = createCategoryId('recent-clear-category-a');
    const categoryBId = createCategoryId('recent-clear-category-b');
    const participantId = createEventParticipantId('recent-clear-participant');
    const flagId = createTimeRecordId('recent-clear-start');
    const crossingId = createTimeRecordId('recent-clear-crossing');
    const source = createTimeRecordSourceId('recent-clear-source');
    const categories: EventCategory[] = [
      { id: categoryAId, name: 'Category A' },
      { id: categoryBId, name: 'Category B' },
    ];
    const participant: EventParticipant = {
      categoryId: categoryBId,
      currentResult: undefined,
      entrantId: participantId,
      firstname: 'Pat',
      id: participantId,
      identifiers: [{ fromTime: undefined, toTime: undefined, txNo: 100808 }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Rider',
    };
    const startFlag = createGreenFlagEvent({
      categoryIds: [categoryAId, categoryBId],
      flagValue: 'course',
      id: flagId,
      sequence: 1,
      source,
      time: new Date('2026-05-29T10:00:00.000Z'),
    });
    const crossing: ParticipantPassingRecord = {
      chipCode: 100808,
      id: crossingId,
      recordType: RECORD_TX_CROSSING,
      sequence: 2,
      source,
      time: new Date('2026-05-29T10:06:00.000Z'),
    } as ParticipantPassingRecord;
    const session = new Session({
      categories,
      participants: [],
      records: [],
      teams: [],
    });

    await session.beginBulkProcess();
    session.addParticipants([participant]);
    await session.addRecords([startFlag, crossing]);
    await session.endBulkProcess();

    const persistence = new MemoryRaceAdminPersistence();
    const service = await RaceAdminService.create(async () => session, persistence);
    let latestMutation: Promise<void> = Promise.resolve();
    const getCrossingCells = (): HTMLTableCellElement[] => {
      const row = container.querySelector(`tr[data-record-id="${crossingId}"]`);
      expect(row).not.toBeNull();
      return Array.from(row!.querySelectorAll('td')) as HTMLTableCellElement[];
    };
    const getMenuItem = (label: string): Element | undefined => {
      return Array.from(document.querySelectorAll('li[role="menuitem"]')).find((item) => {
        return item.textContent?.trim() === label;
      });
    };
    const openFlagMenu = async (): Promise<void> => {
      const row = container.querySelector(`tr[data-record-id="${flagId}"]`);
      expect(row).not.toBeNull();

      await act(async () => {
        row!.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 60,
          clientY: 80,
        }));
      });
    };
    const clickMenuItem = async (label: string): Promise<void> => {
      const menuItem = getMenuItem(label);
      expect(menuItem).toBeDefined();

      await act(async () => {
        menuItem!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await latestMutation;
      });
    };
    const Harness = (): React.ReactElement => {
      const [, setRenderVersion] = React.useState(0);
      const persistMutation = (mutation: Promise<void>): void => {
        latestMutation = mutation.then(() => {
          setRenderVersion((value) => value + 1);
        });
      };

      return (
        <RecentRecords
          onAssignFlagCategory={(currentFlagId, categoryId) => persistMutation(service.assignFlagCategoryForSession(session, currentFlagId, categoryId))}
          onMarkFlagDeleted={(currentFlagId, deleted) => persistMutation(service.markFlagDeletedForSession(session, currentFlagId, deleted))}
          onRemoveFlagCategory={(currentFlagId, categoryId) => persistMutation(service.removeFlagCategoryForSession(session, currentFlagId, categoryId))}
          raceStateLookup={session}
          records={session.records as EventTimeRecord[]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
        />
      );
    };

    await act(async () => {
      root.render(<Harness />);
    });

    expect(getCrossingCells()[7]?.textContent).toBe('1');
    expect(getCrossingCells()[8]?.textContent).toBe('6:00.000');
    expect(getCrossingCells()[9]?.textContent).toBe('6:00.000');

    await openFlagMenu();
    await clickMenuItem('Category B');

    expect(persistence.snapshot.flagCategoryChanges).toContainEqual({
      action: 'remove',
      categoryId: categoryBId,
      flagId,
    });
    expect(getCrossingCells()[7]?.textContent).toBe('');
    expect(getCrossingCells()[8]?.textContent).toBe('--:--:--.---');
    expect(getCrossingCells()[9]?.textContent).toBe('--:--:--.---');

    await openFlagMenu();
    await clickMenuItem('Category B');

    expect(persistence.snapshot.flagCategoryChanges).toContainEqual({
      action: 'assign',
      categoryId: categoryBId,
      flagId,
    });
    expect(getCrossingCells()[7]?.textContent).toBe('1');
    expect(getCrossingCells()[8]?.textContent).toBe('6:00.000');
    expect(getCrossingCells()[9]?.textContent).toBe('6:00.000');

    await openFlagMenu();
    await clickMenuItem('Mark deleted');

    expect(persistence.snapshot.flagDeleted[flagId]).toBe(true);
    expect(getCrossingCells()[7]?.textContent).toBe('');
    expect(getCrossingCells()[8]?.textContent).toBe('--:--:--.---');
    expect(getCrossingCells()[9]?.textContent).toBe('--:--:--.---');

    debugSpy.mockRestore();
  });

  it('does not render non-start system-generated flags in the recent records table', async () => {
    const categoryA: EventCategory = { id: '1', name: 'Category A' };
    const systemFlag: FlagRecord = {
      flagType: 'yellow',
      flagValue: 'course',
      id: 'system-flag',
      recordType: 4,
      sequence: 0,
      source: 'test-source',
      systemGenerated: true,
      time: new Date('2026-05-29T00:00:00.000Z'),
    };
    const crossing: ParticipantPassingRecord = {
      chipCode: 100101,
      id: 'crossing-1',
      isValid: true,
      recordType: RECORD_TX_CROSSING,
      sequence: 1,
      source: 'test-source',
      time: new Date('2026-05-29T10:06:00.000Z'),
    } as ParticipantPassingRecord;
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[] } = {
      categories: [categoryA],
      countTransponderCrossings: () => 0,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categoryId === categoryA.id ? categoryA : undefined,
      getEntrantIdForParticipant: () => undefined,
      getParticipantById: () => undefined,
      getParticipantLaps: () => [],
      getTransponderCrossings: () => [],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    await act(async () => {
      root.render(
        <RecentRecords
          raceStateLookup={raceStateLookup}
          records={[systemFlag as unknown as ParticipantPassingRecord, crossing]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
        />
      );
    });

    expect(getDisplayedRecordIds(container)).toEqual(['crossing-1']);
    expect(container.querySelector('tr[data-record-id="system-flag"]')).toBeNull();
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
    expect(container.querySelector('tr[data-record-id="2001"]')?.textContent).toContain('2026-06-07 10:15:30.250');

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

    expect(container.querySelector('tr[data-record-id="2001"]')?.textContent).toContain('2026-06-07 00:15:30.250');
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

  it('shows the team name for crossings after imported race state teams are applied to the Timing session', async () => {
    const category: EventCategory = { id: createCategoryId('imported-team-category'), name: 'Imported Teams' };
    const teamId = createEventEntrantId('imported-team-rocket-squad');
    const participantId = createEventParticipantId('imported-team-pat-rider');
    const recordId = createTimeRecordId('imported-team-crossing');
    const sourceId = createTimeRecordSourceId('imported-team-source');
    const participant: EventParticipant = {
      categoryId: category.id,
      currentResult: undefined,
      entrantId: teamId,
      firstname: 'Pat',
      id: participantId,
      identifiers: [{ fromTime: undefined, racePlate: '101', toTime: undefined }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'RIDER',
    };
    const team: EventTeam = {
      categoryId: category.id,
      description: '',
      id: teamId,
      members: [participantId],
      name: 'Rocket Squad',
    };
    const crossing: ParticipantPassingRecord = {
      chipCode: 100101,
      id: recordId,
      isValid: true,
      participantId,
      plateNumber: '101',
      recordType: RECORD_TX_CROSSING,
      sequence: 1,
      source: sourceId,
      time: new Date('2026-05-29T10:06:00.000Z'),
    } as ParticipantPassingRecord;
    const session = new Session({
      categories: [],
      participants: [],
      records: [],
      teams: [],
    });

    await applyPulledRaceStateToSession(session, {
      categories: [category],
      participants: [participant],
      records: [crossing],
      teams: [team],
    });

    await act(async () => {
      root.render(
        <RecentRecords
          raceStateLookup={session}
          records={session.records as EventTimeRecord[]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
        />
      );
    });

    expect(container.querySelector(`tr[data-record-id="${recordId}"]`)?.textContent).toContain('Pat RIDER (Rocket Squad)');
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
    const flagRecord: FlagRecord = {
      categoryIds: [categoryC.id],
      flagType: 'yellow',
      flagValue: 'caution',
      id: 'flag-only',
      recordType: 4,
      sequence: 5,
      source: 'test-source',
      time: new Date('2026-05-29T10:05:00.000Z'),
    };
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
          records={[...crossings, flagRecord]}
          selectedCategories={new Set([categoryA.id])}
          selectedParticipants={new Set([teamMemberOne.id])}
        />
      );
    });

    const allRecordIds = ['2001', '2002', '2003', '2004', 'flag-only'];
    expect(getDisplayedRecordIds(container)).toEqual(allRecordIds);

    await selectRecentRecordsFilter('Only flags');
    expect(getDisplayedRecordIds(container)).toEqual(['flag-only']);

    await selectRecentRecordsFilter('All records');
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

  it('ignores crossings outside the category and event window while keeping flags visible', async () => {
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
    const categoryStartA: FlagRecord = {
      categoryIds: [categoryA.id],
      flagType: 'green',
      flagValue: 'course',
      id: 'start-a',
      recordType: 4,
      sequence: 1,
      source: 'test-source',
      time: new Date('2026-05-29T10:00:00.000Z'),
    };
    const categoryStartB: FlagRecord = {
      categoryIds: [categoryB.id],
      flagType: 'green',
      flagValue: 'course',
      id: 'start-b',
      recordType: 4,
      sequence: 6,
      source: 'test-source',
      time: new Date('2026-05-29T10:05:00.000Z'),
    };
    const categoryFinishA: FlagRecord = {
      categoryIds: [categoryA.id],
      flagType: 'chequered',
      flagValue: 'course',
      id: 'finish-a',
      recordType: 4,
      sequence: 4,
      source: 'test-source',
      time: new Date('2026-05-29T10:02:00.000Z'),
    };
    const eventFinish: FlagRecord = {
      flagType: 'chequered',
      flagValue: 'course',
      id: 'finish-event',
      recordType: 4,
      sequence: 9,
      source: 'test-source',
      time: new Date('2026-05-29T10:06:00.000Z'),
    };
    const crossings: ParticipantPassingRecord[] = [
      { id: 'before-start-a', participantId: teamMemberOne.id, sequence: 0, time: '2026-05-29T09:59:00.000Z' },
      { id: 'in-window-a', participantId: teamMemberOne.id, sequence: 2, time: '2026-05-29T10:01:00.000Z' },
      { id: 'first-team-after-finish-a', participantId: teamMemberOne.id, sequence: 5, time: '2026-05-29T10:03:00.000Z' },
      { id: 'second-team-after-finish-a', participantId: teamMemberTwo.id, sequence: 7, time: '2026-05-29T10:04:00.000Z' },
      { id: 'before-start-b', participantId: soloRider.id, sequence: 8, time: '2026-05-29T10:04:30.000Z' },
      { id: 'first-solo-after-event-finish', participantId: soloRider.id, sequence: 10, time: '2026-05-29T10:07:00.000Z' },
      { id: 'second-solo-after-event-finish', participantId: soloRider.id, sequence: 11, time: '2026-05-29T10:08:00.000Z' },
    ].map((crossing) => ({
      chipCode: 100100,
      id: crossing.id,
      isValid: true,
      participantId: crossing.participantId,
      recordType: RECORD_TX_CROSSING,
      sequence: crossing.sequence,
      source: 'test-source',
      time: new Date(crossing.time),
    }) as ParticipantPassingRecord);
    const records = [
      crossings[0],
      categoryStartA,
      crossings[1],
      categoryFinishA,
      crossings[2],
      categoryStartB,
      crossings[3],
      crossings[4],
      eventFinish,
      crossings[5],
      crossings[6],
    ] as Array<ParticipantPassingRecord | FlagRecord>;
    const participants = new Map<EventParticipant['id'], EventParticipant>([
      [teamMemberOne.id, teamMemberOne],
      [teamMemberTwo.id, teamMemberTwo],
      [soloRider.id, soloRider],
    ]);
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[] } = {
      categories: [categoryA, categoryB],
      countTransponderCrossings: () => 1,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => [categoryA, categoryB].find((category) => category.id === categoryId),
      getEntrantIdForParticipant: (participantId) => participants.get(participantId)?.entrantId,
      getParticipantById: (participantId) => participants.get(participantId),
      getParticipantLaps: (participantId) => crossings.filter((crossing) => crossing.participantId === participantId),
      getTransponderCrossings: () => [],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    await act(async () => {
      root.render(
        <RecentRecords
          raceStateLookup={raceStateLookup}
          records={records as ParticipantPassingRecord[]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
        />
      );
    });

    expect(getDisplayedRecordIds(container)).toEqual([
      'before-start-a',
      'start-a',
      'in-window-a',
      'finish-a',
      'first-team-after-finish-a',
      'second-team-after-finish-a',
      'before-start-b',
      'start-b',
      'finish-event',
      'first-solo-after-event-finish',
      'second-solo-after-event-finish',
    ]);

    await toggleIgnoreRecordsFilter('Outside event window');

    expect(getDisplayedRecordIds(container)).toEqual([
      'start-a',
      'in-window-a',
      'finish-a',
      'first-team-after-finish-a',
      'start-b',
      'finish-event',
      'first-solo-after-event-finish',
    ]);
  });

  it('ignores unrecognised crossings while keeping flag records visible', async () => {
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
    const knownCrossing: ParticipantPassingRecord = {
      chipCode: 100101,
      id: 'known-crossing',
      isValid: true,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 1,
      source: 'test-source',
      time: new Date('2026-05-29T10:01:00.000Z'),
    } as ParticipantPassingRecord;
    const unassignedCrossing: ParticipantPassingRecord = {
      chipCode: 100102,
      id: 'unassigned-crossing',
      isValid: true,
      recordType: RECORD_TX_CROSSING,
      sequence: 2,
      source: 'test-source',
      time: new Date('2026-05-29T10:02:00.000Z'),
    } as ParticipantPassingRecord;
    const unknownParticipantCrossing: ParticipantPassingRecord = {
      chipCode: 100103,
      id: 'unknown-participant-crossing',
      isValid: true,
      participantId: 'missing-participant',
      recordType: RECORD_TX_CROSSING,
      sequence: 3,
      source: 'test-source',
      time: new Date('2026-05-29T10:03:00.000Z'),
    } as ParticipantPassingRecord;
    const unknownCategoryParticipant: EventParticipant = {
      ...participant,
      categoryId: 'missing-category',
      id: '102',
    };
    const unknownCategoryCrossing: ParticipantPassingRecord = {
      chipCode: 100104,
      id: 'unknown-category-crossing',
      isValid: true,
      participantId: unknownCategoryParticipant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 4,
      source: 'test-source',
      time: new Date('2026-05-29T10:04:00.000Z'),
    } as ParticipantPassingRecord;
    const flag: FlagRecord = {
      categoryIds: [categoryA.id],
      flagType: 'chequered',
      flagValue: 'course',
      id: 'finish-flag',
      recordType: 4,
      sequence: 5,
      source: 'test-source',
      time: new Date('2026-05-29T10:05:00.000Z'),
    };
    const participants = new Map<EventParticipant['id'], EventParticipant>([
      [participant.id, participant],
      [unknownCategoryParticipant.id, unknownCategoryParticipant],
    ]);
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[] } = {
      categories: [categoryA],
      countTransponderCrossings: () => 1,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categoryId === categoryA.id ? categoryA : undefined,
      getEntrantIdForParticipant: (participantId) => participants.get(participantId)?.entrantId,
      getParticipantById: (participantId) => participants.get(participantId),
      getParticipantLaps: () => [knownCrossing],
      getTransponderCrossings: () => [],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    await act(async () => {
      root.render(
        <RecentRecords
          raceStateLookup={raceStateLookup}
          records={[
            knownCrossing,
            unassignedCrossing,
            unknownParticipantCrossing,
            unknownCategoryCrossing,
            flag as unknown as ParticipantPassingRecord,
          ]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
        />
      );
    });

    expect(getDisplayedRecordIds(container)).toEqual([
      'known-crossing',
      'unassigned-crossing',
      'unknown-participant-crossing',
      'unknown-category-crossing',
      'finish-flag',
    ]);

    await toggleIgnoreRecordsFilter('Unrecognised');

    expect(getDisplayedRecordIds(container)).toEqual([
      'known-crossing',
      'finish-flag',
    ]);
  });

  it('ignores sector loop crossings while keeping lap crossings and flags visible', async () => {
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
    const startFinishCrossing: ParticipantPassingRecord = {
      chipCode: 100101,
      id: 'start-finish-crossing',
      isValid: true,
      lineNumber: 1,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 1,
      source: 'test-source',
      time: new Date('2026-05-29T10:01:00.000Z'),
    } as ParticipantPassingRecord;
    const noLoopCrossing: ParticipantPassingRecord = {
      chipCode: 100101,
      id: 'no-loop-crossing',
      isValid: true,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 2,
      source: 'test-source',
      time: new Date('2026-05-29T10:01:10.000Z'),
    } as ParticipantPassingRecord;
    const speedTrapCrossing: ParticipantPassingRecord = {
      chipCode: 100101,
      id: 'speed-trap-crossing',
      isValid: true,
      lineNumber: 2,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 3,
      source: 'test-source',
      time: new Date('2026-05-29T10:01:20.000Z'),
    } as ParticipantPassingRecord;
    const sectorLoopCrossing: ParticipantPassingRecord = {
      chipCode: 100101,
      id: 'sector-loop-crossing',
      isValid: true,
      lineNumber: 5,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 4,
      source: 'test-source',
      time: new Date('2026-05-29T10:01:30.000Z'),
    } as ParticipantPassingRecord;
    const sectorLoopOneCrossing: ParticipantPassingRecord = {
      chipCode: 100101,
      id: 'sector-loop-one-crossing',
      isValid: true,
      lineNumber: 5,
      loopNumber: 1,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 4.5,
      source: 'test-source',
      time: new Date('2026-05-29T10:01:35.000Z'),
    } as ParticipantPassingRecord;
    const explicitNonLapCrossing: ParticipantPassingRecord = {
      chipCode: 100101,
      id: 'explicit-non-lap-crossing',
      isLapCompletion: false,
      isValid: true,
      lineNumber: 3,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 5,
      source: 'test-source',
      time: new Date('2026-05-29T10:01:40.000Z'),
    } as ParticipantPassingRecord;
    const pitEntryLapCrossing: ParticipantPassingRecord = {
      chipCode: 100101,
      id: 'pit-entry-lap-crossing',
      isValid: true,
      lineNumber: 7,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 6,
      source: 'test-source',
      time: new Date('2026-05-29T10:01:50.000Z'),
    } as ParticipantPassingRecord;
    const tableMarkedLineCrossing: ParticipantPassingRecord = {
      chipCode: 100101,
      id: 'table-marked-line-crossing',
      isLapCompletion: true,
      isValid: true,
      lineNumber: 8,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 7,
      source: 'test-source',
      time: new Date('2026-05-29T10:01:55.000Z'),
    } as ParticipantPassingRecord;
    const explicitLapCrossing: ParticipantPassingRecord = {
      chipCode: 100101,
      id: 'explicit-lap-crossing',
      isLapCompletion: true,
      isValid: true,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 8,
      source: 'test-source',
      time: new Date('2026-05-29T10:01:57.000Z'),
    } as ParticipantPassingRecord;
    const flag: FlagRecord = {
      categoryIds: [categoryA.id],
      flagType: 'chequered',
      flagValue: 'course',
      id: 'finish-flag',
      recordType: 4,
      sequence: 9,
      source: 'test-source',
      time: new Date('2026-05-29T10:02:00.000Z'),
    };
    const crossings = [
      startFinishCrossing,
      noLoopCrossing,
      speedTrapCrossing,
      sectorLoopCrossing,
      sectorLoopOneCrossing,
      explicitNonLapCrossing,
      pitEntryLapCrossing,
      tableMarkedLineCrossing,
      explicitLapCrossing,
    ];
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[] } = {
      categories: [categoryA],
      countTransponderCrossings: () => 1,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categoryId === categoryA.id ? categoryA : undefined,
      getEntrantIdForParticipant: (participantId) => participantId === participant.id ? participant.entrantId : undefined,
      getFinishLineNumbers: () => [1, 7],
      getParticipantById: (participantId) => participantId === participant.id ? participant : undefined,
      getParticipantLaps: () => crossings,
      getTransponderCrossings: () => [],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    await act(async () => {
      root.render(
        <RecentRecords
          raceStateLookup={raceStateLookup}
          records={[...crossings, flag as unknown as ParticipantPassingRecord]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
        />
      );
    });

    expect(getDisplayedRecordIds(container)).toEqual([
      'start-finish-crossing',
      'no-loop-crossing',
      'speed-trap-crossing',
      'sector-loop-crossing',
      'sector-loop-one-crossing',
      'explicit-non-lap-crossing',
      'pit-entry-lap-crossing',
      'table-marked-line-crossing',
      'explicit-lap-crossing',
      'finish-flag',
    ]);

    await toggleIgnoreRecordsFilter('Sector loops');
    await expectIgnoreRecordsFilterChecked('Sector loops');

    expect(getDisplayedRecordIds(container)).toEqual([
      'start-finish-crossing',
      'no-loop-crossing',
      'pit-entry-lap-crossing',
      'explicit-lap-crossing',
      'finish-flag',
    ]);
  });

  it('keeps excluded-result category crossings visible but unrelated to selected category filters', async () => {
    const timingErrorCategory: EventCategory = { excludeFromResults: true, id: 'error-cat', name: 'Timing Error List' };
    const participant: EventParticipant = {
      categoryId: timingErrorCategory.id,
      currentResult: undefined,
      entrantId: 'error-entrant',
      firstname: 'Timing',
      id: 'error-participant',
      identifiers: [{ fromTime: undefined, racePlate: '999', toTime: undefined }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'ERROR',
    };
    const crossing: ParticipantPassingRecord = {
      chipCode: 100999,
      id: 'timing-error-crossing',
      isValid: true,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 1,
      source: 'test-source',
      time: new Date('2026-05-29T10:01:00.000Z'),
    } as ParticipantPassingRecord;
    const participants = new Map<EventParticipant['id'], EventParticipant>([[participant.id, participant]]);
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[] } = {
      categories: [timingErrorCategory],
      countTransponderCrossings: () => 1,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categoryId === timingErrorCategory.id ? timingErrorCategory : undefined,
      getEntrantIdForParticipant: (participantId) => participants.get(participantId)?.entrantId,
      getParticipantById: (participantId) => participants.get(participantId),
      getParticipantLaps: () => [crossing],
      getTransponderCrossings: () => [],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    await act(async () => {
      root.render(
        <RecentRecords
          raceStateLookup={raceStateLookup}
          records={[crossing]}
          selectedCategories={new Set([timingErrorCategory.id])}
          selectedParticipants={new Set()}
        />
      );
    });

    expect(getDisplayedRecordIds(container)).toEqual(['timing-error-crossing']);
    expect(container.querySelector('tr[data-record-id="timing-error-crossing"]')?.className).not.toContain('selected-category');

    await selectRecentRecordsFilter('Only selected category');

    expect(getDisplayedRecordIds(container)).toEqual([]);
    expect(container.textContent).toContain('No records available.');
  });

  it('hides excluded-result category crossings when unrecognised records are ignored', async () => {
    const timingErrorCategory: EventCategory = { excludeFromResults: true, id: 'error-cat', name: 'Timing Error List' };
    const participant: EventParticipant = {
      categoryId: timingErrorCategory.id,
      currentResult: undefined,
      entrantId: 'error-entrant',
      firstname: 'Timing',
      id: 'error-participant',
      identifiers: [{ fromTime: undefined, racePlate: '999', toTime: undefined }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'ERROR',
    };
    const crossing: ParticipantPassingRecord = {
      chipCode: 100999,
      id: 'timing-error-crossing',
      isValid: true,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 1,
      source: 'test-source',
      time: new Date('2026-05-29T10:01:00.000Z'),
    } as ParticipantPassingRecord;
    const participants = new Map<EventParticipant['id'], EventParticipant>([[participant.id, participant]]);
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[] } = {
      categories: [timingErrorCategory],
      countTransponderCrossings: () => 1,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categoryId === timingErrorCategory.id ? timingErrorCategory : undefined,
      getEntrantIdForParticipant: (participantId) => participants.get(participantId)?.entrantId,
      getParticipantById: (participantId) => participants.get(participantId),
      getParticipantLaps: () => [crossing],
      getTransponderCrossings: () => [],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    await act(async () => {
      root.render(
        <RecentRecords
          raceStateLookup={raceStateLookup}
          records={[crossing]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
        />
      );
    });

    expect(getDisplayedRecordIds(container)).toEqual(['timing-error-crossing']);

    await toggleIgnoreRecordsFilter('Unrecognised');
    await expectIgnoreRecordsFilterChecked('Unrecognised');

    expect(getDisplayedRecordIds(container)).toEqual([]);
    expect(container.textContent).toContain('No records available.');
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
    expect(row!.className).toContain('selected-row');

    await act(async () => {
      row!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    state = JSON.parse(container.querySelector('[data-selection-state]')!.textContent || '{}');
    expect(state.recordSelectedParticipants).toEqual([]);
    expect(state.selectedCategories).toEqual([]);
    expect(row!.className).not.toContain('selected-participant');
    expect(row!.className).not.toContain('selected-category');
    expect(row!.className).not.toContain('selected-row');
  });

  it('highlights category rows and same-team participant rows with separate classes', async () => {
    const categoryA: EventCategory = { id: '1', name: 'Category A' };
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
      entrantId: 'team-a',
      firstname: 'Quinn',
      id: '102',
      identifiers: [{ fromTime: undefined, racePlate: '102', toTime: undefined }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Two',
    };
    const participant3: EventParticipant = {
      categoryId: categoryA.id,
      currentResult: undefined,
      entrantId: 'solo-entrant',
      firstname: 'Rae',
      id: '103',
      identifiers: [{ fromTime: undefined, racePlate: '103', toTime: undefined }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Three',
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
    const crossing3: ParticipantPassingRecord = {
      chipCode: 100103,
      id: '2003',
      isValid: true,
      participantId: participant3.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 3,
      source: 'test-source',
      time: new Date('2026-05-29T10:08:00.000Z'),
    } as ParticipantPassingRecord;
    const team: EventTeam = {
      categoryId: categoryA.id,
      description: '',
      id: 'team-a',
      members: [participant1.id, participant2.id],
      name: 'Team A',
    };
    const categories = [categoryA];
    const participants = new Map<EventParticipant['id'], EventParticipant>([
      [participant1.id, participant1],
      [participant2.id, participant2],
      [participant3.id, participant3],
    ]);
    const records = [crossing1, crossing2, crossing3];
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[]; teams: EventTeam[] } = {
      categories,
      countTransponderCrossings: () => 1,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categories.find((category) => category.id === categoryId),
      getEntrantIdForParticipant: (participantId) => participants.get(participantId)?.entrantId,
      getParticipantById: (participantId) => participants.get(participantId),
      getParticipantLaps: () => records,
      getTransponderCrossings: () => [],
      teams: [team],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    const Harness = (): React.ReactElement => {
      const [selectedCategories, setSelectedCategories] = React.useState<Set<EventCategory['id']>>(new Set());
      const [recordSelectedParticipants, setRecordSelectedParticipants] = React.useState<Set<EventParticipant['id']>>(new Set());

      const handleParticipantSelected = (participantIds: Set<EventParticipant['id']>): void => {
        const participantCategories = selectedCategoriesForParticipants(participantIds, raceStateLookup.getParticipantById);
        setRecordSelectedParticipants(participantIds);
        setSelectedCategories(participantCategories);
      };

      return (
        <RecentRecords
          categorySelected={setSelectedCategories}
          participantSelected={handleParticipantSelected}
          raceStateLookup={raceStateLookup}
          records={records}
          selectedCategories={selectedCategories}
          selectedParticipants={recordSelectedParticipants}
        />
      );
    };

    await act(async () => {
      root.render(<Harness />);
    });

    const firstRow = container.querySelector('tr[data-record-id="2001"]');
    const teammateRow = container.querySelector('tr[data-record-id="2002"]');
    const categoryOnlyRow = container.querySelector('tr[data-record-id="2003"]');
    expect(firstRow).not.toBeNull();
    expect(teammateRow).not.toBeNull();
    expect(categoryOnlyRow).not.toBeNull();

    await act(async () => {
      firstRow!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(firstRow!.className).toContain('selected-participant');
    expect(firstRow!.className).toContain('selected-category');
    expect(teammateRow!.className).toContain('selected-participant');
    expect(teammateRow!.className).toContain('selected-category');
    expect(categoryOnlyRow!.className).not.toContain('selected-participant');
    expect(categoryOnlyRow!.className).toContain('selected-category');
  });

  it('highlights selected participant rows immediately even before selectedParticipants props are refreshed', async () => {
    const categoryA: EventCategory = { id: '1', name: 'Category A' };
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
      entrantId: 'team-a',
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
    const categories = [categoryA];
    const participants = new Map<EventParticipant['id'], EventParticipant>([
      [participant1.id, participant1],
      [participant2.id, participant2],
    ]);
    const records = [crossing1, crossing2];
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[]; teams: EventTeam[] } = {
      categories,
      countTransponderCrossings: () => 1,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categories.find((category) => category.id === categoryId),
      getEntrantIdForParticipant: (participantId) => participants.get(participantId)?.entrantId,
      getParticipantById: (participantId) => participants.get(participantId),
      getParticipantLaps: () => records,
      getTransponderCrossings: () => [],
      teams: [{ categoryId: categoryA.id, description: '', id: 'team-a', members: [participant1.id, participant2.id], name: 'Team A' }],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };
    const participantSelected = vi.fn();

    await act(async () => {
      root.render(
        <RecentRecords
          participantSelected={participantSelected}
          raceStateLookup={raceStateLookup}
          records={records}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
        />
      );
    });

    const selectedRow = container.querySelector('tr[data-record-id="2001"]');
    const teammateRow = container.querySelector('tr[data-record-id="2002"]');
    expect(selectedRow).not.toBeNull();
    expect(teammateRow).not.toBeNull();

    await act(async () => {
      selectedRow!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(participantSelected).toHaveBeenCalledTimes(1);
    expect((participantSelected.mock.calls[0][0] as Set<EventParticipantId>).has(participant1.id)).toBe(true);
    expect(selectedRow!.className).toContain('selected-participant');
    expect(teammateRow!.className).toContain('selected-participant');
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

      const handleChangeCategory = (participantId: EventParticipantId, categoryId: EventCategory['id']) => {
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

  it('marks session records as unrelated when their rider or team category is not assigned to the session', async () => {
    const categoryA: EventCategory = { id: 'category-a', name: 'Category A' };
    const categoryB: EventCategory = { id: 'category-b', name: 'Category B' };
    const participantA: EventParticipant = {
      categoryId: categoryA.id,
      currentResult: undefined,
      entrantId: 'entrant-a',
      firstname: 'Pat',
      id: 'participant-a',
      identifiers: [{ fromTime: undefined, racePlate: '101', toTime: undefined }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Rider',
    };
    const participantB: EventParticipant = {
      categoryId: categoryB.id,
      currentResult: undefined,
      entrantId: 'entrant-b',
      firstname: 'Quinn',
      id: 'participant-b',
      identifiers: [{ fromTime: undefined, racePlate: '102', toTime: undefined }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Rider',
    };
    const crossingA: ParticipantPassingRecord = {
      chipCode: 100101,
      id: 'crossing-a',
      isValid: true,
      participantId: participantA.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 1,
      source: 'test-source',
      time: new Date('2026-05-29T10:06:00.000Z'),
    } as ParticipantPassingRecord;
    const crossingB: ParticipantPassingRecord = {
      chipCode: 100102,
      id: 'crossing-b',
      isValid: true,
      participantId: participantB.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 2,
      source: 'test-source',
      time: new Date('2026-05-29T10:07:00.000Z'),
    } as ParticipantPassingRecord;
    const categories = [categoryA, categoryB];
    const participants = new Map<EventParticipant['id'], EventParticipant>([
      [participantA.id, participantA],
      [participantB.id, participantB],
    ]);
    const records = [crossingA, crossingB];
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[] } = {
      categories,
      countTransponderCrossings: () => 1,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categories.find((category) => category.id === categoryId),
      getEntrantIdForParticipant: (participantId) => participants.get(participantId)?.entrantId,
      getParticipantById: (participantId) => participants.get(participantId),
      getParticipantLaps: () => records,
      getTransponderCrossings: () => [],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    await act(async () => {
      root.render(
        <RecentRecords
          raceStateLookup={raceStateLookup}
          records={records}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
          sessionValidCategoryIds={new Set([categoryA.id])}
        />
      );
    });

    const relatedRow = container.querySelector('tr[data-record-id="crossing-a"]');
    const unrelatedRow = container.querySelector('tr[data-record-id="crossing-b"]');
    expect(relatedRow).not.toBeNull();
    expect(unrelatedRow).not.toBeNull();
    expect(relatedRow!.className).not.toContain('unrelated');
    expect(unrelatedRow!.className).toContain('unrelated');
    expect(unrelatedRow!.textContent).toContain('Category B (unrelated)');
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

  it('renders MR-SCATS caution boundaries and highlights crossing timing cells during caution', async () => {
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
      surname: 'Driver',
    };
    const createCrossing = (id: string, sequence: number, time: string): ParticipantPassingRecord => ({
      chipCode: 100101,
      id,
      isValid: true,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence,
      source: 'test-source',
      time: new Date(time),
    } as ParticipantPassingRecord);
    const crossingBefore = createCrossing('crossing-before', 1, '2026-05-29T10:05:00.000Z');
    const cautionStart: FlagRecord = {
      categoryIds: [categoryA.id],
      description: 'Caution Period Start',
      flagType: 'yellow',
      flagValue: 'caution',
      id: 'caution-start',
      recordType: 4,
      sequence: 2,
      source: 'test-source',
      systemGenerated: true,
      time: new Date('2026-05-29T10:06:00.000Z'),
    };
    const crossingDuring = createCrossing('crossing-during', 3, '2026-05-29T10:07:00.000Z');
    const cautionEnd: FlagRecord = {
      categoryIds: [categoryA.id],
      description: 'Caution period end',
      flagType: 'green',
      flagValue: 'course',
      id: 'caution-end',
      indicatesRaceStart: false,
      recordType: 4,
      sequence: 4,
      source: 'test-source',
      systemGenerated: true,
      time: new Date('2026-05-29T10:08:00.000Z'),
    } as FlagRecord;
    const crossingAfter = createCrossing('crossing-after', 5, '2026-05-29T10:09:00.000Z');
    const categories = [categoryA];
    const participants = new Map([[participant.id, participant]]);
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[] } = {
      categories,
      countTransponderCrossings: () => 3,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categories.find((category) => category.id === categoryId),
      getEntrantIdForParticipant: (participantId) => participants.get(participantId)?.entrantId,
      getParticipantById: (participantId) => participants.get(participantId),
      getParticipantLaps: () => [crossingBefore, crossingDuring, crossingAfter],
      getTransponderCrossings: () => [],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    await act(async () => {
      root.render(
        <RecentRecords
          raceStateLookup={raceStateLookup}
          records={[crossingBefore, cautionStart, crossingDuring, cautionEnd, crossingAfter]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
        />
      );
    });

    expect(container.querySelector('tr[data-record-id="caution-start"]')?.textContent).toContain('Caution Period Start');
    expect(container.querySelector('tr[data-record-id="caution-end"]')?.textContent).toContain('Caution period end');
    const duringCells = Array.from(container.querySelectorAll('tr[data-record-id="crossing-during"] td'));
    expect(duringCells.slice(0, 4).every((cell) => cell.classList.contains('caution-period-cell'))).toBe(true);
    expect(duringCells.slice(4).some((cell) => cell.classList.contains('caution-period-cell'))).toBe(false);
    const beforeCells = Array.from(container.querySelectorAll('tr[data-record-id="crossing-before"] td'));
    const afterCells = Array.from(container.querySelectorAll('tr[data-record-id="crossing-after"] td'));
    expect(beforeCells.some((cell) => cell.classList.contains('caution-period-cell'))).toBe(false);
    expect(afterCells.some((cell) => cell.classList.contains('caution-period-cell'))).toBe(false);
  });

  it('renders plate-only crossings in the Number column and resolves entrants by racePlate', async () => {
    const categoryA: EventCategory = { id: '1', name: 'Category A' };
    const participant: EventParticipant = {
      categoryId: categoryA.id,
      currentResult: undefined,
      entrantId: 'entrant-123',
      firstname: 'Plate',
      id: 'participant-123',
      identifiers: [{ fromTime: undefined, racePlate: '123', toTime: undefined }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Rider',
    };
    const crossing = {
      id: 'plate-crossing-1',
      isValid: true,
      plateNumber: '123',
      recordType: RECORD_TX_CROSSING,
      sequence: 1,
      source: 'test-source',
      time: new Date('2026-05-29T10:06:00.000Z'),
    } as ParticipantPassingRecord & { plateNumber: string };
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[]; participants: EventParticipant[] } = {
      categories: [categoryA],
      countTransponderCrossings: () => 0,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categoryId === categoryA.id ? categoryA : undefined,
      getEntrantIdForParticipant: (participantId) => participantId === participant.id ? participant.entrantId : undefined,
      getParticipantById: (participantId) => participantId === participant.id ? participant : undefined,
      getParticipantLaps: () => [crossing],
      getTransponderCrossings: () => [],
      participants: [participant],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    await act(async () => {
      root.render(
        <RecentRecords
          raceStateLookup={raceStateLookup}
          records={[crossing]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
        />
      );
    });

    const row = container.querySelector('tr[data-record-id="plate-crossing-1"]');
    expect(row).not.toBeNull();
    const cells = Array.from(row!.querySelectorAll('td')).map((cell) => cell.textContent || '');

    expect(cells[2]).toBe('');
    expect(cells[4]).toBe('123');
    expect(cells[5]).toBe('Plate Rider');
    expect(cells[6]).toBe('Category A');
  });

  it('resolves transmitter-only crossings to recognised entrants and marks other-session rows excluded', async () => {
    const categoryA: EventCategory = { id: '1', name: 'Category A' };
    const categoryB: EventCategory = { id: '2', name: 'Category B' };
    const participant: EventParticipant = {
      categoryId: categoryB.id,
      currentResult: undefined,
      entrantId: 'entrant-404',
      firstname: 'Previous',
      id: 'participant-404',
      identifiers: [{ fromTime: undefined, toTime: undefined, txNo: 404404 }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Competitor',
    };
    const crossing = {
      chipCode: 404404,
      id: 'tx-only-crossing',
      recordType: RECORD_TX_CROSSING,
      sequence: 1,
      source: 'test-source',
      time: new Date('2026-05-29T10:06:00.000Z'),
    } as ParticipantPassingRecord;
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[]; participants: EventParticipant[] } = {
      categories: [categoryA, categoryB],
      countTransponderCrossings: () => 1,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => [categoryA, categoryB].find((category) => category.id === categoryId),
      getEntrantIdForParticipant: (participantId) => participantId === participant.id ? participant.entrantId : undefined,
      getParticipantById: (participantId) => participantId === participant.id ? participant : undefined,
      getParticipantLaps: () => undefined,
      getTransponderCrossings: () => [],
      participants: [participant],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    await act(async () => {
      root.render(
        <RecentRecords
          raceStateLookup={raceStateLookup}
          records={[crossing]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
          sessionValidCategoryIds={new Set([categoryA.id])}
        />
      );
    });

    const row = container.querySelector('tr[data-record-id="tx-only-crossing"]');
    expect(row).not.toBeNull();
    const cells = Array.from(row!.querySelectorAll('td')).map((cell) => cell.textContent || '');

    expect(row!.className).toContain('unrelated');
    expect(row!.className).toContain('excluded');
    expect(cells[2]).toBe('Tx404404');
    expect(cells[4]).toBe('?');
    expect(cells[5]).toBe('Previous Competitor');
    expect(cells[6]).toContain('Category B (unrelated)');
  });

  it('selects unrecognised plate crossings, opens edit actions, and highlights matching plate rows', async () => {
    const categoryA: EventCategory = { id: '1', name: 'Category A' };
    const firstCrossing = {
      id: 'unknown-plate-1',
      isValid: true,
      plateNumber: '404',
      recordType: RECORD_TX_CROSSING,
      sequence: 1,
      source: 'test-source',
      time: new Date('2026-05-29T10:06:00.000Z'),
    } as ParticipantPassingRecord & { plateNumber: string };
    const secondCrossing = {
      id: 'unknown-plate-2',
      isValid: true,
      plateNumber: '404',
      recordType: RECORD_TX_CROSSING,
      sequence: 2,
      source: 'test-source',
      time: new Date('2026-05-29T10:07:00.000Z'),
    } as ParticipantPassingRecord & { plateNumber: string };
    const otherCrossing = {
      id: 'unknown-plate-3',
      isValid: true,
      plateNumber: '405',
      recordType: RECORD_TX_CROSSING,
      sequence: 3,
      source: 'test-source',
      time: new Date('2026-05-29T10:08:00.000Z'),
    } as ParticipantPassingRecord & { plateNumber: string };
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[]; participants: EventParticipant[] } = {
      categories: [categoryA],
      countTransponderCrossings: () => 0,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categoryId === categoryA.id ? categoryA : undefined,
      getEntrantIdForParticipant: () => undefined,
      getParticipantById: () => undefined,
      getParticipantLaps: () => [],
      getTransponderCrossings: () => [],
      participants: [],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    await act(async () => {
      root.render(
        <RecentRecords
          raceStateLookup={raceStateLookup}
          records={[firstCrossing, secondCrossing, otherCrossing]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
        />
      );
    });

    const firstRow = container.querySelector('tr[data-record-id="unknown-plate-1"]');
    const secondRow = container.querySelector('tr[data-record-id="unknown-plate-2"]');
    const otherRow = container.querySelector('tr[data-record-id="unknown-plate-3"]');
    expect(firstRow).not.toBeNull();
    expect(secondRow).not.toBeNull();
    expect(otherRow).not.toBeNull();

    await act(async () => {
      firstRow!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(firstRow!.className).toContain('selected-row');
    expect(firstRow!.className).toContain('selected-plate-number');
    expect(secondRow!.className).toContain('selected-plate-number');
    expect(otherRow!.className).not.toContain('selected-plate-number');

    await act(async () => {
      secondRow!.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 100,
        clientY: 100,
      }));
    });

    expect(firstRow!.className).not.toContain('selected-row');
    expect(firstRow!.className).toContain('selected-plate-number');
    expect(secondRow!.className).toContain('selected-row');
    expect(secondRow!.className).toContain('selected-plate-number');
    expect(Array.from(document.querySelectorAll('li[role="menuitem"]')).map((item) => item.textContent?.trim()))
      .toEqual(expect.arrayContaining(['Insert record', 'Edit record', 'Exclude crossing']));
  });

  it('renders system-generated green race-start flags inline with crossings', async () => {
    const categoryA: EventCategory = { id: '1', name: 'Category A' };
    const participant: EventParticipant = {
      categoryId: categoryA.id,
      currentResult: undefined,
      entrantId: 'entrant-123',
      firstname: 'Plate',
      id: 'participant-123',
      identifiers: [{ fromTime: undefined, racePlate: '123', toTime: undefined }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Rider',
    };
    const greenFlag = {
      ...createGreenFlagEvent({
        categoryIds: [categoryA.id],
        id: '677318b9-31a4-5606-a7b9-d1a9e2e79499',
        sequence: 1,
        source: 'test-source',
        time: new Date('2026-05-29T09:56:00.000Z'),
      }),
      systemGenerated: true,
    };
    const crossing = {
      id: 'plate-crossing-1',
      isValid: true,
      participantId: participant.id,
      plateNumber: '123',
      recordType: RECORD_TX_CROSSING,
      sequence: 2,
      source: 'test-source',
      time: new Date('2026-05-29T10:06:00.000Z'),
    } as ParticipantPassingRecord & { plateNumber: string };
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[]; participants: EventParticipant[] } = {
      categories: [categoryA],
      countTransponderCrossings: () => 0,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categoryId === categoryA.id ? categoryA : undefined,
      getEntrantIdForParticipant: (participantId) => participantId === participant.id ? participant.entrantId : undefined,
      getParticipantById: (participantId) => participantId === participant.id ? participant : undefined,
      getParticipantLaps: () => [crossing],
      getTransponderCrossings: () => [],
      participants: [participant],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    await act(async () => {
      root.render(
        <RecentRecords
          raceStateLookup={raceStateLookup}
          records={[crossing, greenFlag as unknown as ParticipantPassingRecord]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
        />
      );
    });

    const orderedRowIds = getDisplayedRecordIds(container);
    expect(orderedRowIds).toEqual(['677318b9-31a4-5606-a7b9-d1a9e2e79499', 'plate-crossing-1']);
    expect(container.querySelector('tr[data-record-id="677318b9-31a4-5606-a7b9-d1a9e2e79499"]')?.textContent).toContain('Green flag');
  });

  it('opens the add-record dialog from a passing row and builds a passing record with looked-up entrant details', async () => {
    const categoryA: EventCategory = { id: '1', name: 'Category A' };
    const participant: EventParticipant = {
      categoryId: categoryA.id,
      currentResult: undefined,
      entrantId: 'entrant-101',
      firstname: 'Pat',
      id: 'participant-101',
      identifiers: [
        { fromTime: undefined, racePlate: '101', toTime: undefined },
        { fromTime: undefined, toTime: undefined, txNo: 100101 },
      ] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Rider',
    };
    const team: EventTeam = {
      categoryId: categoryA.id,
      description: '',
      id: 'team-1',
      members: [participant.id],
      name: 'Fast Team',
    };
    const crossing: ParticipantPassingRecord = {
      chipCode: 100101,
      id: 'crossing-1',
      isValid: true,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 1,
      source: 'test-source',
      time: new Date('2026-05-29T10:06:00.000Z'),
    } as ParticipantPassingRecord;
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[]; participants: EventParticipant[]; teams: EventTeam[] } = {
      categories: [categoryA],
      countTransponderCrossings: () => 1,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categoryId === categoryA.id ? categoryA : undefined,
      getEntrantIdForParticipant: (participantId) => participantId === participant.id ? participant.entrantId : undefined,
      getParticipantById: (participantId) => participantId === participant.id ? participant : undefined,
      getParticipantLaps: () => [crossing],
      getTransponderCrossings: () => [],
      participants: [participant],
      teams: [team],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };
    const onAddRecord = vi.fn();

    await act(async () => {
      root.render(
        <RecentRecords
          currentEventId="event-1"
          currentSessionId="session-1"
          onAddRecord={onAddRecord}
          raceStateLookup={raceStateLookup}
          records={[crossing]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
        />
      );
    });

    const row = container.querySelector('tr[data-record-id="crossing-1"]');
    expect(row).not.toBeNull();
    expect(row?.getAttribute('title')).toBe('Record ID: crossing-1');

    await act(async () => {
      row!.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 80,
        clientY: 80,
      }));
    });

    const insertRecordMenuItem = Array.from(document.querySelectorAll('li[role="menuitem"]')).find((item) => item.textContent?.trim() === 'Insert record');
    expect(insertRecordMenuItem).toBeDefined();

    await act(async () => {
      insertRecordMenuItem!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const passingMenuItem = Array.from(document.querySelectorAll('li[role="menuitem"]')).find((item) => item.textContent?.trim() === 'Passing');
    expect(passingMenuItem).toBeDefined();

    await act(async () => {
      passingMenuItem!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const timeInput = document.querySelector('input[aria-label="Time of day"]') as HTMLInputElement | null;
    const txInput = document.querySelector('input[aria-label="TxNo"]') as HTMLInputElement | null;
    const timingLineInput = document.querySelector('input[aria-label="Timing line"]') as HTMLInputElement | null;
    const timingLoopInput = document.querySelector('input[aria-label="Timing loop"]') as HTMLInputElement | null;
    expect(timeInput).toBeTruthy();
    expect(txInput).toBeTruthy();
    expect(timingLineInput).toBeTruthy();
    expect(timingLoopInput).toBeTruthy();
    expect(timeInput!.value).toBe('20:06:00.000');
    expect(txInput!.value).toBe('');
    expect((document.querySelector('input[aria-label="Plate"]') as HTMLInputElement).value).toBe('');

    await act(async () => {
      setInputValue(timeInput!, '10:07:30.250');
      setInputValue(txInput!, '100101');
      setInputValue(timingLineInput!, '1');
      setInputValue(timingLoopInput!, '4');
    });

    expect((document.querySelector('input[aria-label="Plate"]') as HTMLInputElement).value).toBe('101');
    expect((document.querySelector('input[aria-label="Entrant name"]') as HTMLInputElement).value).toBe('Pat Rider');
    expect((document.querySelector('input[aria-label="Team name"]') as HTMLInputElement).value).toBe('Fast Team');
    expect((document.querySelector('input[aria-label="Category name"]') as HTMLInputElement).value).toBe('Category A');

    const addButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Add record');
    expect(addButton).toBeDefined();

    await act(async () => {
      addButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onAddRecord).toHaveBeenCalledTimes(1);
    expect(onAddRecord).toHaveBeenCalledWith(expect.objectContaining({
      chipCode: 100101,
      eventId: 'event-1',
      lineNumber: 1,
      loopNumber: 4,
      plateNumber: '101',
      recordType: RECORD_TX_CROSSING,
      sessionId: 'session-1',
      source: expect.any(String),
    }));
    expect((onAddRecord.mock.calls[0]?.[0] as ParticipantPassingRecord & { time?: Date }).time?.toISOString()).toBe('2026-05-29T00:07:30.250Z');
  });

  it('opens the add-record dialog from a flag row and builds a category-scoped flag record', async () => {
    const categoryA: EventCategory = { id: '1', name: 'Category A' };
    const categoryB: EventCategory = { id: '2', name: 'Category B' };
    const flag: FlagRecord = {
      categoryIds: [categoryA.id],
      flagType: 'green',
      flagValue: 'course',
      id: 'flag-1',
      recordType: 4,
      sequence: 1,
      source: 'test-source',
      time: new Date('2026-05-29T10:00:00.000Z'),
    };
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[] } = {
      categories: [categoryA, categoryB],
      countTransponderCrossings: () => 0,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => [categoryA, categoryB].find((category) => category.id === categoryId),
      getEntrantIdForParticipant: () => undefined,
      getParticipantById: () => undefined,
      getParticipantLaps: () => [],
      getTransponderCrossings: () => [],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };
    const onAddRecord = vi.fn();

    await act(async () => {
      root.render(
        <RecentRecords
          currentEventId="event-1"
          currentSessionId="session-1"
          onAddRecord={onAddRecord}
          raceStateLookup={raceStateLookup}
          records={[flag as unknown as ParticipantPassingRecord]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
        />
      );
    });

    const row = container.querySelector('tr[data-record-id="flag-1"]');
    expect(row).not.toBeNull();

    await act(async () => {
      row!.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 90,
        clientY: 90,
      }));
    });

    const insertRecordMenuItem = Array.from(document.querySelectorAll('li[role="menuitem"]')).find((item) => item.textContent?.trim() === 'Insert record');
    expect(insertRecordMenuItem).toBeDefined();

    await act(async () => {
      insertRecordMenuItem!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const flagMenuItem = Array.from(document.querySelectorAll('li[role="menuitem"]')).find((item) => item.textContent?.trim() === 'Flag');
    expect(flagMenuItem).toBeDefined();

    await act(async () => {
      flagMenuItem!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const recordTypeSelect = document.querySelector('select[aria-label="Record type"]') as HTMLSelectElement | null;
    expect(recordTypeSelect).toBeTruthy();

    expect(recordTypeSelect!.value).toBe('flag');

    const flagTypeSelect = document.querySelector('select[aria-label="Flag type"]') as HTMLSelectElement | null;
    expect(flagTypeSelect).toBeTruthy();
    expect(flagTypeSelect!.value).toBe('yellow');

    await act(async () => {
      setSelectValue(flagTypeSelect!, 'red');
    });

    const categorySelect = document.querySelector('#manual-record-categories') as HTMLElement | null;
    expect(categorySelect).toBeTruthy();

    await act(async () => {
      categorySelect!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    const categoryBOption = Array.from(document.querySelectorAll('li[role="option"]')).find((option) => option.textContent?.includes(categoryB.name));
    expect(categoryBOption).toBeDefined();

    await act(async () => {
      categoryBOption!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const addButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Add record');
    expect(addButton).toBeDefined();

    await act(async () => {
      addButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onAddRecord).toHaveBeenCalledWith(expect.objectContaining({
      categoryIds: [categoryB.id],
      eventId: 'event-1',
      flagType: 'red',
      flagValue: 'course',
      sessionId: 'session-1',
      source: expect.any(String),
    }));
    await waitForNoDialog();
  });

  it('opens the edit-record dialog with existing values populated and saves through the edit callback', async () => {
    const categoryA: EventCategory = { id: '1', name: 'Category A' };
    const participant: EventParticipant = {
      categoryId: categoryA.id,
      currentResult: undefined,
      entrantId: 'entrant-101',
      firstname: 'Pat',
      id: 'participant-101',
      identifiers: [
        { fromTime: undefined, racePlate: '101', toTime: undefined },
        { fromTime: undefined, toTime: undefined, txNo: 100101 },
      ] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Rider',
    };
    const crossing = {
      chipCode: 100101,
      id: 'crossing-1',
      isValid: true,
      lineNumber: 8,
      loopNumber: 2,
      participantId: participant.id,
      plateNumber: '101',
      recordType: RECORD_TX_CROSSING,
      sequence: 1,
      source: createTimeRecordSourceId('mr-scats:W9721:source:W9721R01:W9721R01.DBF'),
      time: new Date('2026-05-29T10:06:00.000Z'),
    } as ParticipantPassingRecord & { plateNumber: string };
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[]; participants: EventParticipant[] } = {
      categories: [categoryA],
      countTransponderCrossings: () => 1,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categoryId === categoryA.id ? categoryA : undefined,
      getEntrantIdForParticipant: (participantId) => participantId === participant.id ? participant.entrantId : undefined,
      getFinishLineNumbers: () => [1, 7],
      getParticipantById: (participantId) => participantId === participant.id ? participant : undefined,
      getParticipantLaps: () => [crossing],
      getTimeRecordSourceById: (sourceId) => sourceId === crossing.source
        ? {
          filePath: 'W9721R01.DBF',
          id: crossing.source,
          name: 'W9721R01.DBF',
        }
        : undefined,
      getTransponderCrossings: () => [],
      participants: [participant],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };
    const onAddRecord = vi.fn();
    const onEditRecord = vi.fn();

    await act(async () => {
      root.render(
        <RecentRecords
          currentEventId="event-1"
          currentSessionId="session-1"
          eventTimeZone="Australia/Sydney"
          onAddRecord={onAddRecord}
          onEditRecord={onEditRecord}
          raceStateLookup={raceStateLookup}
          records={[crossing]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
          timeDisplayZoneMode="event"
        />
      );
    });

    const row = container.querySelector('tr[data-record-id="crossing-1"]');
    expect(row).not.toBeNull();

    await act(async () => {
      row!.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 100,
        clientY: 100,
      }));
    });

    const editRecordMenuItem = Array.from(document.querySelectorAll('li[role="menuitem"]')).find((item) => item.textContent?.trim() === 'Edit record');
    expect(editRecordMenuItem).toBeDefined();

    await act(async () => {
      editRecordMenuItem!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(document.body.textContent).toContain('Edit record');
    expect((document.querySelector('input[aria-label="Record ID"]') as HTMLInputElement).value).toBe('crossing-1');
    expect((document.querySelector('input[aria-label="Time of day"]') as HTMLInputElement).value).toBe('20:06:00.000');
    expect((document.querySelector('input[aria-label="Displayed time zone"]') as HTMLInputElement).value).toBe('Australia/Sydney');
    expect((document.querySelector('input[aria-label="Record date"]') as HTMLInputElement).value).toBe('2026-05-29');
    expect((document.querySelector('input[aria-label="TxNo"]') as HTMLInputElement).value).toBe('100101');
    expect((document.querySelector('input[aria-label="Plate"]') as HTMLInputElement).value).toBe('101');
    expect((document.querySelector('input[aria-label="Timing line"]') as HTMLInputElement).value).toBe('8');
    expect((document.querySelector('input[aria-label="Timing loop"]') as HTMLInputElement).value).toBe('2');
    expect((document.querySelector('input[aria-label="Lap control lines"]') as HTMLInputElement).value).toBe('1, 7');
    expect((document.querySelector('input[aria-label="Lap crossing"]') as HTMLInputElement).value).toBe('No');
    expect((document.querySelector('input[aria-label="Source file"]') as HTMLInputElement).value).toBe('W9721R01.DBF');
    expect(document.querySelector('textarea[aria-label="Record JSON"]')).toBeNull();

    const showRecordJsonButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Show record JSON');
    expect(showRecordJsonButton).toBeDefined();

    await act(async () => {
      showRecordJsonButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const recordJsonField = document.querySelector('textarea[aria-label="Record JSON"]') as HTMLTextAreaElement | null;
    expect(recordJsonField).not.toBeNull();
    expect(recordJsonField?.readOnly).toBe(true);
    expect(recordJsonField?.disabled).toBe(false);
    expect(recordJsonField?.value).toContain('"id": "crossing-1"');
    expect(recordJsonField?.value).toContain('"lineNumber": 8');
    expect(recordJsonField?.value).toContain('"loopNumber": 2');
    expect(recordJsonField?.value).toContain('"time": "2026-05-29T10:06:00.000Z"');

    await act(async () => {
      setInputValue(document.querySelector('input[aria-label="Timing line"]') as HTMLInputElement, '9');
      setInputValue(document.querySelector('input[aria-label="Timing loop"]') as HTMLInputElement, '3');
      setInputValue(document.querySelector('input[aria-label="Time of day"]') as HTMLInputElement, '20:06:30.500');
    });

    const saveButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Save record');
    expect(saveButton).toBeDefined();

    await act(async () => {
      saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onAddRecord).not.toHaveBeenCalled();
    expect(onEditRecord).toHaveBeenCalledTimes(1);
    expect(onEditRecord).toHaveBeenCalledWith(expect.objectContaining({
      chipCode: 100101,
      id: 'crossing-1',
      lineNumber: 9,
      loopNumber: 3,
      plateNumber: '101',
      sequence: 1,
      sessionId: 'session-1',
      source: createTimeRecordSourceId('mr-scats:W9721:source:W9721R01:W9721R01.DBF'),
    }));
    expect((onEditRecord.mock.calls[0]?.[0] as ParticipantPassingRecord & { time?: Date }).time?.toISOString()).toBe('2026-05-29T10:06:30.500Z');
  });

  it('uses the selected recent-records display timezone inside the edit dialog', async () => {
    const categoryA: EventCategory = { id: '1', name: 'Category A' };
    const participant: EventParticipant = {
      categoryId: categoryA.id,
      currentResult: undefined,
      entrantId: 'entrant-101',
      firstname: 'Pat',
      id: 'participant-101',
      identifiers: [{ fromTime: undefined, toTime: undefined, txNo: 100101 }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Rider',
    };
    const crossing = {
      chipCode: 100101,
      id: 'crossing-utc-zone',
      isValid: true,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 1,
      source: 'test-source',
      time: new Date('2026-05-29T10:06:00.000Z'),
    } as ParticipantPassingRecord;
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[]; participants: EventParticipant[] } = {
      categories: [categoryA],
      countTransponderCrossings: () => 1,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categoryId === categoryA.id ? categoryA : undefined,
      getEntrantIdForParticipant: (participantId) => participantId === participant.id ? participant.entrantId : undefined,
      getParticipantById: (participantId) => participantId === participant.id ? participant : undefined,
      getParticipantLaps: () => [crossing],
      getTransponderCrossings: () => [],
      participants: [participant],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    await act(async () => {
      root.render(
        <RecentRecords
          eventTimeZone="Australia/Sydney"
          raceStateLookup={raceStateLookup}
          records={[crossing]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
          timeDisplayZoneMode="gmt"
        />
      );
    });

    expect(container.querySelector('tr[data-record-id="crossing-utc-zone"]')?.textContent).toContain('2026-05-29 10:06:00.000');

    const row = container.querySelector('tr[data-record-id="crossing-utc-zone"]');
    expect(row).not.toBeNull();

    await act(async () => {
      row!.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 100,
        clientY: 100,
      }));
    });

    const editRecordMenuItem = Array.from(document.querySelectorAll('li[role="menuitem"]')).find((item) => item.textContent?.trim() === 'Edit record');
    expect(editRecordMenuItem).toBeDefined();

    await act(async () => {
      editRecordMenuItem!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect((document.querySelector('input[aria-label="Time of day"]') as HTMLInputElement).value).toBe('10:06:00.000');
    expect((document.querySelector('input[aria-label="Displayed time zone"]') as HTMLInputElement).value).toBe('UTC');
    expect((document.querySelector('input[aria-label="Record date"]') as HTMLInputElement).value).toBe('2026-05-29');
  });

  it('shows original T9743R10 DBF filename in the edit-record source file field after NO1 metadata merges', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-recent-'));
    await writeFile(path.join(tempDir, 'PRGMME.DBF'), createDbfBuffer([
      { length: 8, name: 'EV_CODE', type: 'C' },
      { length: 8, name: 'CATEGORY', type: 'C' },
      { length: 60, name: 'EVENTNAME', type: 'C' },
      { length: 8, name: 'STARTDATE', type: 'D' },
      { length: 8, name: 'ACTUALSTRT', type: 'C' },
    ], [
      { ACTUALSTRT: '20:02:29', CATEGORY: 'CAT-A', EVENTNAME: 'Race 10', EV_CODE: 'T9743R10', STARTDATE: '19971206' },
    ]));
    await writeFile(path.join(tempDir, 'DRIVERS.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 8, name: 'DRIV_CLASS', type: 'C' },
      { length: 50, name: 'DRIVER', type: 'C' },
    ], [
      { CARNUMBER: 13, DRIVER: 'Race Ten Driver', DRIV_CLASS: 'CAT-A', TXNUM: 1234 },
    ]));
    await writeFile(path.join(tempDir, 'T9743R10.SRT'), '12348814387450006 071 20:27:45.0006 00\r');
    await writeFile(path.join(tempDir, 'T9743R10.NO1'), createDbfBuffer([
      { length: 4, name: 'CAR', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 9, name: 'ELAPSED', type: 'N' },
      { length: 3, name: 'LINE_NO', type: 'N' },
      { length: 3, name: 'LANE_NO', type: 'N' },
    ], [
      { CAR: 13, ELAPSED: 200000, LANE_NO: 2, LINE_NO: 3, TXNUM: 1234 },
    ]));
    await writeFile(path.join(tempDir, 'T9743R10.DBF'), createDbfBuffer([
      { length: 4, name: 'CARNUMBER', type: 'N' },
      { length: 4, name: 'TXNUM', type: 'N' },
      { length: 9, name: 'ELAPSED', type: 'N' },
      { length: 4, name: 'COUNTER', type: 'N' },
    ], [
      { CARNUMBER: 13, COUNTER: 1, ELAPSED: 300000, TXNUM: 1234 },
    ]));
    const imported = await loadMrScatsCatalogFromLocation(tempDir);
    const session = new Session({
      categories: imported.raceState.categories || [],
      participants: imported.raceState.participants || [],
      records: imported.raceState.records || [],
      teams: imported.raceState.teams || [],
      timeRecordSources: imported.raceState.timeRecordSources || [],
    });
    const sourceFileById = new Map(session.timeRecordSources.map((source) => [source.id, source.filePath || source.name]));
    const crossingBySourceFile = new Map(
      (session.records as ParticipantPassingRecord[])
        .filter((record) => record.recordType === RECORD_TX_CROSSING)
        .map((record) => [sourceFileById.get(record.source), record] as const)
    );

    await act(async () => {
      root.render(
        <RecentRecords
          raceStateLookup={session}
          records={session.records as EventTimeRecord[]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
        />
      );
    });

    for (const expectedFileName of ['T9743R10.DBF']) {
      const record = crossingBySourceFile.get(expectedFileName);
      expect(record, expectedFileName).toBeDefined();
      const row = container.querySelector(`tr[data-record-id="${record!.id}"]`);
      expect(row).not.toBeNull();

      await act(async () => {
        row!.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 100,
          clientY: 100,
        }));
      });

      const editRecordMenuItem = Array.from(document.querySelectorAll('li[role="menuitem"]')).find((item) => item.textContent?.trim() === 'Edit record');
      expect(editRecordMenuItem).toBeDefined();

      await act(async () => {
        editRecordMenuItem!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect((document.querySelector('input[aria-label="Source"]') as HTMLInputElement).value).toBe(expectedFileName);
      expect((document.querySelector('input[aria-label="Source file"]') as HTMLInputElement).value).toBe(expectedFileName);
      expect((document.querySelector('input[aria-label="Source record"]') as HTMLInputElement).value).toBe('Record/line 1');

      const cancelButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Cancel');
      expect(cancelButton).toBeDefined();
      await act(async () => {
        cancelButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }
  });

  it('renders transmitter timing points with confidence factor and hit count in the antenna field', async () => {
    const categoryA: EventCategory = { id: '1', name: 'Category A' };
    const participant: EventParticipant = {
      categoryId: categoryA.id,
      currentResult: undefined,
      entrantId: 'entrant-101',
      firstname: 'Pat',
      id: 'participant-101',
      identifiers: [
        { fromTime: undefined, racePlate: '101', toTime: undefined },
        { fromTime: undefined, toTime: undefined, txNo: 100101 },
      ] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Rider',
    };
    const crossing = {
      chipCode: 100101,
      confidenceFactor: 255,
      hitCount: 4,
      id: 'crossing-with-confidence',
      isValid: true,
      lineNumber: 3,
      loopNumber: 6,
      originRecordNumber: 17,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 1,
      source: 'test-source',
      time: new Date('2026-05-29T10:06:00.000Z'),
    } as ParticipantPassingRecord;
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[]; participants: EventParticipant[] } = {
      categories: [categoryA],
      countTransponderCrossings: () => 1,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categoryId === categoryA.id ? categoryA : undefined,
      getEntrantIdForParticipant: (participantId) => participantId === participant.id ? participant.entrantId : undefined,
      getParticipantById: (participantId) => participantId === participant.id ? participant : undefined,
      getParticipantLaps: () => [crossing],
      getTimeRecordSourceById: (sourceId) => sourceId === crossing.source ? {
        ctcTrackConfig: {
          eventDescriptions: {},
          networks: [{
            lines: [{
              line: 3,
              loops: [{ card: 2, comPort: 1, loopNumber: 6, siteAddress: 64 }],
              name: 'Pit Exit : Pits',
            }],
            name: 'South Network',
          }],
        },
        description: 'Imported MR-SCATS timing records from T9743R10.DBF.',
        filePath: 'T9743R10.DBF',
        id: crossing.source,
        name: 'MR-SCATS T9743R10.DBF',
      } : undefined,
      getTransponderCrossings: () => [],
      participants: [participant],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    await act(async () => {
      root.render(
        <RecentRecords
          raceStateLookup={raceStateLookup}
          records={[crossing]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
        />
      );
    });

    const row = container.querySelector('tr[data-record-id="crossing-with-confidence"]');
    expect(row).not.toBeNull();
    const cells = Array.from(row!.querySelectorAll('td'));
    expect(cells[1]?.textContent).toBe('3:6 (255.4)Pit Exit : Pits');
    expect(cells[1]?.querySelector('.recent-records-timing-line-name')?.textContent).toBe('Pit Exit : Pits');
    expect(cells[1]?.getAttribute('title')).toBe([
      'Data source: MR-SCATS T9743R10.DBF',
      'File: T9743R10.DBF',
      'Record/line 17',
    ].join('\n'));
  });

  it('shows an exclusion reason marker on unrelated lap-time records', async () => {
    const category: EventCategory = { id: 'category-1', name: 'Category A' };
    const participant: EventParticipant = {
      categoryId: category.id,
      currentResult: undefined,
      entrantId: 'entrant-101',
      firstname: 'Pat',
      id: 'participant-101',
      identifiers: [{ fromTime: undefined, racePlate: '101', toTime: undefined }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Rider',
    };
    const crossing = {
      chipCode: 100101,
      id: 'under-minimum-crossing',
      isExcluded: true,
      isValid: false,
      lapTime: 59999,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 1,
      source: 'test-source',
      time: new Date('2026-05-29T10:00:59.999Z'),
      unrelatedReason: 'Lap time is below minimum of 1:00.0000.',
      unrelatedReasonCode: 'lap-under-minimum',
    } as ParticipantPassingRecord;
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[] } = {
      categories: [category],
      countTransponderCrossings: () => 1,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categoryId === category.id ? category : undefined,
      getEntrantIdForParticipant: (participantId) => participantId === participant.id ? participant.entrantId : undefined,
      getParticipantById: (participantId) => participantId === participant.id ? participant : undefined,
      getParticipantLaps: () => [crossing],
      getTransponderCrossings: () => [],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    await act(async () => {
      root.render(
        <RecentRecords
          raceStateLookup={raceStateLookup}
          records={[crossing]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
        />
      );
    });

    const row = container.querySelector('tr[data-record-id="under-minimum-crossing"]');
    const cells = Array.from(row?.querySelectorAll('td') || []).map((cell) => cell.textContent || '');
    expect(row?.className).toContain('excluded');

    await act(async () => {
      row?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(row?.className).toContain('selected-row');
    expect(row?.className).toContain('excluded');
    expect(cells[cells.length - 1]).toContain('0:59.999');
    expect(row?.querySelector('.unrelated-reason-marker')?.textContent).toBe('!');
    expect(row?.querySelector('.unrelated-reason-marker')?.getAttribute('aria-label')).toBe('Lap time is below minimum of 1:00.0000.');
  });

  it('shows sector crossing elapsed lap time without an under-minimum warning marker', async () => {
    const category: EventCategory = { id: 'category-1', name: 'Category A' };
    const participant: EventParticipant = {
      categoryId: category.id,
      currentResult: undefined,
      entrantId: 'entrant-101',
      firstname: 'Pat',
      id: 'participant-101',
      identifiers: [{ fromTime: undefined, racePlate: '101', toTime: undefined }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Rider',
    };
    const crossing = {
      chipCode: 100101,
      elapsedTime: 30000,
      id: 'sector-under-minimum-crossing',
      isExcluded: false,
      isLapCompletion: false,
      isValid: true,
      lapNo: 0,
      lapTime: 30000,
      lineNumber: 5,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 1,
      source: 'test-source',
      startingLapRecordId: 'start-flag',
      time: new Date('2026-05-29T10:00:30.000Z'),
    } as ParticipantPassingRecord;
    const finishLineCrossing = {
      chipCode: 100101,
      elapsedTime: 90000,
      id: 'finish-line-crossing',
      isValid: true,
      lapNo: 1,
      lapTime: 90000,
      lineNumber: 1,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 2,
      source: 'test-source',
      startingLapRecordId: 'start-flag',
      time: new Date('2026-05-29T10:01:30.000Z'),
    } as ParticipantPassingRecord;
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[] } = {
      categories: [category],
      countTransponderCrossings: () => 1,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categoryId === category.id ? category : undefined,
      getEntrantIdForParticipant: (participantId) => participantId === participant.id ? participant.entrantId : undefined,
      getFinishLineNumbers: () => [1],
      getParticipantById: (participantId) => participantId === participant.id ? participant : undefined,
      getParticipantLaps: () => [crossing, finishLineCrossing],
      getTransponderCrossings: () => [],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    await act(async () => {
      root.render(
        <RecentRecords
          raceStateLookup={raceStateLookup}
          records={[crossing, finishLineCrossing]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
        />
      );
    });

    const row = container.querySelector('tr[data-record-id="sector-under-minimum-crossing"]');
    const cells = Array.from(row?.querySelectorAll('td') || []).map((cell) => cell.textContent || '');

    expect(row?.className).not.toContain('excluded');
    expect(row?.querySelector('.unrelated-reason-marker')).toBeNull();
    expect(cells[8]).toBe('0:30.000');
    expect(cells[cells.length - 1]).toBe('0:30.000');
  });

  it('shows a non-finish loop 1 crossing as lap time so far when no lap flag is set', async () => {
    const category: EventCategory = { id: 'category-1', name: 'Category A' };
    const participant: EventParticipant = {
      categoryId: category.id,
      currentResult: undefined,
      entrantId: 'entrant-101',
      firstname: 'Pat',
      id: 'participant-101',
      identifiers: [{ fromTime: undefined, racePlate: '101', toTime: undefined }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Rider',
    };
    const crossing = {
      chipCode: 100101,
      elapsedTime: 30000,
      id: 'sector-loop-one-no-lap-flag-crossing',
      isValid: true,
      lapNo: 0,
      lapTime: 30000,
      lineNumber: 5,
      loopNumber: 1,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 1,
      source: 'test-source',
      startingLapRecordId: 'start-flag',
      time: new Date('2026-05-29T10:00:30.000Z'),
    } as ParticipantPassingRecord;
    const finishLineCrossing = {
      chipCode: 100101,
      elapsedTime: 90000,
      id: 'sector-loop-one-finish-line-reference',
      isValid: true,
      lapNo: 1,
      lapTime: 90000,
      lineNumber: 1,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 2,
      source: 'test-source',
      startingLapRecordId: 'start-flag',
      time: new Date('2026-05-29T10:01:30.000Z'),
    } as ParticipantPassingRecord;
    const raceStateLookup: RaceStateLookup & { categories: EventCategory[] } = {
      categories: [category],
      countTransponderCrossings: () => 1,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categoryId === category.id ? category : undefined,
      getEntrantIdForParticipant: (participantId) => participantId === participant.id ? participant.entrantId : undefined,
      getFinishLineNumbers: () => [1],
      getParticipantById: (participantId) => participantId === participant.id ? participant : undefined,
      getParticipantLaps: () => [crossing, finishLineCrossing],
      getTransponderCrossings: () => [],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    await act(async () => {
      root.render(
        <RecentRecords
          raceStateLookup={raceStateLookup}
          records={[crossing, finishLineCrossing]}
          selectedCategories={new Set()}
          selectedParticipants={new Set()}
        />
      );
    });

    const row = container.querySelector('tr[data-record-id="sector-loop-one-no-lap-flag-crossing"]');
    const cells = Array.from(row?.querySelectorAll('td') || []).map((cell) => cell.textContent || '');

    expect(row?.className).not.toContain('excluded');
    expect(row?.querySelector('.unrelated-reason-marker')).toBeNull();
    expect(cells[8]).toBe('0:30.000');
    expect(cells[cells.length - 1]).toBe('0:30.000');
  });
});
