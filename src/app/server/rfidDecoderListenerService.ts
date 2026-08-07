import { appendFile, mkdir } from 'node:fs/promises';
import { createServer, type Server, type Socket } from 'node:net';
import path from 'node:path';

import type { DataSourceConfig } from '../systemConfig.js';

export interface ActiveRfidDecoderListener {
  port: number;
  sourceId: string;
}

export interface RfidDecoderListenerServiceOptions {
  onData?: (source: DataSourceConfig, data: Buffer) => Promise<void>;
  onLines: (source: DataSourceConfig, lines: string[]) => Promise<void>;
}

interface ManagedListener {
  port: number;
  server: Server;
  source: DataSourceConfig;
}

const closeServer = (server: Server): Promise<void> => new Promise<void>((resolve, reject): void => {
  if (!server.listening) {
    resolve();
    return;
  }
  server.close((error?: Error): void => error ? reject(error) : resolve());
});

const listen = (server: Server, port: number): Promise<void> => new Promise<void>((resolve, reject): void => {
  server.once('error', reject);
  server.listen(port, (): void => {
    server.off('error', reject);
    resolve();
  });
});

const configuredPort = (source: DataSourceConfig): number | undefined => {
  const port: number | undefined = source.rfidDecoderConfig?.listenPort;
  return Number.isInteger(port) && port! > 0 && port! <= 65535 ? port : undefined;
};

export const formatRfidDecoderBytesForDisplay = (data: Buffer): string =>
  Array.from(data, (byte: number): string => (
    byte === 0x0d
      ? '\\r'
      : byte === 0x0a
        ? '\\n'
        : byte >= 0x20 && byte <= 0x7e
          ? String.fromCharCode(byte)
          : `\\${byte.toString(16).padStart(2, '0').toUpperCase()}`
  )).join('');

export class RfidDecoderListenerService {
  private readonly listeners = new Map<string, ManagedListener>();
  private readonly options: RfidDecoderListenerServiceOptions;
  private readonly captureWrites = new Map<string, Promise<void>>();
  private readonly sockets = new Set<Socket>();

  public constructor(options: RfidDecoderListenerServiceOptions) {
    this.options = options;
  }

  public get activeListeners(): ActiveRfidDecoderListener[] {
    return [...this.listeners.values()]
      .map((listener: ManagedListener): ActiveRfidDecoderListener => ({
        port: listener.port,
        sourceId: listener.source.id,
      }))
      .sort((left: ActiveRfidDecoderListener, right: ActiveRfidDecoderListener): number =>
        left.sourceId.localeCompare(right.sourceId));
  }

  public isListening = (sourceId: string): boolean => this.listeners.has(sourceId);

  public reload = async (sources: DataSourceConfig[]): Promise<void> => {
    const desiredSources: DataSourceConfig[] = sources.filter((source: DataSourceConfig): boolean =>
      source.enabled && source.type === 'timing-rfid-decoder' &&
        source.rfidDecoderConfig?.isListening === true && configuredPort(source) !== undefined,
    );
    const desiredById = new Map<string, DataSourceConfig>(desiredSources.map(
      (source: DataSourceConfig): [string, DataSourceConfig] => [source.id, source],
    ));

    const retainedSourceIds = new Set<string>();
    for (const [sourceId, listener] of this.listeners) {
      const nextSource: DataSourceConfig | undefined = desiredById.get(sourceId);
      if (nextSource && configuredPort(nextSource) === listener.port) {
        listener.source = nextSource;
        retainedSourceIds.add(sourceId);
      }
    }

    const obsoleteListeners: ManagedListener[] = [...this.listeners.entries()]
      .filter(([sourceId]: [string, ManagedListener]): boolean => !retainedSourceIds.has(sourceId))
      .map(([, listener]: [string, ManagedListener]): ManagedListener => listener);
    obsoleteListeners.forEach((listener: ManagedListener): void => {
      this.listeners.delete(listener.source.id);
    });
    await Promise.all(obsoleteListeners.map((listener: ManagedListener): Promise<void> => closeServer(listener.server)));

    for (const source of desiredSources) {
      if (retainedSourceIds.has(source.id)) {
        continue;
      }
      const port: number = configuredPort(source)!;
      const server: Server = createServer((socket: Socket): void => {
        this.handleSocket(source.id, socket);
      });
      server.on('error', (): void => undefined);
      try {
        await listen(server, port);
        this.listeners.set(source.id, { port, server, source });
      } catch (error: unknown) {
        await closeServer(server).catch((): void => undefined);
        throw new Error(`Unable to listen for RFID decoder source "${source.name}" on port ${port}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };

  public close = async (): Promise<void> => {
    this.sockets.forEach((socket: Socket): void => {
      socket.destroy();
    });
    this.sockets.clear();
    const servers: Server[] = [...this.listeners.values()].map(
      (listener: ManagedListener): Server => listener.server,
    );
    this.listeners.clear();
    await Promise.all([
      ...servers.map((server: Server): Promise<void> => closeServer(server)),
      ...this.captureWrites.values(),
    ]);
    this.captureWrites.clear();
  };

  private handleSocket = (sourceId: string, socket: Socket): void => {
    this.sockets.add(socket);
    socket.setKeepAlive(true);
    let pending: string = '';
    const submit = (text: string): void => {
      const source: DataSourceConfig | undefined = this.listeners.get(sourceId)?.source;
      const lines: string[] = text.split(/\r?\n/u).map((line: string): string => line.trim()).filter(Boolean);
      if (source && lines.length > 0) {
        void this.options.onLines(source, lines).catch((): void => undefined);
      }
    };
    socket.on('data', (chunk: Buffer): void => {
      this.captureRawData(sourceId, chunk);
      const source: DataSourceConfig | undefined = this.listeners.get(sourceId)?.source;
      if (source && this.options.onData) {
        void this.options.onData(source, chunk).catch((error: unknown): void => {
          console.error(`Unable to publish raw TCP data for RFID decoder source "${sourceId}": ${error instanceof Error ? error.message : String(error)}`);
        });
      }
      const data: string = pending + chunk.toString('utf8');
      const lastLineBreak: number = Math.max(data.lastIndexOf('\n'), data.lastIndexOf('\r'));
      if (lastLineBreak < 0) {
        pending = data;
        return;
      }
      submit(data.slice(0, lastLineBreak + 1));
      pending = data.slice(lastLineBreak + 1);
    });
    socket.once('end', (): void => submit(pending));
    socket.once('error', (): void => {
      this.sockets.delete(socket);
      socket.destroy();
    });
    socket.once('close', (): void => {
      this.sockets.delete(socket);
    });
  };

  private captureRawData = (sourceId: string, data: Buffer): void => {
    const captureFilePath: string | undefined = this.listeners.get(sourceId)?.source.rfidDecoderConfig?.captureFilePath;
    if (!captureFilePath) {
      return;
    }
    const previousWrite: Promise<void> = this.captureWrites.get(sourceId) || Promise.resolve();
    const nextWrite: Promise<void> = previousWrite.then(async (): Promise<void> => {
      await mkdir(path.dirname(captureFilePath), { recursive: true });
      await appendFile(captureFilePath, data);
    });
    this.captureWrites.set(sourceId, nextWrite.catch((error: unknown): void => {
      console.error(`Unable to capture raw TCP data for RFID decoder source "${sourceId}": ${error instanceof Error ? error.message : String(error)}`);
    }));
  };
}
