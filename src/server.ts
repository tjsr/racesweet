import { existsSync } from 'node:fs';
import path from 'node:path';
import { RaceSweetApplicationServer } from './app/server/raceSweetApplicationServer.js';

const dataDirectory: string = process.env.RACESWEET_DATA_DIRECTORY ||
  path.resolve('src', 'generated');
const configuredAssetSource: string | undefined = process.env.RACESWEET_WEB_ASSETS;
const defaultAssetSource: string = path.resolve('dist', 'web');
const assetSource: string | undefined = configuredAssetSource ||
  (existsSync(defaultAssetSource) ? defaultAssetSource : undefined);

const server: RaceSweetApplicationServer = new RaceSweetApplicationServer({
  assetSource,
  dataDirectory,
});

const stop = async (): Promise<void> => {
  await server.close();
  process.exitCode = 0;
};

process.once('SIGINT', (): void => {
  void stop();
});
process.once('SIGTERM', (): void => {
  void stop();
});

server.initialize()
  .then(() => Promise.all([
    server.startInternal(),
    server.reloadExternal(server.listenerConfig),
  ]))
  .then(([internal]): void => {
    console.log(`RaceSweet is available locally at ${internal.origin}`);
    if (!server.listenerConfig.enabled) {
      console.log('External web access is disabled. Enable the listener in RaceSweet server settings.');
    }
  })
  .catch((error: unknown): void => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
