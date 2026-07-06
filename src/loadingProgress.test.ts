import { createLoadingProgressState, getLoadingProgressSummary, updateLoadingProgressStage } from './loadingProgress.js';

describe('loadingProgress', () => {
  it('calculates overall progress across staged element totals', () => {
    const initialProgress = createLoadingProgressState('Loading data', [
      { id: 'files', label: 'Files', total: 3 },
      { id: 'records', label: 'Records', total: 7 },
    ]);
    const fileProgress = updateLoadingProgressStage(initialProgress, 'files', {
      completed: 3,
    });
    const recordProgress = updateLoadingProgressStage(fileProgress, 'records', {
      active: true,
      completed: 2,
    });

    expect(getLoadingProgressSummary(recordProgress)).toEqual({
      activeStage: {
        completed: 2,
        id: 'records',
        label: 'Records',
        total: 7,
      },
      activeStageIndex: 1,
      completed: 5,
      percent: 50,
      total: 10,
    });
  });

  it('clamps invalid totals and completed counts', () => {
    const progress = createLoadingProgressState('Loading data', [
      { completed: 8, id: 'records', label: 'Records', total: 4 },
    ]);

    expect(getLoadingProgressSummary(progress).percent).toBe(100);
    expect(updateLoadingProgressStage(progress, 'records', {
      completed: -10,
      total: 0,
    }).stages[0]).toEqual({
      completed: 0,
      id: 'records',
      label: 'Records',
      total: 1,
    });
  });
});
