// @vitest-environment jsdom

import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContextualHelpOverlay } from './ContextualHelpOverlay.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const createRect = (left: number, top: number, width: number, height: number): DOMRect => ({
  bottom: top + height,
  height,
  left,
  right: left + width,
  toJSON: (): Record<string, never> => ({}),
  top,
  width,
  x: left,
  y: top,
});

describe('contextual help overlay', (): void => {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach((): void => {
    act((): void => root?.unmount());
    container?.remove();
    vi.unstubAllGlobals();
  });

  it('places each help button immediately beside its control in the viewport', async (): Promise<void> => {
    vi.stubGlobal('ResizeObserver', class {
      observe = (): void => undefined;
      disconnect = (): void => undefined;
    });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', (): void => undefined);
    Object.defineProperties(window, {
      innerHeight: { configurable: true, value: 800 },
      innerWidth: { configurable: true, value: 1200 },
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async (): Promise<void> => root?.render(<ContextualHelpOverlay section="Results">
      <button aria-label="Results filter" type="button">Filter</button>
    </ContextualHelpOverlay>));
    const control: HTMLButtonElement = container.querySelector('[aria-label="Results filter"]')!;
    vi.spyOn(control, 'getBoundingClientRect').mockReturnValue(createRect(100, 200, 160, 40));
    await act(async (): Promise<void> => {
      window.dispatchEvent(new Event('resize'));
    });

    const helpButton: HTMLButtonElement = container.querySelector('[aria-label="Help for Action: Results filter"]')!;
    expect(helpButton.style.left).toBe('264px');
    expect(helpButton.style.top).toBe('207px');
  });

  it('uses the control\'s left side when there is no room on the right', async (): Promise<void> => {
    vi.stubGlobal('ResizeObserver', class {
      observe = (): void => undefined;
      disconnect = (): void => undefined;
    });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', (): void => undefined);
    Object.defineProperties(window, {
      innerHeight: { configurable: true, value: 800 },
      innerWidth: { configurable: true, value: 300 },
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async (): Promise<void> => root?.render(<ContextualHelpOverlay section="Results">
      <button aria-label="Results filter" type="button">Filter</button>
    </ContextualHelpOverlay>));
    const control: HTMLButtonElement = container.querySelector('[aria-label="Results filter"]')!;
    vi.spyOn(control, 'getBoundingClientRect').mockReturnValue(createRect(230, 200, 60, 40));
    await act(async (): Promise<void> => {
      window.dispatchEvent(new Event('resize'));
    });

    const helpButton: HTMLButtonElement = container.querySelector('[aria-label="Help for Action: Results filter"]')!;
    expect(helpButton.style.left).toBe('200px');
    expect(helpButton.style.top).toBe('207px');
  });

  it('does not render help for controls outside the viewport', async (): Promise<void> => {
    vi.stubGlobal('ResizeObserver', class {
      observe = (): void => undefined;
      disconnect = (): void => undefined;
    });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', (): void => undefined);
    Object.defineProperties(window, {
      innerHeight: { configurable: true, value: 800 },
      innerWidth: { configurable: true, value: 1200 },
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async (): Promise<void> => root?.render(<ContextualHelpOverlay section="Results">
      <button aria-label="Results filter" type="button">Filter</button>
    </ContextualHelpOverlay>));
    const control: HTMLButtonElement = container.querySelector('[aria-label="Results filter"]')!;
    vi.spyOn(control, 'getBoundingClientRect').mockReturnValue(createRect(100, 900, 160, 40));
    await act(async (): Promise<void> => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(container.querySelector('[aria-label="Help for Action: Results filter"]')).toBeNull();
  });
});
