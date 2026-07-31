// @vitest-environment jsdom

import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { CredentialsForm, StartupConnectionFailure } from './authenticatedApp.js';
import { loadSavedLoginCredentials, saveLoginCredentials } from './savedLoginCredentials.js';

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

describe('CredentialsForm', () => {
  beforeEach((): void => {
    localStorage.clear();
  });

  it('prefills and checks Save credentials when credentials were saved', () => {
    saveLoginCredentials({ password: 'correct horse battery staple', username: 'admin' });
    const container: HTMLDivElement = document.createElement('div');
    const root: Root = createRoot(container);

    act((): void => {
      root.render(
        <CredentialsForm
          onSubmit={vi.fn((): Promise<boolean> => Promise.resolve(true))}
          setupRequired={false}
        />,
      );
    });

    const usernameInput: HTMLInputElement | null = container.querySelector(
      'input[autocomplete="username"]',
    );
    const passwordInput: HTMLInputElement | null = container.querySelector('input[type="password"]');
    const saveCredentialsCheckbox: HTMLInputElement | null = container.querySelector('input[type="checkbox"]');
    expect(usernameInput?.value).toBe('admin');
    expect(passwordInput?.value).toBe('correct horse battery staple');
    expect(saveCredentialsCheckbox?.checked).toBe(true);

    act((): void => root.unmount());
  });

  it('clears saved credentials when Save credentials is unchecked after sign-in', async () => {
    saveLoginCredentials({ password: 'correct horse battery staple', username: 'admin' });
    const container: HTMLDivElement = document.createElement('div');
    const root: Root = createRoot(container);
    const onSubmit = vi.fn((): Promise<boolean> => Promise.resolve(true));

    act((): void => {
      root.render(<CredentialsForm onSubmit={onSubmit} setupRequired={false} />);
    });

    const saveCredentialsCheckbox: HTMLInputElement | null = container.querySelector('input[type="checkbox"]');
    const form: HTMLFormElement | null = container.querySelector('form');
    await act(async (): Promise<void> => {
      saveCredentialsCheckbox?.click();
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(onSubmit).toHaveBeenCalledWith({
      password: 'correct horse battery staple',
      username: 'admin',
    });
    expect(loadSavedLoginCredentials()).toBeUndefined();

    act((): void => root.unmount());
  });
});
