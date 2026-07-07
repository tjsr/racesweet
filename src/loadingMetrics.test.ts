import { getLoadingMetricsSnapshot, incrementLoadingMetric, resetLoadingMetrics, subscribeLoadingMetrics } from './loadingMetrics.js';

describe('loading metrics', () => {
  afterEach(() => {
    resetLoadingMetrics();
  });

  it('starts at zero and keeps the last ten calls by default', () => {
    resetLoadingMetrics();

    for (let index = 1; index <= 12; index += 1) {
      incrementLoadingMetric(`call ${index}`);
    }

    const snapshot = getLoadingMetricsSnapshot();

    expect(snapshot.totalCalls).toBe(12);
    expect(snapshot.recentCalls).toHaveLength(10);
    expect(snapshot.recentCalls[0]).toEqual(expect.objectContaining({ id: 3, label: 'call 3' }));
    expect(snapshot.recentCalls.at(-1)).toEqual(expect.objectContaining({ id: 12, label: 'call 12' }));
  });

  it('notifies subscribers when metrics reset and increment', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLoadingMetrics(listener);

    resetLoadingMetrics(2);
    incrementLoadingMetric('load event catalog', 'event-catalog.json');
    incrementLoadingMetric('apply ledger mutation');
    incrementLoadingMetric('validate participants');
    unsubscribe();
    incrementLoadingMetric('not observed');

    const snapshot = getLoadingMetricsSnapshot();

    expect(listener).toHaveBeenCalledTimes(4);
    expect(snapshot.recentCalls).toEqual([
      expect.objectContaining({ label: 'validate participants' }),
      expect.objectContaining({ label: 'not observed' }),
    ]);
  });
});
