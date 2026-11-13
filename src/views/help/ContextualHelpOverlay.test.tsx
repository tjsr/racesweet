// @vitest-environment jsdom

import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ContextualHelpOverlay } from './ContextualHelpOverlay.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('contextual help overlay', (): void => {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach((): void => {
    act((): void => root?.unmount());
    container?.remove();
  });

  it('adds control-specific help to the control tooltip without rendering a help button', async (): Promise<void> => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async (): Promise<void> => root?.render(<ContextualHelpOverlay section="Results">
      <button aria-label="Results filter" type="button">Filter</button>
    </ContextualHelpOverlay>));

    const control: HTMLButtonElement = container.querySelector('[aria-label="Results filter"]')!;
    expect(control.getAttribute('title')).toContain('Action: Results filter');
    expect(control.getAttribute('title')).toContain('Select this action to continue.');
    expect(control.getAttribute('aria-description')).toBe('Select this action to continue. Its result is shown in the surrounding page when the action completes.');
    expect(container.querySelector('.contextual-control-help, .contextual-page-help')).toBeNull();
  });

  it('preserves an existing tooltip before the contextual help', async (): Promise<void> => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async (): Promise<void> => root?.render(<ContextualHelpOverlay section="Results">
      <button aria-label="Results filter" title="Filters this result list" type="button">Filter</button>
    </ContextualHelpOverlay>));

    const control: HTMLButtonElement = container.querySelector('[aria-label="Results filter"]')!;
    expect(control.getAttribute('title')).toBe('Filters this result list\n\nAction: Results filter: Select this action to continue. Its result is shown in the surrounding page when the action completes.');
  });
});
