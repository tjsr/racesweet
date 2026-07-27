// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { useUiConsoleGuards } from '../../testing/uiConsoleGuards.js';
import { ServerConfigurationPanel } from './serverConfigurationPanel.js';

describe('ServerConfigurationPanel', () => {
  let container: HTMLDivElement;
  let root: Root;

  useUiConsoleGuards();

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('selects certificate and private key files instead of accepting typed paths', async () => {
    const onSaveListenerServer = vi.fn();
    const onSelectCertificateFile = vi.fn().mockResolvedValue('C:\\certificates\\listener.crt');
    const onSelectPrivateKeyFile = vi.fn().mockResolvedValue('C:\\certificates\\listener.key');

    await act(async () => {
      root.render(
        <ServerConfigurationPanel
          listenerServer={undefined}
          onSaveListenerServer={onSaveListenerServer}
          onSaveRemoteServer={vi.fn()}
          onSelectCertificateFile={onSelectCertificateFile}
          onSelectPrivateKeyFile={onSelectPrivateKeyFile}
          remoteServer={undefined}
        />,
      );
    });

    const certificateInput = container.querySelector('input[aria-label="SSL certificate file"]') as HTMLInputElement;
    const privateKeyInput = container.querySelector('input[aria-label="SSL private key file"]') as HTMLInputElement;
    expect(certificateInput.readOnly).toBe(true);
    expect(privateKeyInput.readOnly).toBe(true);

    await act(async () => {
      (Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Select certificate') as HTMLButtonElement).click();
    });
    await act(async () => {
      (Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Select private key') as HTMLButtonElement).click();
    });

    expect(onSaveListenerServer).toHaveBeenCalledWith({ certificatePath: 'C:\\certificates\\listener.crt' });
    expect(onSaveListenerServer).toHaveBeenCalledWith({ privateKeyPath: 'C:\\certificates\\listener.key' });
  });
});
