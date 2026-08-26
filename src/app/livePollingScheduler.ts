export interface LivePollingSource {
  id: string;
  name: string;
  pollIntervalSeconds: number;
}

export interface LivePollingTarget {
  eventId: string;
  sessionId: string;
}

export interface ScheduledLivePoll extends LivePollingSource {
  eventId: string;
  nextPollAt: Date;
  sessionId: string;
}

export interface LivePollingContext extends LivePollingTarget {
  getLiveSource: (sourceId: string) => LivePollingSource | undefined;
  loadSource: (source: LivePollingSource, target: LivePollingTarget) => Promise<void>;
  sources: LivePollingSource[];
}

interface TimerHost {
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => void;
  setTimeout: (
    callback: () => void,
    delayMilliseconds: number,
  ) => ReturnType<typeof setTimeout>;
}

export interface LivePollingSchedulerOptions {
  now?: () => Date;
  onScheduleChanged?: (scheduledPolls: ScheduledLivePoll[]) => void;
  onSourceError?: (error: Error) => void;
  timerHost?: TimerHost;
}

const getPollDelayMilliseconds = (source: LivePollingSource): number => {
  return Math.max(1, source.pollIntervalSeconds) * 1000;
};

export class LivePollingScheduler {
  private context: LivePollingContext | undefined;
  private readonly now: () => Date;
  private readonly onScheduleChanged: (scheduledPolls: ScheduledLivePoll[]) => void;
  private readonly onSourceError: (error: Error) => void;
  private readonly scheduledPolls = new Map<string, ScheduledLivePoll>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly timerHost: TimerHost;

  public constructor(options: LivePollingSchedulerOptions = {}) {
    this.now = options.now || (() => new Date());
    this.onScheduleChanged = options.onScheduleChanged || (() => undefined);
    this.onSourceError = options.onSourceError || (() => undefined);
    this.timerHost = options.timerHost || {
      clearTimeout,
      setTimeout,
    };
  }

  public dispose = (): void => {
    this.context = undefined;
    this.cancelScheduledPolls();
  };

  public synchronize = (context: LivePollingContext | undefined): void => {
    this.context = context;
    this.cancelScheduledPolls();
    context?.sources.forEach((source: LivePollingSource): void => {
      this.schedule(source, context);
    });
  };

  private cancelScheduledPolls = (): void => {
    this.timers.forEach((timer: ReturnType<typeof setTimeout>): void => {
      this.timerHost.clearTimeout(timer);
    });
    this.timers.clear();
    this.scheduledPolls.clear();
    this.notifyScheduleChanged();
  };

  private execute = (sourceId: string, target: LivePollingTarget): void => {
    this.timers.delete(sourceId);
    this.scheduledPolls.delete(sourceId);
    this.notifyScheduleChanged();

    const context: LivePollingContext | undefined = this.context;
    if (
      !context ||
      context.eventId !== target.eventId ||
      context.sessionId !== target.sessionId
    ) {
      return;
    }

    const source: LivePollingSource | undefined = context.getLiveSource(sourceId);
    if (!source) {
      return;
    }

    context.loadSource(source, target)
      .catch((error: unknown): void => {
        this.onSourceError(error instanceof Error ? error : new Error(String(error)));
      })
      .finally((): void => {
        const nextContext: LivePollingContext | undefined = this.context;
        if (
          !nextContext ||
          nextContext.eventId !== target.eventId ||
          nextContext.sessionId !== target.sessionId
        ) {
          return;
        }
        const nextSource: LivePollingSource | undefined =
          nextContext.getLiveSource(sourceId);
        if (nextSource) {
          this.schedule(nextSource, nextContext);
        }
      });
  };

  private notifyScheduleChanged = (): void => {
    this.onScheduleChanged(
      Array.from(this.scheduledPolls.values()).sort(
        (left: ScheduledLivePoll, right: ScheduledLivePoll): number =>
          left.nextPollAt.getTime() - right.nextPollAt.getTime(),
      ),
    );
  };

  private schedule = (
    source: LivePollingSource,
    context: LivePollingContext,
  ): void => {
    const delayMilliseconds: number = getPollDelayMilliseconds(source);
    const nextPoll: ScheduledLivePoll = {
      ...source,
      eventId: context.eventId,
      nextPollAt: new Date(this.now().getTime() + delayMilliseconds),
      sessionId: context.sessionId,
    };
    this.scheduledPolls.set(source.id, nextPoll);
    this.timers.set(
      source.id,
      this.timerHost.setTimeout(
        (): void => this.execute(source.id, {
          eventId: context.eventId,
          sessionId: context.sessionId,
        }),
        delayMilliseconds,
      ),
    );
    this.notifyScheduleChanged();
  };
}
