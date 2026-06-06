// @vitest-environment jsdom

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

import { WarningModal } from './warningModal.js';

describe('WarningModal', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders a centered warning dialog with configured actions', async () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    const onCancel = vi.fn();

    await act(async () => {
      root.render(
        <WarningModal
          actions={[
            { label: 'Save', onClick: onSave },
            { label: 'Discard', onClick: onDiscard },
            { label: 'Cancel', onClick: onCancel },
          ]}
          ariaLabel="Unsaved category changes"
          message="You have unsaved changes to category Premier - save or discard changes?"
          title="Unsaved Changes"
        />
      );
    });

    expect(container.querySelector('.warning-modal-backdrop')).toBeTruthy();
    const dialog = container.querySelector('.warning-modal');
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(dialog?.textContent).toContain('Unsaved Changes');
    expect(dialog?.textContent).toContain('You have unsaved changes to category Premier - save or discard changes?');

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save');
    const discardButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Discard');
    const cancelButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Cancel');

    await act(async () => {
      saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      discardButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      cancelButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
