// @vitest-environment jsdom

import { flushSync } from 'react-dom';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { RuntimeInformationPanel } from './runtimeInformation.js';

describe('RuntimeInformationPanel', () => {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach(() => {
    root?.unmount();
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it('renders the runtime versions list', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    flushSync(() => {
      root?.render(
        <RuntimeInformationPanel
          runtimeVersions={{
            chromium: '123.4.5',
            electron: '34.5.6',
            node: '22.14.0',
          }}
        />
      );
    });

    expect(container.textContent).toContain('Runtime Information');
    expect(container.textContent).toContain('Electron: 34.5.6');
    expect(container.textContent).toContain('Node.js: 22.14.0');
    expect(container.textContent).toContain('Chromium: 123.4.5');
  });
});
