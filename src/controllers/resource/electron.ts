import { ResourceProvider } from "./provider.ts";

export class ElectronResourceProvider<ResourceType> implements ResourceProvider<ResourceType> {
  _path: string | undefined;
  constructor(defaultDir: string = 'src/testdata') {
    if (!defaultDir) {
      this._path = 'H:/dev/racesweet/src/testdata/';
    }
    // Initialization code for Electron resource provider
  }

  protected getElectronResource(name: string): Promise<ResourceType> {
    const path = this._path + name;
    return window.api.requestFileContent<ResourceType>(path);
  }

  public getResource(name: string): Promise<ResourceType> {
    return this.getElectronResource(name);
  }
}
