import './index.css';

import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.tsx';

const container = document.getElementById('app');
if (!container) {
  throw new Error("Root element #app not found in index.html");
}

const root = createRoot(container);
root.render(React.createElement(App));
