export interface LoadingMetricCall {
  detail?: string;
  id: number;
  label: string;
  timestamp: string;
}

export interface LoadingMetricsState {
  recentCalls: LoadingMetricCall[];
  recentLimit: number;
  totalCalls: number;
}

type LoadingMetricsListener = () => void;

const DEFAULT_RECENT_LIMIT = 10;
const listeners = new Set<LoadingMetricsListener>();

let state: LoadingMetricsState = {
  recentCalls: [],
  recentLimit: DEFAULT_RECENT_LIMIT,
  totalCalls: 0,
};

const emitChange = (): void => {
  listeners.forEach((listener) => listener());
};

export const getLoadingMetricsSnapshot = (): LoadingMetricsState => state;

export const resetLoadingMetrics = (recentLimit: number = DEFAULT_RECENT_LIMIT): LoadingMetricsState => {
  state = {
    recentCalls: [],
    recentLimit: Math.max(1, Math.floor(recentLimit)),
    totalCalls: 0,
  };
  emitChange();
  return state;
};

export const incrementLoadingMetric = (label: string, detail?: string): LoadingMetricsState => {
  const nextCall: LoadingMetricCall = {
    detail,
    id: state.totalCalls + 1,
    label,
    timestamp: new Date().toISOString(),
  };

  state = {
    ...state,
    recentCalls: [...state.recentCalls, nextCall].slice(-state.recentLimit),
    totalCalls: nextCall.id,
  };
  emitChange();
  return state;
};

export const subscribeLoadingMetrics = (listener: LoadingMetricsListener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
