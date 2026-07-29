import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { UploadedApplicationFile } from '../../model/serverApi.js';

const DEFAULT_MAXIMUM_UPLOAD_BYTES: number = 1024 * 1024 * 1024;

interface StoredUpload extends UploadedApplicationFile {
  filePath: string;
}

const sanitizeFileName = (fileName: string): string => {
  const normalizedName: string = path.basename(fileName.trim());
  if (!normalizedName || normalizedName === '.' || normalizedName === '..') {
    throw new Error('A valid upload file name is required.');
  }
  return normalizedName;
};

export class UploadStore {
  private readonly directoryPath: string;
  private readonly maximumUploadBytes: number;
  private readonly uploads = new Map<string, StoredUpload>();

  public constructor(
    directoryPath: string,
    maximumUploadBytes: number = DEFAULT_MAXIMUM_UPLOAD_BYTES,
  ) {
    this.directoryPath = directoryPath;
    this.maximumUploadBytes = maximumUploadBytes;
  }

  public accept = async (
    request: IncomingMessage,
    metadata: {
      mediaType: string;
      name: string;
      relativePath: string;
    },
  ): Promise<UploadedApplicationFile> => {
    const id: string = randomUUID();
    const name: string = sanitizeFileName(metadata.name);
    const filePath: string = path.join(this.directoryPath, `${id}-${name}`);
    await mkdir(this.directoryPath, { recursive: true });

    await new Promise<void>((resolve, reject): void => {
      let receivedBytes: number = 0;
      const output: ReturnType<typeof createWriteStream> = createWriteStream(filePath, {
        flags: 'wx',
      });
      const fail = (error: Error): void => {
        request.unpipe(output);
        output.destroy();
        reject(error);
      };
      request.on('data', (chunk: Buffer): void => {
        receivedBytes += chunk.byteLength;
        if (receivedBytes > this.maximumUploadBytes) {
          fail(new Error(`Upload exceeds the ${this.maximumUploadBytes} byte limit.`));
        }
      });
      request.once('error', fail);
      output.once('error', fail);
      output.once('finish', resolve);
      request.pipe(output);
    }).catch(async (error: unknown): Promise<never> => {
      await unlink(filePath).catch((): void => undefined);
      throw error;
    });

    const fileStats: Awaited<ReturnType<typeof stat>> = await stat(filePath);
    const upload: StoredUpload = {
      filePath,
      id,
      mediaType: metadata.mediaType || 'application/octet-stream',
      name,
      relativePath: metadata.relativePath || name,
      size: fileStats.size,
    };
    this.uploads.set(id, upload);
    return {
      id: upload.id,
      mediaType: upload.mediaType,
      name: upload.name,
      relativePath: upload.relativePath,
      size: upload.size,
    };
  };

  public consume = async <TResult>(
    id: string,
    consumer: (filePath: string, upload: UploadedApplicationFile) => Promise<TResult>,
  ): Promise<TResult> => {
    const upload: StoredUpload | undefined = this.uploads.get(id);
    if (!upload) {
      throw new Error(`Upload ${id} does not exist or has already been consumed.`);
    }
    this.uploads.delete(id);
    try {
      return await consumer(upload.filePath, upload);
    } finally {
      await unlink(upload.filePath).catch((): void => undefined);
    }
  };

  public download = (id: string, response: ServerResponse): boolean => {
    const upload: StoredUpload | undefined = this.uploads.get(id);
    if (!upload) {
      return false;
    }
    response.writeHead(200, {
      'content-disposition': `attachment; filename="${upload.name.replace(/"/g, '')}"`,
      'content-length': upload.size,
      'content-type': upload.mediaType,
    });
    createReadStream(upload.filePath).pipe(response);
    return true;
  };

  public close = async (): Promise<void> => {
    const uploads: StoredUpload[] = [...this.uploads.values()];
    this.uploads.clear();
    await Promise.all(
      uploads.map((upload: StoredUpload): Promise<void> =>
        unlink(upload.filePath).catch((): void => undefined),
      ),
    );
  };
}
