// @vitest-environment jsdom

import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { StartupConnectionFailure } from './authenticatedApp.js';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('StartupConnectionFailure', () => {
  it('shows request context and lets the user retry', () => {
    const container: HTMLDivElement = document.createElement('div');
    const root: Root = createRoot(container);
    const retry: () => void = vi.fn();

    act((): void => {
      root.render(
        <StartupConnectionFailure
          endpoint="http://127.0.0.1:4567/api/v1/auth/status"
          error="TypeError: Failed to fetch"
          onRetry={retry}
        />,
      );
    });

    expect(container.textContent).toContain('Unable to connect to the RaceSweet server');
    expect(container.textContent).toContain(
      'Request: GET http://127.0.0.1:4567/api/v1/auth/status',
    );
    expect(container.textContent).toContain('Error: TypeError: Failed to fetch');

    const retryButton: HTMLButtonElement | null = container.querySelector('button');
    expect(retryButton?.textContent).toBe('Retry connection');
    act((): void => retryButton?.click());
    expect(retry).toHaveBeenCalledOnce();

    act((): void => root.unmount());
  });
});
