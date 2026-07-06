export interface LoadingProgressStage {
  completed: number;
  id: string;
  label: string;
  total: number;
}

export interface LoadingProgressState {
  activeStageId: string;
  stages: LoadingProgressStage[];
  title: string;
}

export interface LoadingProgressSummary {
  activeStage: LoadingProgressStage;
  activeStageIndex: number;
  completed: number;
  percent: number;
  total: number;
}

export const createLoadingProgressState = (
  title: string,
  stages: Array<Pick<LoadingProgressStage, 'id' | 'label'> & Partial<Pick<LoadingProgressStage, 'completed' | 'total'>>>
): LoadingProgressState => {
  if (stages.length === 0) {
    throw new Error('Loading progress requires at least one stage.');
  }

  return {
    activeStageId: stages[0].id,
    stages: stages.map((stage) => ({
      completed: Math.max(0, stage.completed || 0),
      id: stage.id,
      label: stage.label,
      total: Math.max(1, stage.total || 1),
    })),
    title,
  };
};

export const updateLoadingProgressStage = (
  progress: LoadingProgressState,
  stageId: string,
  values: Partial<Pick<LoadingProgressStage, 'completed' | 'total'>> & { active?: boolean }
): LoadingProgressState => {
  const stages = progress.stages.map((stage) => {
    if (stage.id !== stageId) {
      return stage;
    }

    const total = Math.max(1, values.total ?? stage.total);
    const completed = Math.min(total, Math.max(0, values.completed ?? stage.completed));

    return {
      ...stage,
      completed,
      total,
    };
  });

  return {
    ...progress,
    activeStageId: values.active ? stageId : progress.activeStageId,
    stages,
  };
};

export const completeLoadingProgressStage = (
  progress: LoadingProgressState,
  stageId: string
): LoadingProgressState => {
  const stage = progress.stages.find((item) => item.id === stageId);
  if (!stage) {
    return progress;
  }

  return updateLoadingProgressStage(progress, stageId, {
    completed: stage.total,
  });
};

export const getLoadingProgressSummary = (progress: LoadingProgressState): LoadingProgressSummary => {
  const activeStageIndex = Math.max(0, progress.stages.findIndex((stage) => stage.id === progress.activeStageId));
  const activeStage = progress.stages[activeStageIndex] || progress.stages[0];
  const total = progress.stages.reduce((sum, stage) => sum + stage.total, 0);
  const completed = progress.stages.reduce((sum, stage) => sum + Math.min(stage.completed, stage.total), 0);
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    activeStage,
    activeStageIndex,
    completed,
    percent,
    total,
  };
};
