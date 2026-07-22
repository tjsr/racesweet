import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = path.join(process.cwd(), 'src');
const forbiddenViewLayers = ['/ledger/', '/persistence/', '/service/'];

const collectProductionFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectProductionFiles(entryPath);
    }
    return entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx') || !/\.(ts|tsx)$/u.test(entry.name)
      ? []
      : [entryPath];
  }));
  return nestedFiles.flat();
};

describe('architecture boundaries', () => {
  it('keeps views outside durable and service layers', async () => {
    const files = await collectProductionFiles(path.join(sourceRoot, 'views'));
    const violations = await Promise.all(files.map(async (filePath) => {
      const content = await readFile(filePath, 'utf8');
      return forbiddenViewLayers.some((layer) => content.replaceAll('\\', '/').includes(layer))
        ? path.relative(sourceRoot, filePath)
        : undefined;
    }));
    expect(violations.filter((value): value is string => value !== undefined)).toEqual([]);
  });

  it('does not retain the legacy view-owned event workflow', async () => {
    await expect(readFile(path.join(sourceRoot, 'views', 'events', 'EventsTab.tsx'))).rejects.toThrow();
    await expect(readFile(path.join(sourceRoot, 'views', 'events', 'ImportEventsModal.tsx'))).rejects.toThrow();
  });

  it('keeps extracted manual and category transformations in processing', async () => {
    const manualRecords = await readFile(path.join(sourceRoot, 'processing', 'manualRecords.ts'), 'utf8');
    const categoryDraft = await readFile(path.join(sourceRoot, 'processing', 'categoryDraft.ts'), 'utf8');
    expect(manualRecords).toContain('buildManualFlagRecord');
    expect(manualRecords).toContain('buildManualPassingRecord');
    expect(categoryDraft).toContain('buildCategoryChanges');
  });
});
