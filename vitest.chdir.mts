import process from "process";
import { vi } from "vitest";

// const pathValue = new URL(".", import.meta.url).pathname;
// const pathValue = new URL(".", __filename).pathname;
// vi.spyOn(process, "cwd").mockReturnValue(pathValue);

// Polyfill ResizeObserver for jsdom environments (not provided by jsdom)
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
