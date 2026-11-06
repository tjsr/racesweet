// @vitest-environment jsdom

import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResponsiveSectionNavigation } from './ResponsiveSectionNavigation.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('responsive section navigation', (): void => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;
  afterEach((): void => {
    act((): void => root?.unmount());
    container?.remove();
    vi.unstubAllGlobals();
  });

  it.each([false, true])('uses the same selected section and callback with phone=%s', async (phone: boolean): Promise<void> => {
    vi.stubGlobal('matchMedia', (_query: string): MediaQueryList => ({
      addEventListener: (): void => undefined,
      addListener: (): void => undefined,
      dispatchEvent: (): boolean => false,
      matches: phone,
      media: _query,
      onchange: null,
      removeEventListener: (): void => undefined,
      removeListener: (): void => undefined,
    }));
    const select = vi.fn<(value: 'events' | 'timing') => void>();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async (): Promise<void> => root?.render(<ResponsiveSectionNavigation
      items={[{ icon: 'E', id: 'events', label: 'Events' }, { icon: 'T', id: 'timing', label: 'Timing' }]}
      onSelect={select} selectedId="events" />));
    if (phone) {
      expect(document.querySelector('nav[aria-label="Application sections"]')).toBeNull();
      const menu: HTMLButtonElement = container.querySelector('[aria-label="Open section navigation"]')!;
      await act(async (): Promise<void> => menu.click());
    }
    const selected: HTMLElement = document.querySelector('nav [aria-current="page"]')!;
    expect(selected.getAttribute('aria-label')).toBe('Events');
    const timing: HTMLButtonElement = document.querySelector('nav button[aria-label="Timing"]')!;
    await act(async (): Promise<void> => timing.click());
    expect(select).toHaveBeenCalledWith('timing');
  });
});
