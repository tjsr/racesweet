import { RaceSweetMainApp } from './App';
import React from 'react';
import { createRoot } from 'react-dom/client';

export const mountApp = (container: HTMLElement): void => {
  const root = createRoot(container);
  root.render(React.createElement(RaceSweetMainApp));
};

export const startApp = (): void => {
  const appHost = document.getElementById('app');
  if (!appHost) {
    console.error('[RaceSweet] Cannot mount: no element with id="app" found. Page will appear blank.');
    return;
  }
  mountApp(appHost);
};
