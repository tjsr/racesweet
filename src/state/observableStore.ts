export type StoreListener = () => void;

export interface ReadableStore<TState> {
  getSnapshot(): TState;
  subscribe(listener: StoreListener): () => void;
}

export class ObservableStore<TState> implements ReadableStore<TState> {
  private readonly listeners = new Set<StoreListener>();
  private state: TState;

  public constructor(initialState: TState) {
    this.state = initialState;
  }

  public getSnapshot(): TState {
    return this.state;
  }

  public setSnapshot(nextState: TState): void {
    this.state = nextState;
    this.listeners.forEach((listener: StoreListener) => listener());
  }

  public subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }
}
