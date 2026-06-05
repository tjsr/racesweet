import { createServer } from 'node:http';

export interface FindAvailablePortOptions {
  maxAttempts?: number;
  startPort?: number;
}

const parseStartPort = (startPort?: number): number => {
  return startPort ?? parseInt(process.env.DEBUG_SERVER_PORT || '3000', 10);
};

interface PortCheckResult {
  available: boolean;
  port: number;
}

const canListenOnPort = async (port: number): Promise<PortCheckResult> => {
  const server = createServer();

  return await new Promise((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        resolve({ available: false, port });
        return;
      }
      reject(error);
    });

    server.once('listening', () => {
      const address = server.address();
      const resolvedPort = address !== null && typeof address !== 'string' ? address.port : port;
      server.close(() => resolve({ available: true, port: resolvedPort }));
    });

    server.listen(port);
  });
};

export const findAvailablePort = async (options: FindAvailablePortOptions = {}): Promise<number> => {
  const maxAttempts = options.maxAttempts ?? 10;
  const startPort = parseStartPort(options.startPort);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = startPort + attempt;
    const result = await canListenOnPort(port);
    if (result.available) {
      return result.port;
    }
  }

  throw new Error(`Could not find available port after trying ports ${startPort} to ${startPort + maxAttempts - 1}`);
};
