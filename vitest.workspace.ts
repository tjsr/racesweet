const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { dirname, resolve } from 'path';

import { fileURLToPath } from 'url';

export default [
  resolve(__dirname, 'vitest.config.mts'),
];
