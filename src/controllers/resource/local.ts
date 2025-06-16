import { access, readFile } from "node:fs/promises";

import { PathLike } from "node:fs";
import { ResourceProvider } from "./provider.ts";
import path from "node:path";

export class LocalFileResourceProvider<ResourceType> extends ResourceProvider<ResourceType> {
  private _basePath: PathLike | undefined;

  constructor(basePath?: string) {
    super();
    if (basePath) {
      this._basePath = basePath;
    } else if (process.env.DEVELOPMENT) {
      this._basePath = "src/testdata"; // Default base path, can be overridden
    }
  }

  public get basePath(): PathLike | undefined {
    return this._basePath; // Returns the base path for local file resources
  }

  protected getResourcePath(name: string): PathLike {
    if (!this._basePath) {
      throw new Error("Base path is not set.");
    }
    if (!name.endsWith('.json')) {
      name += '.json'; // Ensure the file has a .json extension
    }
    return path.join(this._basePath as string, name);
  }

  protected getResourceBuf(name: string): Promise<Buffer> {
    const filePath = this.getResourcePath(name);
    return readFile(filePath);
  }

  public async getFile(name: string): Promise<string> {
    const filePath = this.getResourcePath(name);

    try {
      await access(filePath);
      const data = await readFile(filePath, 'utf8');
      return data;
    } catch (err) {
      throw new Error(`File not found or permissions denied: ${filePath}`, { cause: err });
    }
  }

  public async getResource(name: string): Promise<ResourceType> {
    const contents = await this.getFile(name);
    if (!contents) {
      throw new Error(`Resource not found: ${name}`);
    }
    return JSON.parse(contents) as ResourceType;
  }
}

export default LocalFileResourceProvider;

