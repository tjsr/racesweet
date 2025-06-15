// import { ipcMain } from "electron";
// const { ipcMain } = require("electron");

export type AvailableSendChannels = 'askToRead' | 'askToWrite';
export type AvailableReceiveChannels = 'sendReadContent' | 'sendReadError' | 'sendWriteContent' | 'sendWriteError';

declare global {
  interface Window {
    api: {
      // receivePromise: <T>(channel: AvailableReceiveChannels) => Promise<T>;
      // receive:
      //   // ((channel: AvailableReceiveChannels, func: (...args: unknown[]) => unknown) => void) |
      //   ((channel: 'sendReadError', func: (eventId: string, error: string) => void) => void) |
      //   ((channel: 'sendReadContent', func: (eventId: string, data: string) => void) => void) |
      //   ((channel: 'sendWriteContent', func: (eventId: string, data: string) => void) => void) |
      //   ((channel: 'sendWriteError', func: (eventId: string, error: string) => void) => void) |
      //   ((channel: string, func: (...data: unknown[]) => void) => void);
      // send: (channel: AvailableSendChannels, ...args: unknown[]) => void;
      requestFileContent: <DataType>(filePath: string) => Promise<DataType>;
    },
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
