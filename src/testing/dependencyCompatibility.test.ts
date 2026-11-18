import { closeSync, existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import webpack, { type Stats } from 'webpack';

interface TempApi {
  track(): TempApi;
  mkdir(prefix: string): Promise<string>;
  mkdirSync(prefix: string): string;
  open(prefix: string): Promise<{ path: string; fd: number }>;
  openSync(prefix: string): { path: string; fd: number };
  cleanup(): Promise<{ dirs: number; files: number }>;
  cleanupSync(): { dirs: number; files: number };
}

const loadCommonJs: NodeJS.Require = createRequire(path.resolve('package.json'));
const temporaryFiles: TempApi = loadCommonJs('./packages/vendor/temp/lib/temp.js') as TempApi;
const readMetadata: (options: { src: string; logger: (message: string) => void }) => Promise<{ name: string }> =
  loadCommonJs('./packages/vendor/electron-installer-common/src/readmetadata.js') as typeof readMetadata;

describe('dependency replacement compatibility', (): void => {
  it('uses native cancellation with abort events, reasons, and throwIfAborted', (): void => {
    const cancellation: { AbortController: typeof AbortController; AbortSignal: typeof AbortSignal } =
      loadCommonJs('./packages/native-abort-controller/index.cjs') as typeof cancellation;
    const controller: AbortController = new cancellation.AbortController();
    const onAbort: () => void = vi.fn();
    controller.signal.addEventListener('abort', onAbort, { once: true });
    const reason: Error = new Error('Cancelled compilation');
    controller.abort(reason);
    expect(onAbort).toHaveBeenCalledOnce();
    expect(controller.signal.reason).toBe(reason);
    expect((): void => controller.signal.throwIfAborted()).toThrow(reason);
    expect(cancellation.AbortSignal).toBe(globalThis.AbortSignal);
  });

  it('preserves the checker filesystem API with the maintained memory filesystem', (): void => {
    interface CheckerFileSystem {
      writeFile(file: string, data: string): void;
      readFile(file: string, encoding: BufferEncoding): string | undefined;
      readDir(directory: string): Array<{ name: string }>;
      updateTimes(file: string, atime: Date, mtime: Date): void;
      deleteFile(file: string): void;
      exists(file: string): boolean;
    }
    const memory: CheckerFileSystem = (loadCommonJs('fork-ts-checker-webpack-plugin/lib/typescript/worker/lib/file-system/mem-file-system.js') as { memFileSystem: CheckerFileSystem }).memFileSystem;
    const file: string = path.join(os.tmpdir(), 'racesweet-checker-compat', 'fixture.ts');
    memory.writeFile(file, 'export const value = 1;');
    expect(memory.readFile(file, 'utf8')).toBe('export const value = 1;');
    expect(memory.readDir(path.dirname(file)).map((entry: { name: string }): string => entry.name)).toContain('fixture.ts');
    memory.updateTimes(file, new Date(), new Date());
    memory.deleteFile(file);
    expect(memory.exists(file)).toBe(false);
  });
  it('composes source maps with the maintained codec', (): void => {
    interface SourceMap { mappings: string; names: string[]; sources: string[]; sourcesContent: string[] }
    const merge: (base: SourceMap, extension: SourceMap) => SourceMap =
      loadCommonJs('./packages/vendor/asset-relocator/src/utils/merge-source-maps.js') as typeof merge;
    const base: SourceMap = { mappings: 'AAAA', names: [], sources: ['input.js'], sourcesContent: ['original'] };
    const extension: SourceMap = { mappings: 'AAAA', names: [], sources: ['intermediate.js'], sourcesContent: ['generated'] };
    expect(merge(base, extension)).toEqual(expect.objectContaining({ mappings: 'AAAA', sources: ['input.js'], sourcesContent: ['original'] }));
  });

  it('discovers and emits shared native libraries', async (): Promise<void> => {
    interface AssetState { assetMeta: Record<string, { path: string; permissions: number }>; assetSymlinks: Record<string, string> }
    const emit: (directory: string, state: AssetState, base: string, write: (name: string, content: Buffer) => void, debug: boolean) => Promise<void> =
      loadCommonJs('./packages/vendor/asset-relocator/src/utils/sharedlib-emit.js') as typeof emit;
    const directory: string = await mkdtemp(path.join(os.tmpdir(), 'racesweet-shared-'));
    try {
      const library: string = process.platform === 'win32' ? 'fixture.dll' : 'fixture.so';
      await writeFile(path.join(directory, library), 'native fixture');
      const state: AssetState = { assetMeta: {}, assetSymlinks: {} };
      const emitted: Map<string, string> = new Map<string, string>();
      await emit(directory, state, 'assets/', (name: string, content: Buffer): void => { emitted.set(name, content.toString()); }, false);
      expect(emitted.get(`assets/${library}`)).toBe('native fixture');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('exposes the complete native DOMException constructor', (): void => {
    const NativeException: typeof DOMException = loadCommonJs('./packages/native-domexception/index.cjs') as typeof DOMException;
    const exception: DOMException = new NativeException('Cancelled', 'AbortError');
    expect(NativeException).toBe(globalThis.DOMException);
    expect(exception.name).toBe('AbortError');
    expect(exception.message).toBe('Cancelled');
    expect(exception.code).toBe(DOMException.ABORT_ERR);
    expect(exception).toBeInstanceOf(Error);
  });
  it('preserves asynchronous and synchronous temporary directory cleanup', async (): Promise<void> => {
    temporaryFiles.track();
    const asynchronousDirectory: string = await temporaryFiles.mkdir('racesweet-async-');
    const asynchronousFile: { path: string; fd: number } = await temporaryFiles.open('racesweet-async-file-');
    closeSync(asynchronousFile.fd);
    await writeFile(path.join(asynchronousDirectory, 'literal[1].txt'), 'content');
    expect(existsSync(asynchronousDirectory)).toBe(true);
    expect(await temporaryFiles.cleanup()).toEqual({ dirs: 1, files: 1 });
    expect(existsSync(asynchronousDirectory)).toBe(false);
    expect(existsSync(asynchronousFile.path)).toBe(false);
    const synchronousDirectory: string = temporaryFiles.mkdirSync('racesweet-sync-');
    const synchronousFile: { path: string; fd: number } = temporaryFiles.openSync('racesweet-sync-file-');
    closeSync(synchronousFile.fd);
    expect(temporaryFiles.cleanupSync()).toEqual({ dirs: 1, files: 1 });
    expect(existsSync(synchronousDirectory)).toBe(false);
    expect(existsSync(synchronousFile.path)).toBe(false);
  });

  it('finds packaged macOS metadata through the maintained glob API', async (): Promise<void> => {
    const directory: string = await mkdtemp(path.join(os.tmpdir(), 'racesweet-metadata-'));
    try {
      const appDirectory: string = path.join(directory, 'RaceSweet.app', 'Contents', 'Resources', 'app');
      await mkdir(appDirectory, { recursive: true });
      await writeFile(path.join(appDirectory, 'package.json'), JSON.stringify({ name: 'racesweet-fixture' }));
      expect(await readMetadata({ src: directory, logger: (): void => undefined }))
        .toEqual({ name: 'racesweet-fixture' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('bundles a Node consumer and relocates its file asset', async (): Promise<void> => {
    const directory: string = await mkdtemp(path.join(os.tmpdir(), 'racesweet-relocator-'));
    try {
      const entry: string = path.join(directory, 'entry.cjs');
      await writeFile(path.join(directory, 'fixture.txt'), 'relocated content');
      await writeFile(entry, "module.exports = require('fs').readFileSync(__dirname + '/fixture.txt', 'utf8');");
      await new Promise<void>((resolve: () => void, reject: (error: Error) => void): void => {
        webpack({
          entry, mode: 'development', target: 'node',
          output: { path: path.join(directory, 'output'), filename: 'bundle.cjs', library: { type: 'commonjs2' } },
          module: { rules: [{ test: /\.cjs$/u, use: { loader: path.resolve('packages/vendor/asset-relocator/src/asset-relocator.js'), options: { outputAssetBase: 'assets', filterAssetBase: directory } } }] },
        }, (error: Error | null | undefined, stats: Stats | undefined): void => {
          if (error || !stats || stats.hasErrors()) {
            reject(error || new Error(stats?.toString({ all: false, errors: true }) || 'No webpack result'));
          } else {
            resolve();
          }
        });
      });
      expect(loadCommonJs(path.join(directory, 'output', 'bundle.cjs'))).toBe('relocated content');
      expect(await readFile(path.join(directory, 'output', 'assets', 'fixture.txt'), 'utf8')).toBe('relocated content');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
