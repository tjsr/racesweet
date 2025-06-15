export abstract class ResourceProvider<ResourceType> {
  constructor() {

  }

  public abstract getResource(name: string): Promise<ResourceType>;
}

