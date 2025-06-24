import { FileReadDataType } from "../../app/window.ts";
import { ResourceProvider } from "./provider.ts";

export class ElectronResourceProvider<ResourceType> implements ResourceProvider<ResourceType> {
  _path: string | undefined;
  constructor(defaultDir: string = '../../src/testdata') {
    if (!defaultDir) {
      throw new Error('Default directory must be specified for ElectronResourceProvider.');
    }
    this._path = defaultDir;
    if (!this._path?.endsWith('/')) {
      this._path += '/';
      console.warn(`Default path was specified incorrectly, appending '/' to the end: ${this._path}`);
    }
    // if (process?.env?.os === 'win32') {
    //   if (this._path.includes('/')) {
    //     console.warn(`Default path contains forward slashes, converting to backslashes for Windows compatibility: ${this._path}`);
    //   }
    //   // Ensure the path is in a format suitable for Windows
    //   this._path = defaultDir.replace(/\\/g, '/');
    // } else if (!process?.env) {
    //   console.warn(`Process environment is not defined.`);
    // }
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
