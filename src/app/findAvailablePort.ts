import { createServer, Server } from 'http';

// Find an available port - simple and safe approach

const tryPort = async (server: Server, port: number): Promise<number> => {
  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      console.log(`Port ${port} is available`);
      resolve(port);
    });
  });
};

export const findAvailablePort = (): number => {
  const defaultPort = parseInt(process.env.DEBUG_SERVER_PORT || '3000', 10);

  // Try the default port first
  let port = defaultPort;
  // If default port is in use, try incrementing ports
  let attempt = 0;
  const maxAttempts = 10;

  // Check if port is available by trying to bind
  const server = createServer((req: any, res: any) => {
    res.writeHead(200);
    res.end('OK');
  });

  let port = tryPort(server, port);

  // server.listen(port, () => {
  //   // server.close(() => {
  //     console.log(`Port ${port} is available`);
  //     return port;
  //   // });
  // });

  server.on('error', (err: Error & { code?: string }) => {
    if (err.code === 'EADDRINUSE') {
      // Port is in use, close and destroy the server before trying next
      server.close();
      port++;
      attempt++;

      if (attempt >= maxAttempts) {
        console.error(`Could not find available port after ${maxAttempts} attempts`);
        return;
      }
      setTimeout(() => tryPort(server, port), 100);
    }
  });

  return port;
};
