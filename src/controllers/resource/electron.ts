import { ResourceProvider } from "./provider.ts";

export abstract class ElectronResourceProvider<ResourceType> extends ResourceProvider<ResourceType> {
  constructor() {
    super();
    // Initialization code for Electron resource provider
  }

  protected getElectronResource(name: string): Promise<string> {
    const path = 'H:/dev/racesweet/src/testdata/' + name;
    return window.api.requestFileContent<string>(path);
  }

  public abstract getResource(name: string): Promise<ResourceType>;
}
