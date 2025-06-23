export interface ResourceProvider<ResourceType> {
  getResource(name: string, ...opts: unknown[]): Promise<ResourceType>;
}

export interface ResourceStreamProvider {
  getResourceBuf(name: string, ...opts: unknown[]): Promise<Buffer>;
}

