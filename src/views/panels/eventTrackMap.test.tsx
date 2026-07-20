// @vitest-environment jsdom

import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { FileWriteFailureError } from '../../app/fileWriteDiagnostics.js';
import { createEventId } from '../../model/ids.js';
import { useUiConsoleGuards } from '../../testing/uiConsoleGuards.js';
import { EventTrackMapPanel } from './eventTrackMap.js';

describe('EventTrackMapPanel', () => {
  useUiConsoleGuards();

  it('shows confirmation beside the save button when positions are persisted', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    const onSave = vi.fn(async () => undefined);

    await act(async () => {
      root.render(<EventTrackMapPanel availableTimingLines={[{ label: 'Finish', lineNumber: 1 }]} onSave={onSave} selectedEvent={{
        categoryIds: [],
        date: '2026-07-20',
        entrantIds: [],
        format: 'race-weekend',
        id: createEventId('saved-event'),
        name: 'Saved event',
        sessionIds: [],
      }} />);
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save Track Map') as HTMLButtonElement;
    await act(async () => {
      saveButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledOnce();
    expect(container.querySelector('[aria-label="Track Map Save Status"]')?.textContent).toBe('Track map saved.');
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('keeps a track-map save error in the panel with actionable context', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    const onSave = vi.fn(async () => {
      throw new Error('Could not save event data for event-1 to C:\\data\\event-1.json. Access denied.');
    });

    await act(async () => {
      root.render(<EventTrackMapPanel availableTimingLines={[{ label: 'Finish', lineNumber: 1 }]} onSave={onSave} selectedEvent={{
        categoryIds: [],
        date: '2026-07-20',
        entrantIds: [],
        format: 'race-weekend',
        id: createEventId('event-1'),
        name: 'Test event',
        sessionIds: [],
      }} />);
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save Track Map') as HTMLButtonElement;
    await act(async () => {
      saveButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Could not save the track map.');
    expect(container.querySelector('[role="status"]')?.textContent).toContain('The timing-line positions remain unsaved; check that the event data file is writable and try again.');
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('copies structured save diagnostics when the file write fails', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const onSave = vi.fn(async () => {
      throw new FileWriteFailureError({
        diagnostics: {
          attemptId: 'save-attempt-1',
          code: 'UNKNOWN',
          currentWorkingDirectory: 'C:\\dev\\racesweet',
          durationMilliseconds: 12,
          message: 'unknown error, open',
          osUserName: 'tim',
          parentDirectoryPath: 'C:\\dev\\racesweet\\src\\generated',
          payloadByteLength: 100,
          payloadType: 'utf8',
          processId: 1234,
          queueWaitMilliseconds: 0,
          queuedBehindApplicationWrite: false,
          requestedPath: '../../src/generated/event-1.json',
          resolvedPath: 'C:\\dev\\racesweet\\src\\generated\\event-1.json',
          stackSnippet: 'Error: unknown error',
          startedAt: '2026-07-20T00:00:00.000Z',
          userDataPath: 'C:\\Users\\tim\\AppData\\Roaming\\RaceSweet',
        },
        guidance: 'Windows could not open the save file. Close programs that may be using it, check antivirus protection, and try again.',
      });
    });

    await act(async () => {
      root.render(<EventTrackMapPanel availableTimingLines={[]} onSave={onSave} selectedEvent={{
        categoryIds: [],
        date: '2026-07-20',
        entrantIds: [],
        format: 'race-weekend',
        id: createEventId('event-1'),
        name: 'Test event',
        sessionIds: [],
      }} />);
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save Track Map') as HTMLButtonElement;
    await act(async () => {
      saveButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    const copyButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Copy save diagnostics') as HTMLButtonElement;
    expect(copyButton).toBeTruthy();

    await act(async () => {
      copyButton.click();
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('attemptId: save-attempt-1'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining(`eventId: ${createEventId('event-1')}`));
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
