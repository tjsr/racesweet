import type { ReactElement } from 'react';

export interface InlineLoadingProgress {
  callerName?: string;
  completed: number;
  currentFile?: string;
  currentTask?: string;
  total: number;
}

interface InlineLoadingIndicatorProps {
  ariaLabel: string;
  progress?: InlineLoadingProgress;
}

export const InlineLoadingIndicator = (props: InlineLoadingIndicatorProps): ReactElement => {
  const progress = props.progress;
  const shouldShowProgress = progress !== undefined && progress.total > 0;
  const statusText = progress?.callerName || progress?.currentTask;

  return (
    <span
      aria-label={props.ariaLabel}
      className="inline-loading-indicator"
      role="status"
      title={progress?.currentTask || progress?.currentFile}
    >
      <span aria-hidden="true" className="inline-loading-indicator__spinner" />
      {shouldShowProgress && progress ? (
        <span className="inline-loading-indicator__progress">
          {progress.completed}/{progress.total}
        </span>
      ) : null}
      {statusText ? (
        <span className="inline-loading-indicator__status">{statusText}</span>
      ) : null}
    </span>
  );
};
