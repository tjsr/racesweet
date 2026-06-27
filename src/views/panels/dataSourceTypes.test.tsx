// @vitest-environment jsdom

import { flushSync } from 'react-dom';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataSourceTypesPanel } from './dataSourceTypes.js';

describe('DataSourceTypesPanel', () => {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach(() => {
    root?.unmount();
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it('renders the source type chooser and creates the selected source type', () => {
    const onCreateSource = vi.fn();
    const onChangeNewSourceType = vi.fn();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    flushSync(() => {
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

    const select = container.querySelector('select[aria-label="New Data Source Type"]') as HTMLSelectElement;
    expect(select.value).toBe('api-apical-excel-file');

    select.value = 'file-racesweet-ledger';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onChangeNewSourceType).toHaveBeenCalledWith('file-racesweet-ledger');

    const button = Array.from(container.querySelectorAll('button')).find((element) => element.textContent === 'Add Data Source');
    expect(button).toBeDefined();
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onCreateSource).toHaveBeenCalledWith('api-apical-excel-file');
  });
});
