// @vitest-environment jsdom

import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { createEventEntrantId, createEventParticipantId, createTimeRecordSourceId } from '../../model/ids.js';
import type { ParticipantPassingRecord } from '../../model/timerecord.js';
import { useUiConsoleGuards } from '../../testing/uiConsoleGuards.js';
import { LapTimesReport, type LapTimesReportEntry } from './LapTimesReport.js';

const setSelectValue = (select: HTMLSelectElement, value: string): void => {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  descriptor?.set?.call(select, value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
};

const createLap = (id: string): ParticipantPassingRecord => ({
  elapsedTime: 65000,
  entrantId: createEventEntrantId('entrant-42'),
  id,
  isExcluded: false,
  isValid: true,
  lapNo: 1,
  lapTime: 65000,
  participantId: createEventParticipantId('participant-42'),
  recordType: 16,
  sequence: 1,
  source: createTimeRecordSourceId('source-1'),
  time: new Date('2026-06-12T10:00:01.000Z'),
});

describe('LapTimesReport', () => {
  let container: HTMLDivElement;
  let root: Root;

  useUiConsoleGuards();

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    global.ResizeObserver = class MockResizeObserver implements ResizeObserver {
      disconnect = vi.fn();
      observe = vi.fn();
      unobserve = vi.fn();
    };
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
  });

  it('shows the participant plate number in the table view identifier column', async () => {
    const participants: LapTimesReportEntry[] = [
      {
        categoryIds: ['category-1'],
        id: createEventEntrantId('entrant-42'),
        name: 'Plate Rider',
        raceNumber: '42',
      },
    ];
    const passings = new Map<string, ParticipantPassingRecord[]>([
      [createEventEntrantId('entrant-42'), [createLap('lap-1')]],
    ]);

    await act(async () => {
      root.render(
        <LapTimesReport
          categories={[{ id: 'category-1', name: 'Category 1' }]}
          participants={participants}
          passings={passings}
        />,
      );
    });

    const showAsSelect = container.querySelector('.lap-times-report__toolbar select') as HTMLSelectElement;
    await act(async () => {
      setSelectValue(showAsSelect, 'table');
    });

    const table = container.querySelector('table.lap-times-block-table') as HTMLTableElement;
    expect(table).toBeTruthy();
    expect(Array.from(table.querySelectorAll('tbody tr:first-child td')).map((cell) => cell.textContent)).toEqual([
      '42',
      'Plate Rider',
      '1:05.000',
    ]);
    expect(table.textContent).not.toContain(createEventEntrantId('entrant-42'));
  });

  it('labels the participant selector with driver names and the table with recorded team drivers', async () => {
    const teamId = createEventEntrantId('team-rocket');
    const firstParticipantId = createEventParticipantId('team-driver-1');
    const participantId = createEventParticipantId('team-driver-2');
    const participants: LapTimesReportEntry[] = [{
      categoryIds: ['category-1'],
      id: teamId,
      name: 'Team Rocket',
      participantIds: [firstParticipantId, participantId],
      participantNames: ['Alex SMITH', 'Casey JONES'],
      raceNumber: '42',
      teamName: 'Team Rocket',
    }];
    const passings = new Map<string, ParticipantPassingRecord[]>([
      [teamId, [{ ...createLap('team-lap'), participantId }]],
    ]);

    await act(async () => {
      root.render(
        <LapTimesReport
          categories={[{ id: 'category-1', name: 'Category 1' }]}
          participants={participants}
          passings={passings}
        />,
      );
    });

    const participantOption = container.querySelector('option[value="' + teamId + '"]');
    expect(participantOption?.textContent).toBe('[#42] Alex SMITH/Casey JONES');

    const showAsSelect = container.querySelector('.lap-times-report__toolbar select') as HTMLSelectElement;
    await act(async () => {
      setSelectValue(showAsSelect, 'table');
    });

    const rowCells = container.querySelectorAll('table.lap-times-block-table tbody tr:first-child td');
    expect(rowCells[0]?.textContent).toBe('42');
    expect(rowCells[1]?.textContent).toBe('Team Rocket (Casey JONES)');
  });
});
