import type { ReactElement } from 'react';

import type { LoadingMetricsState } from '../../loadingMetrics.js';
import { type LoadingProgressState, getLoadingProgressSummary } from '../../loadingProgress.js';
import { RaceSweetLogo } from './RaceSweetLogo.js';

interface LoadingProgressProps {
  metrics?: LoadingMetricsState;
  progress: LoadingProgressState;
}

export const LoadingProgress = ({ metrics, progress }: LoadingProgressProps): ReactElement => {
  const summary = getLoadingProgressSummary(progress);
  const stagePosition = summary.activeStageIndex + 1;
  const stageCount = progress.stages.length;

  return (
    <div className="loading-progress-layout">
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
        {metrics ? (
          <div className="loading-progress__metrics">
            <div className="loading-progress__metric-count">
              <strong>{metrics.totalCalls}</strong>
              <span>tracked calls</span>
            </div>
            {metrics.recentCalls.length > 0 ? (
              <ol className="loading-progress__recent-calls" aria-label="Recent loading calls">
                {metrics.recentCalls.map((call) => (
                  <li key={call.id}>
                    <span>{call.label}</span>
                    {call.detail ? <small>{call.detail}</small> : null}
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        ) : null}
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
      <RaceSweetLogo className="loading-progress__logo" />
    </div>
  );
};
