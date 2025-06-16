export abstract class ResourceProvider<ResourceType> {
  constructor() {

  }

  public abstract getResource(name: string): Promise<ResourceType>;
  public abstract getResourceBuf(name: string): Promise<Buffer>;
  
}

