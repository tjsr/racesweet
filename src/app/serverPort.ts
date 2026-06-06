export const DEFAULT_RACESWEET_SERVER_PORT = 3488;
export const RACESWEET_SERVER_PORT_ENV = 'RACESWEET_SERVER_PORT';

export const getRaceSweetServerPort = (env: NodeJS.ProcessEnv = process.env): number => {
  const rawPort = env[RACESWEET_SERVER_PORT_ENV];
  if (!rawPort) {
    return DEFAULT_RACESWEET_SERVER_PORT;
  }

  const port = Number(rawPort);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`${RACESWEET_SERVER_PORT_ENV} must be a TCP port number between 1 and 65535.`);
  }

  return port;
};
