import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const outputDirectory = path.resolve('dist', 'web');
await mkdir(outputDirectory, { recursive: true });
const applicationScriptNames = (await readdir(outputDirectory))
  .filter((fileName) => /^app\.[a-f0-9]+\.js$/u.test(fileName));
if (applicationScriptNames.length !== 1) {
  throw new Error(
    `Expected exactly one content-hashed RaceSweet application script, found ${applicationScriptNames.length}.`,
  );
}
const htmlTemplate = await readFile(
  path.resolve('src', 'app', 'web', 'index.html'),
  'utf8',
);
const applicationHtml = htmlTemplate.replace(
  '/app.js',
  `/${applicationScriptNames[0]}`,
);
await writeFile(
  path.join(outputDirectory, 'index.html'),
  applicationHtml,
  'utf8',
);
