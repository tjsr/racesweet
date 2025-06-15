import './state.ts';

// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { InvalidIpcChannelError, SendChannels } from '../model/electronIpcTypes.ts';
import { IpcRendererEvent, contextBridge, ipcRenderer } from 'electron';
import { ReadContentErrorIpcReceiveChannel, ReadContentIpcReceiveChannel, RequestReadIpcSendChannel, VALID_RECEIVE_CHANNELS, VALID_SEND_CHANNELS } from '../model/electronIpc.ts';

type dependencies = 'chrome'| 'node'| 'electron';

interface ProcessVersions {
  chrome: string;
  node: string;
  electron: string;
}

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

contextBridge.exposeInMainWorld(
  "api", {
    receive: (channel: string, func: (...args: unknown[]) => unknown): void => {
      // whitelist channels
      if (VALID_RECEIVE_CHANNELS.includes(channel)) {
        // Deliberately strip event as it includes `sender` 
        ipcRenderer.on(channel, (_event: IpcRendererEvent, ...args: unknown[]) => func(...args));
      } else {
        throw new InvalidIpcChannelError(channel);
      }
    },
    requestFileContent: <DataType>(filePath: string): Promise<DataType> => {
      return new Promise<DataType>(
        (
          resolve: (value: DataType | PromiseLike<DataType>) => void,
          reject: (reason?: string | Error) => void
        ) => {
          const outgoingEventId = crypto.randomUUID(); // Generate a unique event ID for this request
          eventCalls[outgoingEventId] = [resolve, reject];
          ipcRenderer.send(RequestReadIpcSendChannel, filePath, outgoingEventId);
        });
    },
    send: (channel: SendChannels, ...args: unknown[]): void => {
      // whitelist channels
      if (VALID_SEND_CHANNELS.includes(channel)) {
        ipcRenderer.send(channel, ...args);
      } else {
        throw new InvalidIpcChannelError(channel);
      }
    },
  }
);
