import { execFile as executeFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { EventId, SessionId } from '../model/raceevent.js';
import type { RaceState } from '../model/racestate.js';
import { type FileMakerTable, convertDurtFileMakerTablesToRaceState } from '../parsers/durt/fileMaker.js';

const execFile = promisify(executeFile);

export const extractDurtFileMakerJson = (databasePath: string, executablePath: string): Promise<string> => mkdtemp(path.join(tmpdir(), 'racesweet-durt-'))
  .then((temporaryDirectory: string): Promise<string> => {
    const outputPath: string = path.join(temporaryDirectory, 'database.json');
    return execFile(executablePath, [databasePath, outputPath], {
      maxBuffer: 128 * 1024 * 1024,
      windowsHide: true,
    })
      .then((): Promise<string> => readFile(outputPath, 'utf8'))
      .finally((): Promise<void> => rm(temporaryDirectory, { force: true, recursive: true }));
  });

export const getDurtCompanionDatabasePaths = (sourceFilePath: string): Promise<string[]> => {
  if (!['.fmp12', '.fp7'].includes(path.extname(sourceFilePath).toLowerCase())) {
    return Promise.resolve([]);
  }
  const sourceFileName = path.basename(sourceFilePath).toLowerCase();
  return readdir(path.dirname(sourceFilePath), { withFileTypes: true })
    .then((entries) => {
      const companionPatterns: RegExp[] = [
        /^rider registration.*\.(?:fmp12|fp7)$/i,
        /^enduro riders.*\.(?:fmp12|fp7)$/i,
        /^rider category nos ranges.*\.(?:fmp12|fp7)$/i,
        /^enduro v .*\.(?:fmp12|fp7)$/i,
        /^race event.*\.(?:fmp12|fp7)$/i,
        /^mt beauty .*\.(?:fmp12|fp7)$/i,
      ];
      return entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase() !== sourceFileName)
        .filter((entry) => companionPatterns.some((pattern) => pattern.test(entry.name)))
        .sort((left, right) => {
          const leftPriority = companionPatterns.findIndex((pattern) => pattern.test(left.name));
          const rightPriority = companionPatterns.findIndex((pattern) => pattern.test(right.name));
          return leftPriority - rightPriority || left.name.localeCompare(right.name);
        })
        .map((entry) => path.join(path.dirname(sourceFilePath), entry.name));
    })
    .catch((): string[] => []);
};

export const getBundledDurtFileMakerExtractorPath = (workspaceRoot: string = process.cwd()): string => {
  if (process.resourcesPath) {
    return path.join(process.resourcesPath, 'fmp2json.exe');
  }
  const installedPackagePath: string = path.join(workspaceRoot, 'node_modules', '@racesweet', 'fmptools-win32-x64', 'bin', 'fmp2json.exe');
  if (existsSync(installedPackagePath)) {
    return installedPackagePath;
  }
  return path.join(workspaceRoot, 'packages', 'fmptools-win32-x64', 'bin', 'fmp2json.exe');
};

export interface DurtFileMakerExtractor {
  extract: (databasePath: string, executablePath: string) => Promise<string>;
}

export interface LoadDurtFileMakerRaceStateOptions {
  additionalProgressSteps?: number;
  eventId: EventId;
  executablePath: string;
  onProgress?: (progress: DurtFileMakerLoadProgress) => void | Promise<void>;
  sessionId: SessionId;
  sourceFilePath: string;
  timeZone?: string;
}

export interface DurtFileMakerLoadProgress {
  callerName?: string;
  completed: number;
  currentFile?: string;
  currentTask?: string;
  total: number;
}

export interface DurtEventCatalogImportService<TCatalog> {
  replaceImportedRaceState: (eventId: EventId, sessionId: SessionId, raceState: Partial<RaceState>) => Promise<TCatalog>;
  syncEventScaffold: (
    eventId: EventId,
    categories: NonNullable<RaceState['categories']>,
    participants: NonNullable<RaceState['participants']>,
    entries: NonNullable<RaceState['entries']>,
    teams: NonNullable<RaceState['teams']>,
    sessionId: SessionId
  ) => Promise<unknown>;
}

const defaultExtractor: DurtFileMakerExtractor = {
  extract: extractDurtFileMakerJson,
};

const isFileMakerTable = (value: unknown): value is FileMakerTable => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<FileMakerTable>;
  return typeof candidate.name === 'string' && Array.isArray(candidate.columns) && Array.isArray(candidate.values);
};

export const parseFileMakerExtractorOutput = (output: string): FileMakerTable[] => {
  let parsedOutput: unknown;
  try {
    parsedOutput = JSON.parse(output) as unknown;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`DURT FileMaker extractor returned invalid JSON: ${message}`);
  }
  if (!Array.isArray(parsedOutput) || !parsedOutput.every(isFileMakerTable)) {
    throw new Error('DURT FileMaker extractor output must be an array of tables with name, columns, and values.');
  }
  return parsedOutput;
};

export const loadDurtFileMakerRaceState = (
  options: LoadDurtFileMakerRaceStateOptions,
  extractor: DurtFileMakerExtractor = defaultExtractor
): Promise<Partial<RaceState>> => getDurtCompanionDatabasePaths(options.sourceFilePath)
  .then((companionPaths: string[]) => {
    const databasePaths: string[] = [options.sourceFilePath, ...companionPaths];
    const total: number = databasePaths.length + 1 + (options.additionalProgressSteps || 0);
    const reportProgress = (progress: DurtFileMakerLoadProgress): Promise<void> => options.onProgress
      ? Promise.resolve(options.onProgress(progress))
      : Promise.resolve();

    return reportProgress({
      callerName: 'Importing DURT FileMaker database',
      completed: 0,
      currentTask: 'Preparing FileMaker database import',
      total,
    }).then(() => databasePaths.reduce<Promise<FileMakerTable[]>>((tablesPromise: Promise<FileMakerTable[]>, databasePath: string, index: number) => tablesPromise
      .then((tables: FileMakerTable[]) => extractor.extract(databasePath, options.executablePath)
        .then(parseFileMakerExtractorOutput)
        .then((extractedTables: FileMakerTable[]) => reportProgress({
          callerName: 'Importing DURT FileMaker database',
          completed: index + 1,
          currentFile: path.basename(databasePath),
          currentTask: `Extracted ${path.basename(databasePath)}`,
          total,
        }).then(() => [...tables, ...extractedTables]))), Promise.resolve([]))
      .then((tables: FileMakerTable[]) => {
        const raceState: Partial<RaceState> = convertDurtFileMakerTablesToRaceState(tables, options);
        return reportProgress({
          callerName: 'Importing DURT FileMaker database',
          completed: databasePaths.length + 1,
          currentTask: 'Converted DURT entrants and crossings',
          total,
        }).then(() => raceState);
      }));
  });

export const importDurtFileMakerRaceState = <TCatalog>(
  options: LoadDurtFileMakerRaceStateOptions,
  catalogService: DurtEventCatalogImportService<TCatalog>,
  extractor: DurtFileMakerExtractor = defaultExtractor
): Promise<TCatalog> => loadDurtFileMakerRaceState(options, extractor)
    .then((raceState: Partial<RaceState>) => catalogService.syncEventScaffold(
      options.eventId,
      raceState.categories || [],
      raceState.participants || [],
      raceState.entries || [],
      raceState.teams || [],
      options.sessionId
    ).then(() => catalogService.replaceImportedRaceState(options.eventId, options.sessionId, raceState)));
