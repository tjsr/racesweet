import './runtimeSourceMaps.ts';
import './state.ts';

import { FileReadDataType, SelectLocalFileOptions } from './window.ts';
import { InvalidIpcChannelError, SendChannels } from '../model/electronIpcTypes.ts';
import { IpcRendererEvent, ipcRenderer } from 'electron';
import {
  ReadContentErrorIpcReceiveChannel,
  ReadContentIpcReceiveChannel,
  RequestReadIpcSendChannel,
  RequestSelectLocalFileIpcInvokeChannel,
  RequestWriteIpcSendChannel,
  VALID_RECEIVE_CHANNELS,
  VALID_SEND_CHANNELS,
  WriteContentErrorIpcReceiveChannel,
  WriteContentIpcReceiveChannel,
} from '../model/electronIpc.ts';
import { getRaceSweetServerPort } from './serverPort.ts';

// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

window.addEventListener('DOMContentLoaded', () => {
  console.log('Content loaded in preload.ts, replacing text...');
  const replaceText = (selector: string, text: string) => {
    const element = document.getElementById(selector);
    if (element) element.innerText = text;
  };

  for (const dependency of ['chrome', 'node', 'electron']) {
    if (process.versions && process.versions[dependency] !== undefined) {
      replaceText(`${dependency}-version`, process.versions[dependency]);
    }
  }
});
window.actualPort = getRaceSweetServerPort();
// const {contextBridge, ipcRenderer} = require("electron");

const eventCalls: Record<string, [(data: (never | PromiseLike<never>)) => void, (reason?: string|Error) => void]> = {};

ipcRenderer.on(ReadContentIpcReceiveChannel,
  (event: IpcRendererEvent, eventId: string, data: unknown): void => {
    if (eventCalls[eventId] !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eventCalls[eventId][0](data as any);
      delete eventCalls[eventId];
    }
  });

ipcRenderer.on(ReadContentErrorIpcReceiveChannel,
  (event: IpcRendererEvent, eventId: string, error?: string|Error): void => {
    if (eventCalls[eventId] !== undefined) {
      eventCalls[eventId][1](error);
      delete eventCalls[eventId];
    }
  });

ipcRenderer.on(WriteContentIpcReceiveChannel,
  (event: IpcRendererEvent, eventId: string): void => {
    if (eventCalls[eventId] !== undefined) {
      eventCalls[eventId][0](undefined as never);
      delete eventCalls[eventId];
    }
  });

ipcRenderer.on(WriteContentErrorIpcReceiveChannel,
  (event: IpcRendererEvent, eventId: string, error?: string|Error): void => {
    if (eventCalls[eventId] !== undefined) {
      eventCalls[eventId][1](error);
      delete eventCalls[eventId];
    }
  });

window.api = {
  receive: (channel: string, func: (...args: unknown[]) => unknown): void => {
    if (VALID_RECEIVE_CHANNELS.includes(channel)) {
      ipcRenderer.on(channel, (_event: IpcRendererEvent, ...args: unknown[]) => func(...args));
    } else {
      throw new InvalidIpcChannelError(channel);
    }
  },
  requestBuffer: (filePath: string): Promise<Buffer> => {
    return new Promise<Buffer>(
      (
        resolve: (value: Buffer | PromiseLike<Buffer>) => void,
        reject: (reason?: string | Error) => void
      ) => {
        const outgoingEventId = crypto.randomUUID();
        eventCalls[outgoingEventId] = [resolve, reject];
        ipcRenderer.send(RequestReadIpcSendChannel, filePath, outgoingEventId, 'buffer');
      });
  },
  requestFileContent: <DataType>(filePath: string, dataType: FileReadDataType = 'utf8'): Promise<DataType> => {
    return new Promise<DataType>(
      (
        resolve: (value: DataType | PromiseLike<DataType>) => void,
        reject: (reason?: string | Error) => void
      ) => {
        const outgoingEventId = crypto.randomUUID();
        eventCalls[outgoingEventId] = [resolve, reject];
        ipcRenderer.send(RequestReadIpcSendChannel, filePath, outgoingEventId, dataType);
      });
  },
  selectLocalFile: (options?: SelectLocalFileOptions): Promise<string | undefined> => {
    return ipcRenderer.invoke(RequestSelectLocalFileIpcInvokeChannel, options) as Promise<string | undefined>;
  },
  send: (channel: SendChannels, ...args: unknown[]): void => {
    if (VALID_SEND_CHANNELS.includes(channel)) {
      ipcRenderer.send(channel, ...args);
    } else {
      throw new InvalidIpcChannelError(channel);
    }
  },
  writeFileContent: (filePath: string, contents: string): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      const outgoingEventId = crypto.randomUUID();
      eventCalls[outgoingEventId] = [resolve as never, reject];
      ipcRenderer.send(RequestWriteIpcSendChannel, filePath, outgoingEventId, contents);
    });
  },
};

window.nodeAPI = {
  createBuffer: (data: string | Uint8Array | ArrayBuffer) => {
    if (typeof data === 'string') {
      return Buffer.from(data);
    }
    if (data instanceof Uint8Array) {
      return Buffer.from(data);
    }
    return Buffer.from(new Uint8Array(data));
  },
};

window.versions = {
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron,
  node: () => process.versions.node,
};
