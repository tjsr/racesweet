// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mountApp, startApp } from './mount';

vi.mock('./App', () => ({
  RaceSweetMainApp: () => React.createElement('div', { 'data-testid': 'app-root' }, 'RaceSweet App'),
}));

describe('mountApp', () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('renders the app into the given container without throwing', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      mountApp(container);
    });
    expect(container.innerHTML).not.toBe('');
  });

  it('renders a React element into the given container', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      mountApp(container);
    });
    expect(container.querySelector('[data-testid="app-root"]')).not.toBeNull();
  });
});

describe('startApp', () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    vi.restoreAllMocks();
  });

  it('mounts the app into #app when the element exists', async () => {
    const appDiv = document.createElement('div');
    appDiv.id = 'app';
    document.body.appendChild(appDiv);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await act(async () => {
      startApp();
    });

    expect(consoleSpy).not.toHaveBeenCalled();
    expect(appDiv.innerHTML).not.toBe('');
  });

  it('renders a React element into #app when it exists', async () => {
    const appDiv = document.createElement('div');
    appDiv.id = 'app';
    document.body.appendChild(appDiv);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await act(async () => {
      startApp();
    });

    expect(appDiv.querySelector('[data-testid="app-root"]')).not.toBeNull();
  });

  it('logs a descriptive console error when #app element is missing', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    startApp();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[RaceSweet]'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('id="app"'));
  });

  it('does not throw when #app element is missing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => startApp()).not.toThrow();
  });
});
