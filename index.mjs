import { BrowserWindow, app, ipcMain } from 'electron';

import electronDebug from 'electron-debug';
import { fileURLToPath } from 'url';
// import logger from 'electron-timber';
import path from 'path';

// const debugLog = logger.create({name: 'debug', logLevel: 'info'});
export const debug = (...args) => {
  // debugLog.log(...args);
  console.log(...args);
};


if (process.env.NODE_ENV === 'development') {
  electronDebug({
    devToolsMode: 'detach',
    showDevTools: true,
   });
}

// add an await call here to guarantee that path setup will finish before `ready`
await import('./set-up-paths.mjs')

// app.whenReady().then(() => {
//   console.log('This code may execute before the above import')
// });

const createWindow = () => {
  const preloadPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'preload.mjs');
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: true,
      contextIsolation: false,
    }
  })

  win.loadFile('index.html')
  debug('Loaded index.html');
}; 

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
});

app.whenReady().then(() => {
  ipcMain.handle('ping', () => 'pong')
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
});

if (process.env.NODE_ENV === 'development') {
  const chokidar = await import('chokidar');

  const watcher = chokidar.watch('./', {
    ignored: [
      /node_modules|[\/\\]\./,
      /.\..*/
    ],
    persistent: true
  });

  watcher.on('change', (filePath) => {
    debug(`File changed file: ${filePath}`);
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.reloadIgnoringCache();
    });
  });
}