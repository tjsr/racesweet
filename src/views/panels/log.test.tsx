// @vitest-environment jsdom

import { flushSync } from 'react-dom';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { LogPanel } from './log.js';

describe('LogPanel', () => {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach(() => {
    root?.unmount();
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it('renders the application error log as read-only text', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    const displayedErrorLog = [
      '[2026-06-23T01:02:03.004Z] Application',
      'Error: Catalog ledger could not be written',
    ].join('\n');

    flushSync(() => {
      root?.render(<LogPanel displayedErrorLog={displayedErrorLog} />);
    });

    const textarea = container.querySelector('textarea[aria-label="Application Error Log"]') as HTMLTextAreaElement;
    expect(container.textContent).toContain('Log');
    expect(textarea.readOnly).toBe(true);
    expect(textarea.value).toBe(displayedErrorLog);
  });
});
