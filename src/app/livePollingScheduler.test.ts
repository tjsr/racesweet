import { describe, expect, it, vi } from "vitest";
import {
  type LivePollingContext,
  type LivePollingSource,
  LivePollingScheduler,
  type ScheduledLivePoll,
} from "./livePollingScheduler.js";

const target = { eventId: "event-1", sessionId: "session-1" };

const createSource = (pollIntervalSeconds = 30): LivePollingSource => ({
  id: "source-1",
  name: "Live source",
  pollIntervalSeconds,
});

describe("LivePollingScheduler", () => {
  it("invokes default browser timers with the global receiver", () => {
    const originalSetTimeout: typeof globalThis.setTimeout =
      globalThis.setTimeout;
    let setTimeoutReceiver: typeof globalThis | undefined;
    const receiverSensitiveSetTimeout = function (
      this: typeof globalThis,
      ...arguments_: Parameters<typeof globalThis.setTimeout>
    ): ReturnType<typeof globalThis.setTimeout> {
      setTimeoutReceiver = this;
      if (this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      return originalSetTimeout.call(globalThis, ...arguments_);
    };
    const loadSource = vi
      .fn<LivePollingContext["loadSource"]>()
      .mockResolvedValue();
    const scheduler = new LivePollingScheduler();
    const source = createSource();
    const setTimeoutSpy = vi
      .spyOn(globalThis, "setTimeout")
      .mockImplementation(receiverSensitiveSetTimeout);

    try {
      scheduler.synchronize({
        ...target,
        getLiveSource: (): LivePollingSource | undefined => source,
        loadSource,
        sources: [source],
      });

      expect(setTimeoutReceiver).toBe(globalThis);
    } finally {
      scheduler.dispose();
      setTimeoutSpy.mockRestore();
    }
  });

  it("loads a source after its interval and uses the latest interval for the next timer", async () => {
    vi.useFakeTimers();
    let source: LivePollingSource | undefined = createSource(30);
    const loadSource = vi
      .fn<LivePollingContext["loadSource"]>()
      .mockResolvedValue();
    const schedules: ScheduledLivePoll[][] = [];
    const scheduler = new LivePollingScheduler({
      onScheduleChanged: (scheduledPolls: ScheduledLivePoll[]): void => {
        schedules.push(scheduledPolls);
      },
    });

    scheduler.synchronize({
      ...target,
      getLiveSource: (): LivePollingSource | undefined => source,
      loadSource,
      sources: [source],
    });
    expect(schedules.at(-1)?.[0]?.nextPollAt.getTime()).toBe(
      Date.now() + 30000,
    );

    source = createSource(45);
    await vi.advanceTimersByTimeAsync(30000);

    expect(loadSource).toHaveBeenCalledWith(source, target);
    expect(schedules.at(-1)?.[0]?.nextPollAt.getTime()).toBe(
      Date.now() + 45000,
    );
    scheduler.dispose();
    vi.useRealTimers();
  });

  it("cancels pending polls when the active session changes or live polling is disabled", () => {
    vi.useFakeTimers();
    const loadSource = vi
      .fn<LivePollingContext["loadSource"]>()
      .mockResolvedValue();
    const scheduler = new LivePollingScheduler();
    const source = createSource();

    scheduler.synchronize({
      ...target,
      getLiveSource: (): LivePollingSource | undefined => source,
      loadSource,
      sources: [source],
    });
    scheduler.synchronize({
      eventId: target.eventId,
      getLiveSource: (): LivePollingSource | undefined => undefined,
      loadSource,
      sessionId: "session-2",
      sources: [],
    });
    vi.advanceTimersByTime(30000);

    expect(loadSource).not.toHaveBeenCalled();
    scheduler.dispose();
    vi.useRealTimers();
  });
});
