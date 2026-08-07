import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createConnection, createServer, type AddressInfo, type Socket } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import type { DataSourceConfig } from '../systemConfig.js';
import { formatRfidDecoderBytesForDisplay, RfidDecoderListenerService } from './rfidDecoderListenerService.js';

const getAvailablePort = async (): Promise<number> => {
  const reservation = createServer();
  await new Promise<void>((resolve): void => {
    reservation.listen(0, '127.0.0.1', resolve);
  });
  const port: number = (reservation.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject): void => {
    reservation.close((error?: Error): void => error ? reject(error) : resolve());
  });
  return port;
};

const connectAndSend = (port: number, chunks: string[]): Promise<void> => new Promise<void>((resolve, reject): void => {
  const socket: Socket = createConnection({ host: '127.0.0.1', port }, (): void => {
    chunks.forEach((chunk: string): boolean => socket.write(chunk));
    socket.end();
  });
  socket.once('error', reject);
  socket.once('close', (): void => resolve());
});

const connectAndAbort = (port: number): Promise<void> => new Promise<void>((resolve): void => {
  const socket: Socket = createConnection({ host: '127.0.0.1', port }, (): void => {
    socket.destroy();
  });
  socket.once('error', (): void => resolve());
  socket.once('close', (): void => resolve());
});

describe('RfidDecoderListenerService', () => {
  it('formats carriage returns and line feeds as readable escapes', () => {
    expect(formatRfidDecoderBytesForDisplay(Buffer.from([
      0x31,
      0x2c,
      0x0d,
      0x0a,
      0x80,
      0xff,
      0x20,
    ]))).toBe('1,\\r\\n\\80\\FF ');
  });

  it('accepts fragmented newline-delimited decoder data on the configured port', async () => {
    const received: Array<{ lines: string[]; sourceId: string }> = [];
    const rawData: string[] = [];
    const port: number = await getAvailablePort();
    const directory: string = await mkdtemp(path.join(os.tmpdir(), 'racesweet-rfid-capture-'));
    const captureFilePath: string = path.join(directory, 'decoder.raw');
    const source: DataSourceConfig = {
      enabled: true,
      id: 'rfid-decoder',
      name: 'Pit lane RFID',
      rfidDecoderConfig: { captureFilePath, isListening: true, listenPort: port },
      type: 'timing-rfid-decoder',
    };
    const service = new RfidDecoderListenerService({
      onData: async (_source: DataSourceConfig, data: Buffer): Promise<void> => {
        rawData.push(data.toString('utf8'));
      },
      onLines: async (receivedSource: DataSourceConfig, lines: string[]): Promise<void> => {
        received.push({ lines, sourceId: receivedSource.id });
      },
    });

    try {
      await service.reload([source]);
      await connectAndSend(port, ['1,123,7B,"2026-08-06 09:00:', '01.250"\r\n2,456,1C8,"2026-08-06 09:00:02.500"\n']);
      await vi.waitFor((): void => {
        expect(received).toEqual([{
          lines: [
            '1,123,7B,"2026-08-06 09:00:01.250"',
            '2,456,1C8,"2026-08-06 09:00:02.500"',
          ],
          sourceId: source.id,
        }]);
      });
      expect(service.activeListeners).toEqual([{ port, sourceId: source.id }]);
      expect(rawData.join('')).toBe(
        '1,123,7B,"2026-08-06 09:00:01.250"\r\n2,456,1C8,"2026-08-06 09:00:02.500"\n',
      );
      await service.close();
      expect(await readFile(captureFilePath, 'utf8')).toBe('1,123,7B,"2026-08-06 09:00:01.250"\r\n2,456,1C8,"2026-08-06 09:00:02.500"\n');
    } finally {
      await service.close();
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('continues accepting decoder data after an abrupt client disconnect', async () => {
    const received: string[][] = [];
    const port: number = await getAvailablePort();
    const source: DataSourceConfig = {
      enabled: true,
      id: 'rfid-decoder',
      name: 'Pit lane RFID',
      rfidDecoderConfig: { isListening: true, listenPort: port },
      type: 'timing-rfid-decoder',
    };
    const service = new RfidDecoderListenerService({
      onLines: async (_source: DataSourceConfig, lines: string[]): Promise<void> => {
        received.push(lines);
      },
    });

    try {
      await service.reload([source]);
      await connectAndAbort(port);
      await connectAndSend(port, ['1,123,7B,"2026-08-06 09:00:01.250"\n']);
      await vi.waitFor((): void => {
        expect(received).toEqual([['1,123,7B,"2026-08-06 09:00:01.250"']]);
      });
      expect(service.activeListeners).toEqual([{ port, sourceId: source.id }]);
    } finally {
      await service.close();
    }
  });
});
