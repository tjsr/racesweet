import "./index.css";

import { startApp } from './mount.js';

declare global {
  interface Window {
    versions: {
      node: () => string;
      chrome: () => string;
      electron: () => string;
    };
    actualPort: number;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}

console.log('👋 This message is being logged by "renderer.js", included via webpack');
