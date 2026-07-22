import { describe, expect, it, vi } from 'vitest';
import { ObservableStore } from './observableStore.js';

describe('ObservableStore', () => {
  it('publishes each replacement snapshot and supports unsubscribe', () => {
    const store = new ObservableStore<number>(1);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.setSnapshot(2);
    unsubscribe();
    store.setSnapshot(3);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBe(3);
  });
});
