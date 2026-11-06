// @vitest-environment jsdom

import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button, TextField } from '@mui/material';
import {
  ADMIN_BREAKPOINTS, AdminActionBar, AdminAutocompleteField, AdminChoiceGroup, AdminFieldGrid,
  AdminFormSection, AdminMasterDetailLayout, AdminSelectField, ResponsiveDataList, ResponsiveDialog,
} from './adminPrimitives.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('shared administration primitives', (): void => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;
  afterEach((): void => {
    act((): void => root?.unmount());
    container?.remove();
    vi.unstubAllGlobals();
  });

  it.each([360, 600, 768, 960, 1280])('preserves a detail draft across list/detail transitions at %spx', (width: number): void => {
    vi.stubGlobal('matchMedia', (query: string): MediaQueryList => ({
      addEventListener: (): void => undefined, addListener: (): void => undefined,
      dispatchEvent: (): boolean => false, matches: query.includes('min-width:960px') && width >= 960,
      media: query, onchange: null, removeEventListener: (): void => undefined, removeListener: (): void => undefined,
    }));
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    const back = vi.fn<() => void>();
    let mounts: number = 0;
    const Draft = (): React.ReactElement => {
      React.useEffect((): void => {
        mounts += 1; 
      }, []);
      return <TextField defaultValue="Draft survives" label="Draft" />;
    };
    act((): void => root?.render(<AdminMasterDetailLayout detail={<Draft />} list={<div>People</div>}
      onBack={back} selectedId="person-1" />));
    const input: HTMLInputElement = container.querySelector('input')!;
    const open: HTMLButtonElement | undefined = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button: HTMLButtonElement): boolean => button.textContent === 'Open details');
    act((): void => open?.click());
    const backButton: HTMLButtonElement | undefined = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button: HTMLButtonElement): boolean => button.textContent === 'Back to list');
    act((): void => backButton?.click());
    if (width < 960) expect(back).toHaveBeenCalledOnce();
    else expect(back).not.toHaveBeenCalled();
    expect(container.querySelector('input')).toBe(input);
    expect(input.value).toBe('Draft survives');
    expect(mounts).toBe(1);
  });

  it('provides labelled MUI choices, pending/errors, row labels, and a responsive dialog', async (): Promise<void> => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    const toggle = vi.fn<(value: string, checked: boolean) => void>();
    act((): void => root?.render(<AdminFormSection title="Settings"><AdminFieldGrid>
      <AdminSelectField label="Source" onValueChange={vi.fn()} options={[{ label: 'Timing', value: 'timing' }]} value="timing" />
      <AdminAutocompleteField label="Person" onValueChange={vi.fn()} options={[{ label: 'Alex', value: 'alex' }]} value="alex" />
      <AdminChoiceGroup label="Enabled sources" onToggle={toggle} options={[{ label: 'RFID', value: 'rfid' }]} values={[]} />
    </AdminFieldGrid><AdminActionBar error="Save failed" pending><Button>Save</Button></AdminActionBar>
    <ResponsiveDataList label="Devices" rows={[{ cells: [{ label: 'Decoder', value: 'Finish' }], id: 'decoder-1' }]} />
    <ResponsiveDialog aria-label="Review" open={false}><div>Review changes</div></ResponsiveDialog>
    </AdminFormSection>));
    expect(ADMIN_BREAKPOINTS).toEqual({ desktop: 960, phone: 600 });
    expect(container.querySelectorAll('[role="combobox"]')).toHaveLength(2);
    expect(container.querySelector('select')).toBeNull();
    const checkbox: HTMLInputElement = container.querySelector('input[type="checkbox"]')!;
    act((): void => checkbox.click());
    expect(toggle).toHaveBeenCalledWith('rfid', true);
    expect(container.textContent).toContain('Save failed');
    expect(container.textContent).toContain('Saving');
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(container.querySelector('[role="listitem"]')?.textContent).toContain('DecoderFinish');
  });
});
