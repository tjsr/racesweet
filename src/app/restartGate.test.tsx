// @vitest-environment jsdom

import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { RestartGate } from './restartGate.js';
import { useUiConsoleGuards } from '../testing/uiConsoleGuards.js';

describe('RestartGate', () => {
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

  it('allows the application to render when its launch version is current', async () => {
    await act(async () => {
      root.render(
        <RestartGate
          getLaunchedVersion={async (): Promise<string> => '2026-07-29T00:00:01.000Z'}
          requiredVersion="2026-07-29T00:00:00.000Z"
        >
          <div>RaceSweet application</div>
        </RestartGate>,
      );
    });

    expect(container.textContent).toContain('RaceSweet application');
    expect(document.body.textContent).not.toContain('RaceSweet must be restarted');
  });

  it('blocks the application when renderer code is newer than the launched process', async () => {
    await act(async () => {
      root.render(
        <RestartGate
          getLaunchedVersion={async (): Promise<string> => '2026-07-29T00:00:00.000Z'}
          requiredVersion="2026-07-29T00:00:01.000Z"
        >
          <div>RaceSweet application</div>
        </RestartGate>,
      );
    });

    expect(container.textContent).toContain('RaceSweet application');
    expect(document.body.textContent).toContain('RaceSweet must be restarted');
    expect(document.body.textContent).toContain('Reloading this page is not sufficient');
  });
});
