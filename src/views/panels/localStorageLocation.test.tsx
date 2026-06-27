// @vitest-environment jsdom

import { flushSync } from 'react-dom';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageLocationPanel } from './localStorageLocation.js';

describe('LocalStorageLocationPanel', () => {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach(() => {
    root?.unmount();
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it('renders the local storage section', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    flushSync(() => {
      root?.render(
        <LocalStorageLocationPanel
          localStorageDirectoryPath="C:/dev/racesweet/cache"
          onSaveLocalStorageDirectoryPath={vi.fn()}
        />,
      );
    });

    const input = container.querySelector('input[aria-label="Local Storage Directory"]') as HTMLInputElement;
    expect(container.textContent).toContain('Local storage location');
    expect(container.textContent).toContain('Storage Directory');
    expect(input.value).toBe('C:/dev/racesweet/cache');
  });

  it('does not commit when the value is unchanged', () => {
    const onSaveLocalStorageDirectoryPath = vi.fn();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    flushSync(() => {
      root?.render(
        <LocalStorageLocationPanel
          localStorageDirectoryPath="C:/dev/racesweet/cache"
          onSaveLocalStorageDirectoryPath={onSaveLocalStorageDirectoryPath}
        />,
      );
    });

    const input = container.querySelector('input[aria-label="Local Storage Directory"]') as HTMLInputElement;
    input.dispatchEvent(new Event('blur', { bubbles: true }));

    expect(onSaveLocalStorageDirectoryPath).not.toHaveBeenCalled();
  });
});
