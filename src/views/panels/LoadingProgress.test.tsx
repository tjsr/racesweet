// @vitest-environment jsdom

import { flushSync } from 'react-dom';
import { type Root, createRoot } from 'react-dom/client';

import { createLoadingProgressState, updateLoadingProgressStage } from '../../loadingProgress.js';
import { LoadingProgress } from './LoadingProgress.js';

describe('LoadingProgress', () => {
  let container: HTMLDivElement;
  let root: Root | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    root?.unmount();
    container.remove();
  });

  it('renders active stage, element count, and overall percentage', () => {
    const initialProgress = createLoadingProgressState('Loading RaceSweet', [
      { id: 'files', label: 'Loading files', total: 3 },
      { id: 'records', label: 'Processing records', total: 7 },
    ]);
    const progress = updateLoadingProgressStage(
      updateLoadingProgressStage(initialProgress, 'files', { completed: 3 }),
      'records',
      { active: true, completed: 2 }
    );

    flushSync(() => {
      root!.render(<LoadingProgress progress={progress} />);
    });

    const progressBar = container.querySelector('progress[aria-label="Loading RaceSweet progress"]') as HTMLProgressElement | null;
    expect(progressBar).toBeTruthy();
    expect(progressBar?.value).toBe(50);
    expect(container.textContent).toContain('Loading RaceSweet');
    expect(container.textContent).toContain('50%');
    expect(container.textContent).toContain('Processing records');
    expect(container.textContent).toContain('Stage 2 of 2');
    expect(container.textContent).toContain('2 of 7');
  });
});
