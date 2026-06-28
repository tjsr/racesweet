// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { useUiConsoleGuards } from '../../testing/uiConsoleGuards.js';
import { ReloadSummaryDialog } from './reloadSummaryDialog.js';

describe('ReloadSummaryDialog', () => {
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

  it('displays the summary values it is provided', async () => {
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        <ReloadSummaryDialog
          onClose={onClose}
          summary={{
            categories: { created: 1, deleted: 2, updated: 3 },
            crossings: { created: 13, deleted: 14, updated: 15 },
            flags: { created: 10, deleted: 11, updated: 12 },
            participants: { created: 4, deleted: 5, updated: 6 },
            teams: { created: 7, deleted: 8, updated: 9 },
          }}
        />
      );
    });

    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('Data Reloaded');
    const rows = Array.from(container.querySelectorAll('tbody tr')).map((row) => (
      Array.from(row.querySelectorAll('th, td')).map((cell) => cell.textContent)
    ));

    expect(rows).toEqual([
      ['Categories', '1', '2', '3'],
      ['Participants', '4', '5', '6'],
      ['Teams', '7', '8', '9'],
      ['Flag records', '10', '11', '12'],
      ['Crossings', '13', '14', '15'],
    ]);

    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Close')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
