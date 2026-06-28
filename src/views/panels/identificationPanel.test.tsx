// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { type EventParticipant } from '../../model/eventparticipant.js';
import { useUiConsoleGuards } from '../../testing/uiConsoleGuards.js';
import { IdentificationPanel } from './identificationPanel.js';

const setInputValue = (input: HTMLInputElement, value: string): void => {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

const blurInput = (input: HTMLInputElement): void => {
  input.dispatchEvent(new Event('focusout', { bubbles: true }));
};

const selectedParticipant: EventParticipant = {
  categoryId: 'cat-1',
  currentResult: undefined,
  entrantId: 'entrant-1',
  firstname: 'Selected',
  id: 'participant-1',
  identifiers: [],
  lastRecordTime: null,
  resultDuration: null,
  surname: 'Rider',
};

describe('IdentificationPanel', () => {
  let container: HTMLDivElement;
  let root: Root;

  useUiConsoleGuards();

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

  it('renders addable identifier rows for a selected participant without identifiers and emits changes', async () => {
    const onUpdateParticipantIdentifiers = vi.fn();

    await act(async () => {
      root.render(
        <IdentificationPanel
          onUpdateParticipantIdentifiers={onUpdateParticipantIdentifiers}
          selectedParticipant={selectedParticipant}
        />,
      );
    });

    expect(container.textContent).not.toContain('No participant is selected.');
    expect(container.textContent).toContain('Add plate');
    expect(container.textContent).toContain('Add device');

    const racePlateInput = container.querySelector('input[aria-label="Race plate Selected Rider 1"]') as HTMLInputElement;
    const timingDeviceInput = container.querySelector('input[aria-label="Timing device Selected Rider 1"]') as HTMLInputElement;
    const timingAssignmentInput = container.querySelector('input[aria-label="Assignment time Selected Rider 1"]') as HTMLInputElement;
    expect(racePlateInput).toBeTruthy();
    expect(timingDeviceInput).toBeTruthy();
    expect(timingAssignmentInput).toBeTruthy();
    expect((Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Add plate') as HTMLButtonElement).disabled).toBe(true);
    expect((container.querySelector('button[aria-label="Remove plate 1 for Selected Rider"]') as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      setInputValue(racePlateInput, '#55');
      blurInput(racePlateInput);
    });

    expect(onUpdateParticipantIdentifiers).toHaveBeenCalledWith('participant-1', 'racePlate', ['55']);

    await act(async () => {
      setInputValue(timingDeviceInput, 'Tx9911');
      setInputValue(timingAssignmentInput, '2026-06-28T09:15');
      blurInput(timingDeviceInput);
    });

    expect(onUpdateParticipantIdentifiers).toHaveBeenCalledWith('participant-1', 'txNo', [
      expect.objectContaining({
        fromTime: new Date('2026-06-28T09:15'),
        txNo: 9911,
      }),
    ]);
  });

  it('allows adding and removing extra plate rows only when multiple plates are enabled', async () => {
    await act(async () => {
      root.render(
        <IdentificationPanel
          enableMultiplePlates={true}
          onUpdateParticipantIdentifiers={() => undefined}
          selectedParticipant={selectedParticipant}
        />,
      );
    });

    const racePlateInputs = () => Array.from(container.querySelectorAll('input[aria-label^="Race plate Selected Rider"]'));
    const addPlateButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Add plate') as HTMLButtonElement;
    const removePlateButton = container.querySelector('button[aria-label="Remove plate 1 for Selected Rider"]') as HTMLButtonElement;

    expect(addPlateButton.disabled).toBe(false);
    expect(removePlateButton.disabled).toBe(false);
    expect(racePlateInputs()).toHaveLength(1);

    await act(async () => {
      addPlateButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(racePlateInputs()).toHaveLength(2);
  });
});
