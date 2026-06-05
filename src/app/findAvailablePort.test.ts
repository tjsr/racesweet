import { Server, createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

import { findAvailablePort } from './findAvailablePort.ts';

const servers: Server[] = [];

const listen = async (port: number): Promise<Server> => {
  const server = createServer();
  servers.push(server);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.once('listening', resolve);
    server.listen(port);
  });

  return server;
};

const close = async (server: Server): Promise<void> => {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(undefined);
    });
  });
};

describe('findAvailablePort', () => {
  afterEach(async () => {
    await Promise.all(servers.splice(0).map(close));
  });

  it('returns an assigned TCP port when the OS chooses the port', async () => {
    const port = await findAvailablePort({ startPort: 0 });

    expect(port).toBeGreaterThan(0);
  });

  it('checks subsequent ports when the start port is already bound', async () => {
    const occupiedServer = await listen(0);
    const address = occupiedServer.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Expected server to listen on a TCP port');
    }

    const port = await findAvailablePort({
      maxAttempts: 2,
      startPort: address.port,
    });

    expect(port).toBe(address.port + 1);
  });

  it('throws after the maximum attempt count is exhausted', async () => {
    const occupiedServer = await listen(0);
    const address = occupiedServer.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Expected server to listen on a TCP port');
    }

    await expect(findAvailablePort({
      maxAttempts: 1,
      startPort: address.port,
    })).rejects.toThrow(`Could not find available port after trying ports ${address.port} to ${address.port}`);
  });
});
