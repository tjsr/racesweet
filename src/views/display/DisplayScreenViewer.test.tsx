// @vitest-environment jsdom

import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { DisplayScreenViewer } from './DisplayScreenViewer.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

class FakeEventSource {
  public static current: FakeEventSource | undefined;
  public readonly listeners: Map<string, EventListener> = new Map<string, EventListener>();
  public onerror: (() => void) | null = null;
  public closed: boolean = false;
  public readonly url: string;

  public constructor(url: string) {
    this.url = url;
    FakeEventSource.current = this;
  }

  public addEventListener(type: string, listener: EventListener): void {
    this.listeners.set(type, listener);
  }

  public emit(type: string, data: object = {}): void {
    this.listeners.get(type)?.(new MessageEvent(type, { data: JSON.stringify(data) }));
  }

  public close(): void {
    this.closed = true; 
  }
}

describe('DisplayScreenViewer', () => {
  let root: Root;
  let container: HTMLDivElement;
  const originalEventSource: typeof EventSource = globalThis.EventSource;

  afterEach(async () => {
    if (root) await act(async (): Promise<void> => root.unmount());
    container?.remove();
    globalThis.EventSource = originalEventSource;
  });

  it('renders token-scoped snapshots, retains the last data on disconnect, and hides revoked views', async () => {
    globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async (): Promise<void> => root.render(<DisplayScreenViewer token="secret" />));
    expect(FakeEventSource.current?.url).toBe('/api/v1/displays/view/secret/events');
    await act(async (): Promise<void> => FakeEventSource.current?.emit('snapshot', {
      items: [{ height: 1, id: 'title', settings: { showSession: false }, type: 'event-title', width: 12, x: 0, y: 0, zIndex: 0 }],
      projection: { eventName: 'Trackside', eventTimeZone: 'UTC', generatedAt: '2026-01-01T00:00:00.000Z', rows: [] },
      revision: 1,
    }));
    expect(container.textContent).toContain('Trackside');
    await act(async (): Promise<void> => FakeEventSource.current?.onerror?.());
    expect(container.textContent).toContain('Showing the last received display');
    expect(container.textContent).toContain('Trackside');
    await act(async (): Promise<void> => FakeEventSource.current?.emit('unavailable'));
    expect(container.textContent).toBe('Display unavailable.');
    expect(FakeEventSource.current?.closed).toBe(true);
  });
});
