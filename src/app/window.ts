// import { ipcMain } from "electron";
// const { ipcMain } = require("electron");

export type AvailableSendChannels = 'askToRead' | 'askToWrite';
export type AvailableReceiveChannels = 'sendReadContent' | 'sendReadError' | 'sendWriteSuccess' | 'sendWriteError';
export type FileReadDataType = 'utf8' | 'buffer' | 'bytearray';

// import { BrowserWindow, app } from 'electron';

// import contextMenu from 'electron-context-menu';

// import remote, { Menu, MenuItem } from '@electron/remote';



// import remote from '@electron/remote';

// const Menu = remote.require('menu');
// const MenuItem = remote.require('menu-item');
declare global {
  interface Window {
    api: {
      receive: (channel: AvailableReceiveChannels | string, func: (...args: unknown[]) => unknown) => void;
      requestFileContent: <DataType>(filePath: string, dataType: FileReadDataType) => Promise<DataType>;
      requestBuffer: (filePath: string) => Promise<Buffer>;
      writeFileContent: (filePath: string, contents: string) => Promise<void>;
      send: (channel: AvailableSendChannels, ...args: unknown[]) => void;
    },
    nodeAPI: {
      createBuffer: (data: string | Uint8Array | ArrayBuffer) => Buffer;
    }
    versions: {
      node: () => string;
      chrome: () => string;
      electron: () => string;
    };
  }
}

// window.api.requestFileContent = <DataType>(path: string): Promise<DataType> => {
  
//   return new Promise((resolve, reject) => {
    
//     // window.api.receivePromise('sendReadContent')
//     // window.api.receive('sendReadContent', (filename: string, data: string): void => {
//     //   if (filename === path) {
//     //     resolve(data);
//     //   }
//     // });

//     // window.api.receive('sendReadError', (filename: string, error: string): void => {
//     //   if (filename === path) {
//     //     reject(new Error(`Error reading file ${filename}: ${error}`));
//     //   }
//     // });


//     // Send the request after we've defined what to do with any rceived response.
//     // window.api.send('askToRead', path);
//   });
// };



// // window.api.send('askToRead')

// ipcMain.on("askToRead", (event, file_name) => {
// 	fs.readFile(path.join(__dirname, file_name),'utf8', (error, data) => {
// 		win.webContents.send("sendReadContent", file_name, data);
// 	})
// })
