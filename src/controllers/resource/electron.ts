import { FileReadDataType } from "../../app/window.ts";
import { ResourceProvider } from "./provider.ts";

export class ElectronResourceProvider<ResourceType> implements ResourceProvider<ResourceType> {
  _path: string | undefined;
  constructor(defaultDir: string = '../../src/testdata') {
    if (!defaultDir) {
      throw new Error('Default directory must be specified for ElectronResourceProvider.');
    }
    this._path = defaultDir;
    if (!this._path.endsWith('/')) {
      this._path += '/';
    }
  }

  protected getElectronResource(name: string, dataType: FileReadDataType = 'utf8'): Promise<ResourceType> {
    const path = this._path + name;
    console.log(`Requesting resource from path: ${path}`);
    // const dataType = options.length > 0 && typeof options[0] === 'string' ? options[0] as FileReadDataType : 'utf8';
    return window.api.requestFileContent<ResourceType>(path, dataType);
  }

  public getResource(name: string, dataType: FileReadDataType = 'utf8'): Promise<ResourceType> {
    return this.getElectronResource(name, dataType);
  }
}
