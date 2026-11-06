// @vitest-environment jsdom

import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type DataSourceConfig, type SystemConfiguration, createDefaultSystemConfiguration } from '../../app/systemConfig.js';
import type { SystemConfigPersistence } from '../../persistence/systemConfigPersistence.js';
import { SystemConfigService } from '../../service/systemConfigService.js';
import { DataSourcesPanel } from './dataSources.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const setWidth = (width: number): void => {
  vi.stubGlobal('matchMedia', (query: string): MediaQueryList => {
    const minimum: RegExpMatchArray | null = query.match(/min-width:\s*([\d.]+)px/u);
    const maximum: RegExpMatchArray | null = query.match(/max-width:\s*([\d.]+)px/u);
    return {
      addEventListener: (): void => undefined, addListener: (): void => undefined,
      dispatchEvent: (): boolean => true,
      matches: (!minimum || width >= Number(minimum[1])) && (!maximum || width <= Number(maximum[1])),
      media: query, onchange: null,
      removeEventListener: (): void => undefined, removeListener: (): void => undefined,
    };
  });
};

describe('responsive System source editing', (): void => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;
  afterEach((): void => {
    act((): void => root?.unmount());
    container?.remove();
    vi.unstubAllGlobals();
  });

  it.each([360, 768, 1280])('saves through the same service and preserves its mounted form at %spx', async (width: number): Promise<void> => {
    setWidth(width);
    let saved: SystemConfiguration = { ...createDefaultSystemConfiguration(), dataSources: [
      { enabled: true, fileConfig: {}, id: 'source-rfid', name: 'Finish decoder', type: 'file-rfid-timing-csv' },
    ] };
    const persistence: SystemConfigPersistence = {
      load: vi.fn((): Promise<SystemConfiguration> => Promise.resolve(saved)),
      save: vi.fn((value: SystemConfiguration): Promise<void> => {
        saved = value; return Promise.resolve(); 
      }),
    };
    const upstream = vi.fn((_value: SystemConfiguration): Promise<void> => Promise.resolve());
    const service: SystemConfigService = await SystemConfigService.create(persistence, { onPersistedConfig: upstream });
    const Harness = (): React.ReactElement => {
      const [config, setConfig] = React.useState<SystemConfiguration>(service.state);
      return <DataSourcesPanel dataSources={config.dataSources} onCreateSource={vi.fn()} onDeleteSource={vi.fn()}
        onFetchApicalDataNow={vi.fn()} onLoadApicalEvents={vi.fn()} onReprocessApicalData={vi.fn()}
        onSaveSource={(id: string, changes: Partial<DataSourceConfig>): Promise<void> => service.updateSource(id, changes)
          .then((next: SystemConfiguration): void => setConfig(next))} />;
    };
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
    await act(async (): Promise<void> => root?.render(<Harness />));
    const source: HTMLButtonElement = container.querySelector('[data-source-id="source-rfid"]')!;
    await act(async (): Promise<void> => source.click());
    const input: HTMLInputElement = container.querySelector('input[aria-label="Source Name source-rfid"]')!;
    await act(async (): Promise<void> => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'Edited finish decoder');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async (): Promise<void> => {
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); 
    });
    expect(saved.dataSources[0]?.name).toBe('Edited finish decoder');
    expect(persistence.save).toHaveBeenCalledOnce();
    expect(upstream).toHaveBeenCalledOnce();
    const back: HTMLButtonElement | undefined = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button: HTMLButtonElement): boolean => button.textContent === 'Back to data sources');
    if (width < 960) {
      expect(back).toBeTruthy();
      await act(async (): Promise<void> => back?.click());
      await act(async (): Promise<void> => source.click());
    }
    expect(container.querySelector('input[aria-label="Source Name source-rfid"]')).toBe(input);
    expect(input.value).toBe('Edited finish decoder');
    expect(container.querySelector('select')).toBeNull();
    expect(container.querySelector('button:not(.MuiButtonBase-root)')).toBeNull();
  });
});
