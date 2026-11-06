// @vitest-environment jsdom

import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReorderableAdminList } from './ReorderableAdminList.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('ReorderableAdminList', (): void => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;
  afterEach((): void => {
    act((): void => root?.unmount()); container?.remove(); vi.restoreAllMocks();
  });
  const render = async (save: (items: string[]) => void | Promise<void>): Promise<void> => {
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
    await act(async (): Promise<void> => root?.render(<ReorderableAdminList getId={(value: string): string => value}
      getLabel={(value: string): string => value} items={['A', 'B', 'C']} label="Order" onReorder={save}
      renderItem={(value: string): React.ReactNode => <span>{value}</span>} />));
  };
  const key = async (handle: HTMLElement, value: string): Promise<void> => {
    await act(async (): Promise<void> => {
      handle.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: value })); 
    });
  };
  it('supports keyboard lift/move/drop and cancellation', async (): Promise<void> => {
    const save = vi.fn<(items: string[]) => Promise<void>>().mockResolvedValue(undefined);
    await render(save);
    const b: HTMLButtonElement = container!.querySelector('[aria-label="Reorder B"]')!;
    await key(b, ' '); await key(b, 'ArrowUp'); await key(b, 'Enter');
    expect(save).toHaveBeenCalledWith(['B', 'A', 'C']);
    expect(container!.textContent).toContain('Order saved.');
    await key(b, ' '); await key(b, 'ArrowDown'); await key(b, 'Escape');
    expect(save).toHaveBeenCalledTimes(1);
  });
  it('restores the previous order after a failed arrow move', async (): Promise<void> => {
    const save = vi.fn<(items: string[]) => Promise<void>>().mockRejectedValue(new Error('Disk unavailable'));
    await render(save);
    const down: HTMLButtonElement = container!.querySelector('button[aria-label="Move A down"]')!;
    await act(async (): Promise<void> => {
      down.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledWith(['B', 'A', 'C']);
    expect(container!.textContent).toContain('Disk unavailable');
    expect([...container!.querySelectorAll('[data-reorder-id]')].map((item: Element): string | null => item.getAttribute('data-reorder-id'))).toEqual(['A', 'B', 'C']);
  });
  it.each(['mouse', 'touch'])('supports %s pointer drag with the same ordered collection', async (pointerType: string): Promise<void> => {
    const save = vi.fn<(items: string[]) => Promise<void>>().mockResolvedValue(undefined);
    await render(save);
    const b: HTMLButtonElement = container!.querySelector('[aria-label="Reorder B"]')!;
    const a: Element = container!.querySelector('[data-reorder-id="A"]')!;
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: (): Element => a });
    const pointer = async (name: string): Promise<void> => {
      const event: Event = new MouseEvent(name, { bubbles: true, button: 0, clientX: 2, clientY: 2 });
      Object.defineProperty(event, 'pointerType', { value: pointerType });
      await act(async (): Promise<void> => {
        b.dispatchEvent(event); 
      });
    };
    await pointer('pointerdown'); await pointer('pointermove'); await pointer('pointerup');
    expect(save).toHaveBeenCalledWith(['B', 'A', 'C']);
  });
});
