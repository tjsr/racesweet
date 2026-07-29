import { RaceSweetMainApp } from './App';
import { AuthenticatedRaceSweetApp } from './authenticatedApp.js';
import { RestartGate } from './restartGate.js';
import React from 'react';
import { createRoot } from 'react-dom/client';

export const mountApp = (container: HTMLElement): void => {
  const root = createRoot(container);
  const App = window.api ? AuthenticatedRaceSweetApp : RaceSweetMainApp;
  root.render(React.createElement(RestartGate, undefined, React.createElement(App)));
};

export const startApp = (): void => {
  const appHost = document.getElementById('app');
  if (!appHost) {
    console.error('[RaceSweet] Cannot mount: no element with id="app" found. Page will appear blank.');
    return;
  }
  mountApp(appHost);
};
