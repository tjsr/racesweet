import './index.css';
import App from './App.tsx';
import React from 'react';
import { createRoot } from 'react-dom/client';

const container = document.getElementById('app');
if (!container) {
  throw new Error("Root element with id 'app' not found");
}

const root = createRoot(container);
root.render(React.createElement(App));
