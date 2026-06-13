import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const roots = process.argv.slice(2);
const scanRoots = roots.length > 0 ? roots : ['src'];

const findJsonFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return findJsonFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith('.json') ? [entryPath] : [];
  }));

  return nestedFiles.flat();
};

const lintJsonFile = async (filePath) => {
  const content = await readFile(filePath, 'utf8');
  try {
    JSON.parse(content);
    return undefined;
  } catch (error) {
    return `${filePath}: ${error instanceof Error ? error.message : String(error)}`;
  }
};

const jsonFiles = (await Promise.all(scanRoots.map(findJsonFiles))).flat();
const errors = (await Promise.all(jsonFiles.map(lintJsonFile))).filter(Boolean);

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
}
