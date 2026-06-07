import { DEFAULT_RACESWEET_SERVER_PORT, RACESWEET_SERVER_PORT_ENV, getRaceSweetServerPort } from './serverPort.ts';
import { waitForContentServer } from './startupContentServer.ts';

export const createElectronAssetUrl = (port: number = getRaceSweetServerPort()): string =>
  `http://localhost:${port}`;

export const waitForElectronAssets = async (): Promise<void> => {
  const assetUrl = createElectronAssetUrl();

  console.log(`Waiting for Electron Forge webpack assets at ${assetUrl}`);
  await waitForContentServer(assetUrl);
  console.log(`Electron Forge webpack assets are available at ${assetUrl}`);
};

if (process.env.NODE_ENV !== 'test') {
  waitForElectronAssets().catch((error: Error) => {
    const fallbackUrl = `http://localhost:${DEFAULT_RACESWEET_SERVER_PORT}`;
    console.error(
      `Timed out waiting for Electron Forge webpack assets. Set ${RACESWEET_SERVER_PORT_ENV} if the dev server is not at ${fallbackUrl}.`
    );
    console.error(error);
    process.exit(1);
  });
}
