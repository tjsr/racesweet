import { dirname, resolve } from 'path';

import { fileURLToPath } from 'url';

const vitestConfigFile = 'vitest.config.mts';
const vitestWorkspaceFile = 'vitest.workspace.ts'
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fullConfigPath = resolve(__dirname, vitestConfigFile);
console.debug(`vitest config file (${vitestConfigFile}) in ${vitestWorkspaceFile} resolves to ${fullConfigPath}.`);

export default [
  fullConfigPath,
];
