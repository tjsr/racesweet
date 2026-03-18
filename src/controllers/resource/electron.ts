import { FileReadDataType } from "../../app/window.js";
import { ResourceProvider } from "./provider.js";

export abstract class  ElectronResourceProvider<ResourceType> implements ResourceProvider<ResourceType> {
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

  protected getResourcePath(name: string): string {
    const path = this._path + name;
    return path;
  }

  public abstract getResource(name: string, dataType: FileReadDataType): Promise<ResourceType>;
}

export class ElectronBufferResourceProvider extends ElectronResourceProvider<Buffer> implements ResourceProvider<Buffer> {
  public getResource(name: string): Promise<Buffer> {
    const path = this.getResourcePath(name);
    return window.api.requestBuffer(path);
  }
}

export class ElectronStringResourceProvider extends ElectronResourceProvider<string> implements ResourceProvider<string> {
  public getResource(name: string): Promise<string> {
    return this.getElectronResource(name, 'utf8');
  }

  protected getElectronResource(name: string, dataType: FileReadDataType = 'utf8'): Promise<string> {
    const path = this.getResourcePath(name);
    console.log(`Requesting resource from path: ${path}`);
    // const dataType = options.length > 0 && typeof options[0] === 'string' ? options[0] as FileReadDataType : 'utf8';
    return window.api.requestFileContent<string>(path, dataType);
  }
}
