import { afterEach, vi } from "vitest";
import { useStderrGuard } from './src/testing/stderrGuard';

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
