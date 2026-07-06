import type { ReactElement } from 'react';

import { type LoadingProgressState, getLoadingProgressSummary } from '../../loadingProgress.js';

interface LoadingProgressProps {
  progress: LoadingProgressState;
}

export const LoadingProgress = ({ progress }: LoadingProgressProps): ReactElement => {
  const summary = getLoadingProgressSummary(progress);
  const stagePosition = summary.activeStageIndex + 1;
  const stageCount = progress.stages.length;

  return (
    <section className="loading-progress" aria-label={progress.title} aria-live="polite">
      <div className="loading-progress__header">
        <h1>{progress.title}</h1>
        <span className="loading-progress__percent">{summary.percent}%</span>
      </div>
      <progress
        aria-label={`${progress.title} progress`}
        className="loading-progress__bar"
        max={100}
        value={summary.percent}
      />
      <div className="loading-progress__status">
        <strong>{summary.activeStage.label}</strong>
        <span>
          Stage {stagePosition} of {stageCount}
        </span>
        <span>
          {summary.activeStage.completed} of {summary.activeStage.total}
        </span>
      </div>
      <ol className="loading-progress__stages">
        {progress.stages.map((stage, index) => (
          <li
            className={stage.id === progress.activeStageId ? 'active' : undefined}
            key={stage.id}
          >
            <span>{index + 1}. {stage.label}</span>
            <span>{stage.completed}/{stage.total}</span>
          </li>
        ))}
      </ol>
    </section>
  );
};
