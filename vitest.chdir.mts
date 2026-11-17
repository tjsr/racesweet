import type { JSDOM } from 'jsdom';
import { useStderrGuard } from './src/testing/stderrGuard.js';

useStderrGuard();

// Polyfill ResizeObserver for jsdom environments (not provided by jsdom)
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (typeof document !== 'undefined') {
  const browserEnvironment: JSDOM = (globalThis as typeof globalThis & { jsdom: JSDOM }).jsdom;
  beforeEach((): void => {
    // Node's host storage can shadow jsdom's storage when Vitest populates globals.
    vi.stubGlobal('localStorage', browserEnvironment.window.localStorage);
  });
  // Mock matchMedia for jsdom environments (not provided by jsdom)
  if (typeof window.matchMedia === 'undefined') {
    window.matchMedia = () => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    });
  }
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    delete (window as any).api;
  });
}
