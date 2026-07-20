import { access, constants, mkdir, writeFile } from 'node:fs/promises';
import { userInfo } from 'node:os';
import path from 'node:path';

import type { FileWriteDataType } from './window.js';
import {
  type FileWriteDiagnostics,
  type FileWriteFailurePayload,
  type FileWriteOptions,
  getFileWriteGuidance,
} from './fileWriteDiagnostics.js';

export interface FileWriteRequest {
  contents: string;
  dataType: FileWriteDataType;
  filename: string;
  options?: FileWriteOptions;
}

export interface FileWriteRuntime {
  getUserDataPath: () => string;
  resolvePath: (filename: string) => string;
}

const pendingWritesByPath = new Map<string, Promise<void>>();

const enqueueFileWrite = async <T>(
  resolvedPath: string,
  write: (queueWaitMilliseconds: number, queuedBehindApplicationWrite: boolean) => Promise<T>,
): Promise<T> => {
  const previousWrite = pendingWritesByPath.get(resolvedPath);
  let releaseWrite: (() => void) | undefined;
  const currentWrite = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  pendingWritesByPath.set(resolvedPath, currentWrite);
  const queueStartedAt = Date.now();

  try {
    if (previousWrite) {
      await previousWrite;
    }
    return await write(Date.now() - queueStartedAt, previousWrite !== undefined);
  } finally {
    releaseWrite?.();
    if (pendingWritesByPath.get(resolvedPath) === currentWrite) {
      pendingWritesByPath.delete(resolvedPath);
    }
  }
};

const getErrorDetails = (error: unknown): Pick<FileWriteDiagnostics, 'code' | 'errno' | 'message' | 'stackSnippet' | 'syscall'> => {
  const nodeError = error as NodeJS.ErrnoException;
  return {
    code: nodeError.code,
    errno: nodeError.errno,
    message: error instanceof Error ? error.message : String(error),
    stackSnippet: error instanceof Error ? error.stack?.split('\n').slice(0, 6).join('\n') : undefined,
    syscall: nodeError.syscall,
  };
};

const createAttemptId = (): string => crypto.randomUUID();

export const writeApplicationFile = async (
  request: FileWriteRequest,
  runtime: FileWriteRuntime,
): Promise<FileWriteDiagnostics> => {
  const attemptId = createAttemptId();
  const startedAt = new Date().toISOString();
  const startedAtMilliseconds = Date.now();
  const resolvedPath = runtime.resolvePath(request.filename);
  const parentDirectoryPath = path.dirname(resolvedPath);
  const fileContents = request.dataType === 'base64' ? Buffer.from(request.contents, 'base64') : request.contents;
  const createDiagnostics = (
    details: Pick<FileWriteDiagnostics, 'code' | 'errno' | 'message' | 'stackSnippet' | 'syscall'>,
    queueWaitMilliseconds: number,
    queuedBehindApplicationWrite: boolean,
  ): FileWriteDiagnostics => ({
    attemptId,
    currentWorkingDirectory: process.cwd(),
    durationMilliseconds: Date.now() - startedAtMilliseconds,
    operation: request.options?.context,
    osUserName: userInfo().username,
    parentDirectoryPath,
    payloadByteLength: Buffer.byteLength(fileContents),
    payloadType: request.dataType,
    processId: process.pid,
    queuedBehindApplicationWrite,
    queueWaitMilliseconds,
    requestedPath: request.filename,
    resolvedPath,
    startedAt,
    userDataPath: runtime.getUserDataPath(),
    ...details,
  });

  return enqueueFileWrite(resolvedPath, async (queueWaitMilliseconds, queuedBehindApplicationWrite) => {
    try {
      await mkdir(parentDirectoryPath, { recursive: true });
      await access(parentDirectoryPath, constants.W_OK);
      await writeFile(resolvedPath, fileContents);
      const diagnostics = createDiagnostics({ message: 'File written successfully.' }, queueWaitMilliseconds, queuedBehindApplicationWrite);
      console.info('File write succeeded', diagnostics);
      return diagnostics;
    } catch (error: unknown) {
      const diagnostics = createDiagnostics(getErrorDetails(error), queueWaitMilliseconds, queuedBehindApplicationWrite);
      const failure: FileWriteFailurePayload = {
        diagnostics,
        guidance: getFileWriteGuidance(diagnostics.code),
      };
      console.error('File write failed', failure);
      throw failure;
    }
  });
};
