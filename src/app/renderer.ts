import "./index.css";
import { startApp } from './mount';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}

console.log('👋 This message is being logged by "renderer.js", included via webpack');
