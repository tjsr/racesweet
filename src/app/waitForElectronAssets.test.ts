import { createElectronAssetUrl } from './waitForElectronAssets.ts';

describe('createElectronAssetUrl', () => {
  it('uses the default Electron Forge server port', () => {
    expect(createElectronAssetUrl(3488)).toBe('http://localhost:3488');
  });
});
