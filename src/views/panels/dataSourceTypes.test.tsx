// @vitest-environment jsdom

import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataSourceTypesPanel } from './dataSourceTypes.js';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('DataSourceTypesPanel', () => {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it('renders the source type chooser and creates the selected source type', async () => {
    const onCreateSource = vi.fn();
    const onChangeNewSourceType = vi.fn();
    container = document.createElement('div');
    document.body.append(container);
    act(() => {
      root = createRoot(container!);
      root?.render(
        <DataSourceTypesPanel
          newSourceType="api-apical-excel-file"
          onChangeNewSourceType={onChangeNewSourceType}
          onCreateSource={onCreateSource}
        />,
      );
    });

    expect(container.textContent).toContain('Data Source Type');
    expect(container.textContent).toContain('Add Data Source');
    const select = container.querySelector<HTMLElement>('[aria-label="New Data Source Type"]')!;
    expect(select.getAttribute('role')).toBe('combobox');
    expect(select.textContent).toContain('Apical Excel data');

    await act(async () => {
      select.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    const options = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'));
    expect(options.map((option) => option.textContent)).toContain('Apical Recent Laps');
    expect(options.map((option) => option.textContent)).toContain('MR-SCATS Data');
    expect(options.map((option) => option.textContent)).toContain('Dorian CTC SRT / ERF File');
    expect(options.map((option) => option.textContent)).toContain('DURT FileMaker Database');
    const ledgerOption = options.find((option) => option.textContent === 'RaceSweet Ledger')!;
    await act(async () => {
      ledgerOption.click();
    });
    expect(onChangeNewSourceType).toHaveBeenCalledWith('file-racesweet-ledger');

    const button = Array.from(container.querySelectorAll('button')).find((element) => element.textContent === 'Add Data Source');
    expect(button).toBeDefined();
    await act(async (): Promise<void> => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(onCreateSource).toHaveBeenCalledWith('api-apical-excel-file');
  });
});
