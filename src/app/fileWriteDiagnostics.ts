export interface FileWriteOperationContext {
  eventId?: string;
  operation?: string;
  sessionId?: string;
  trackMapId?: string;
}

export interface FileWriteOptions {
  context?: FileWriteOperationContext;
}

export interface FileWriteDiagnostics {
  attemptId: string;
  code?: string;
  currentWorkingDirectory: string;
  durationMilliseconds: number;
  errno?: number | string;
  message: string;
  operation?: FileWriteOperationContext;
  osUserName: string;
  parentDirectoryPath: string;
  payloadByteLength: number;
  payloadType: 'base64' | 'utf8';
  processId: number;
  queuedBehindApplicationWrite: boolean;
  queueWaitMilliseconds: number;
  requestedPath: string;
  resolvedPath: string;
  stackSnippet?: string;
  startedAt: string;
  syscall?: string;
  userDataPath: string;
}

export interface FileWriteFailurePayload {
  diagnostics: FileWriteDiagnostics;
  guidance: string;
}

export const getFileWriteGuidance = (code: string | undefined): string => {
  switch (code) {
  case 'EACCES':
  case 'EPERM':
    return 'RaceSweet does not have permission to write this file or folder. Check its permissions and close any app that may be protecting it.';
  case 'ENOENT':
    return 'The save location could not be found. Check the configured storage path and application root.';
  case 'EBUSY':
    return 'The file is in use by another process. Close the program using it and try saving again.';
  case 'EISDIR':
    return 'The save path points to a folder rather than a file. Check the configured storage path.';
  case 'UNKNOWN':
    return 'Windows could not open the save file. Close programs that may be using it, check antivirus protection, and try again.';
  default:
    return 'RaceSweet could not write the file. Copy the save diagnostics and check the application logs for the exact failure.';
  }
};

export const isFileWriteFailurePayload = (value: unknown): value is FileWriteFailurePayload => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<FileWriteFailurePayload>;
  return typeof candidate.guidance === 'string' &&
    typeof candidate.diagnostics?.attemptId === 'string' &&
    typeof candidate.diagnostics.message === 'string' &&
    typeof candidate.diagnostics.resolvedPath === 'string';
};

export class FileWriteFailureError extends Error {
  public readonly diagnostics: FileWriteDiagnostics;
  public readonly guidance: string;

  public constructor(payload: FileWriteFailurePayload, message?: string) {
    super(message || `${payload.diagnostics.message} ${payload.guidance}`);
    this.name = 'FileWriteFailureError';
    this.diagnostics = payload.diagnostics;
    this.guidance = payload.guidance;
  }
}

export const getFileWriteFailure = (error: unknown): FileWriteFailureError | undefined => {
  if (error instanceof FileWriteFailureError) {
    return error;
  }

  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const candidate = error as Partial<Error> & Partial<FileWriteFailurePayload>;
  const message = candidate.message;
  if (!isFileWriteFailurePayload(candidate)) {
    return undefined;
  }

  // Preload and renderer run in separately bundled JavaScript realms, so an
  // Error constructed by preload cannot reliably pass an instanceof check here.
  return new FileWriteFailureError(candidate, message);
};
