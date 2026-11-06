// @vitest-environment jsdom
import React, { act } from "react";

import { type Root, createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ReplayRecord, ReplayState } from "../../model/eventReplay.js";
import { EventReplayPanel } from "./EventReplayPanel.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
class ReplaySource {
  public static sources: ReplaySource[] = [];
  public readonly listeners: Map<
    string,
    (event: MessageEvent<string>) => void
  > = new Map();
  public onerror?: () => void;
  public readyState: number = 1;
  public readonly url: string;
  public constructor(url: string) {
    this.url = url;
    ReplaySource.sources.push(this);
  }
  public addEventListener = (
    name: string,
    handler: (event: MessageEvent<string>) => void,
  ): void => {
    this.listeners.set(name, handler);
  };
  public close = (): void => {
    this.readyState = 2;
  };
  public emit = (name: string, payload: object): void => {
    this.listeners.get(name)?.(
      new MessageEvent<string>(name, { data: JSON.stringify(payload) }),
    );
  };
}
const setValue = (input: HTMLInputElement, value: string): void => {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};
describe("Reports replay subscriber", (): void => {
  let root: Root | undefined;
  let container: HTMLDivElement;
  afterEach(async (): Promise<void> => {
    if (root) await act(async (): Promise<void> => root?.unmount());
    container?.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    ReplaySource.sources = [];
  });
  it("replaces reconnect snapshots, sends exactly one seek target, renders IDs, and disposes on selection change", async (): Promise<void> => {
    vi.stubGlobal("EventSource", ReplaySource);
    const fetchMock = vi.fn(
      async (
        _input: RequestInfo | URL,
        _init?: RequestInit,
      ): Promise<Response> => Response.json({ state: currentState }),
    );
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const props = {
      eventId: "event-a",
      mode: "replay" as const,
      onModeChange: vi.fn(),
      onSpeedChange: vi.fn(),
      sessionId: "session-a",
      speed: 1,
    };
    await act(async (): Promise<void> =>
      root?.render(<EventReplayPanel {...props} />),
    );
    const source: ReplaySource = ReplaySource.sources[0];
    const streamId: string = new URL(
      source.url,
      "https://local.test",
    ).searchParams.get("streamId")!;
    const currentState: ReplayState = {
      emittedRecordCount: 1,
      eventId: "event-a",
      mode: "replay",
      position: 1,
      recordCount: 2,
      serverTimestamp: "2026-01-01T00:00:00.000Z",
      sessionId: "session-a",
      speed: 1,
      status: "paused",
      streamId,
    };
    const record: ReplayRecord = {
      entrantId: "entrant-one",
      eventId: "event-a",
      id: "record-one",
      participantId: "person-one",
      recordType: 16,
      sequence: 1,
      sessionId: "session-a",
      timestamp: "2026-01-01T00:00:00.000Z",
    };
    await act(async (): Promise<void> => {
      source.emit("replay-connected", {
        mode: "replay",
        protocolVersion: 1,
        selection: props,
        state: currentState,
        streamId,
      });
      source.emit("replay-snapshot", {
        records: [record],
        state: currentState,
      });
    });
    expect(container.textContent).toContain("1 of 2 records / Position 1");
    expect(container.textContent).toContain("entrant-one");
    const label: HTMLLabelElement = [
      ...container.querySelectorAll<HTMLLabelElement>("label"),
    ].find(
      (element: HTMLLabelElement): boolean =>
        element.textContent === "Seek position",
    )!;
    await act(async (): Promise<void> =>
      setValue(
        container.querySelector<HTMLInputElement>(`#${label.htmlFor}`)!,
        "2",
      ),
    );
    await act(async (): Promise<void> =>
      [...container.querySelectorAll("button")]
        .find(
          (button: HTMLButtonElement): boolean => button.textContent === "Seek",
        )!
        .click(),
    );
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({
      command: "seek",
      position: 2,
      streamId,
    });
    await act(async (): Promise<void> =>
      source.emit("replay-snapshot", {
        records: [],
        state: { ...currentState, emittedRecordCount: 0, position: 0 },
      }),
    );
    expect(container.textContent).not.toContain("record-one");
    vi.useFakeTimers();
    await act(async (): Promise<void> =>
      source.emit("race-update", { invalid: true }),
    );
    expect(container.textContent).toContain("Invalid replay message");
    expect(source.readyState).toBe(2);
    await act(async (): Promise<void> => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    const retrySource: ReplaySource = ReplaySource.sources.at(-1)!;
    expect(
      new URL(retrySource.url, "https://local.test").searchParams.get(
        "streamId",
      ),
    ).toBe(streamId);
    await act(async (): Promise<void> =>
      retrySource.emit("replay-snapshot", {
        records: [record],
        state: currentState,
      }),
    );
    expect(container.textContent).toContain("record-one");
    expect(container.textContent).not.toContain("Invalid replay message");
    vi.useRealTimers();
    await act(async (): Promise<void> =>
      root?.render(<EventReplayPanel {...props} sessionId="session-b" />),
    );
    expect(source.readyState).toBe(2);
    expect(ReplaySource.sources.at(-1)?.url).toContain("sessionId=session-b");
    expect(
      new URL(
        ReplaySource.sources.at(-1)!.url,
        "https://local.test",
      ).searchParams.get("streamId"),
    ).not.toBe(streamId);
  });
});
