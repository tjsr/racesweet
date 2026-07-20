import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { writeApplicationFile } from './fileWrite.js';
import { getFileWriteFailure, getFileWriteGuidance } from './fileWriteDiagnostics.js';

describe('writeApplicationFile', () => {
  const runtime = {
    getUserDataPath: (): string => 'C:\\Users\\test\\AppData\\Roaming\\RaceSweet',
    resolvePath: (filename: string): string => path.resolve(filename),
  };

  it('creates the parent directory, writes the content, and returns resolved diagnostics', async () => {
    const directoryPath = await mkdtemp(path.join(tmpdir(), 'racesweet-file-write-'));
    const filename = path.join(directoryPath, 'nested', 'catalog.json');
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const diagnostics = await writeApplicationFile({ contents: '{"schemaVersion":1}', dataType: 'utf8', filename, options: {
      context: { eventId: 'event-1', operation: 'catalog persistence' },
    } }, runtime);

    await expect(readFile(filename, 'utf8')).resolves.toBe('{"schemaVersion":1}');
    expect(diagnostics).toMatchObject({
      currentWorkingDirectory: process.cwd(),
      operation: { eventId: 'event-1', operation: 'catalog persistence' },
      requestedPath: filename,
      resolvedPath: path.resolve(filename),
    });
    expect(infoSpy).toHaveBeenCalledWith('File write succeeded', diagnostics);
  });

  it('returns structured diagnostics when the destination is a directory', async () => {
    const directoryPath = await mkdtemp(path.join(tmpdir(), 'racesweet-file-write-'));
    const destinationPath = path.join(directoryPath, 'event.json');
    await mkdir(destinationPath);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(writeApplicationFile({ contents: '{}', dataType: 'utf8', filename: destinationPath }, runtime)).rejects.toMatchObject({
      diagnostics: expect.objectContaining({ code: 'EISDIR', resolvedPath: path.resolve(destinationPath) }),
      guidance: getFileWriteGuidance('EISDIR'),
    });
    expect(errorSpy).toHaveBeenCalledOnce();
  });

  it('maps permission, missing path, busy file, and unknown Windows failures to recovery guidance', () => {
    expect(getFileWriteGuidance('EACCES')).toContain('permission');
    expect(getFileWriteGuidance('ENOENT')).toContain('save location');
    expect(getFileWriteGuidance('EBUSY')).toContain('in use');
    expect(getFileWriteGuidance('UNKNOWN')).toContain('Windows could not open');
  });

  it('recognizes diagnostics from a separately bundled preload error realm', () => {
    const foreignError = {
      diagnostics: {
        attemptId: 'save-attempt-1',
        currentWorkingDirectory: 'C:\\dev\\racesweet',
        durationMilliseconds: 1,
        message: 'unknown error, open',
        osUserName: 'tim',
        parentDirectoryPath: 'C:\\dev\\racesweet\\src\\generated',
        payloadByteLength: 10,
        payloadType: 'utf8' as const,
        processId: 1234,
        queuedBehindApplicationWrite: false,
        queueWaitMilliseconds: 0,
        requestedPath: '../../src/generated/event.json',
        resolvedPath: 'C:\\dev\\racesweet\\src\\generated\\event.json',
        startedAt: '2026-07-20T00:00:00.000Z',
        userDataPath: 'C:\\Users\\tim\\AppData\\Roaming\\RaceSweet',
      },
      guidance: 'Windows could not open the save file.',
      message: 'Could not save event data.',
      name: 'FileWriteFailureError',
    };

    expect(getFileWriteFailure(foreignError)).toMatchObject({
      diagnostics: { attemptId: 'save-attempt-1' },
      guidance: 'Windows could not open the save file.',
      message: 'Could not save event data.',
    });
  });
});
