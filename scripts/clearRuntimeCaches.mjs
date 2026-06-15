import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const pathsToRemove = [
  '.tsx',
  '.ts-node',
  '.vitest',
  '.vite',
  join('node_modules', '.vite'),
  join('node_modules', '.cache', 'tsx'),
  join('node_modules', '.cache', 'esbuild'),
  join('node_modules', '.experimental-vitest-cache'),
];

await Promise.all(pathsToRemove.map(async (relativePath) => {
  await rm(join(root, relativePath), { force: true, recursive: true }).catch(() => undefined);
}));

const sourceExtensions = ['.ts', '.tsx', '.mts'];
const staleExtensions = ['.js', '.js.map', '.mjs', '.mjs.map'];

const removeStaleCompiledSidecars = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const fileNames = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));

  await Promise.all(entries.map(async (entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') {
        return;
      }
      await removeStaleCompiledSidecars(entryPath);
      return;
    }

    if (!entry.isFile()) {
      return;
    }

    const staleExtension = staleExtensions.find((extension) => entry.name.endsWith(extension));
    if (!staleExtension) {
      return;
    }

    const baseName = entry.name.slice(0, -staleExtension.length);
    const hasTypeScriptSource = sourceExtensions.some((extension) => fileNames.has(`${baseName}${extension}`));
    if (hasTypeScriptSource) {
      await rm(entryPath, { force: true });
    }
  }));
};

await removeStaleCompiledSidecars(join(root, 'src'));
