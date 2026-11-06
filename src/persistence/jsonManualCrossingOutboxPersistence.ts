import {
  type ManualCrossingOutboxPersistence,
  type ManualCrossingOutboxState,
  parseManualCrossingOutboxState,
} from "./manualCrossingOutboxPersistence.js";

export class JsonManualCrossingOutboxPersistence implements ManualCrossingOutboxPersistence {
  private readonly filePath: string;
  private readonly readFile: (path: string) => Promise<string>;
  private readonly writeAtomicFile: (
    path: string,
    contents: string,
  ) => Promise<void>;
  public constructor(
    filePath: string,
    readFile: (path: string) => Promise<string>,
    writeAtomicFile: (path: string, contents: string) => Promise<void>,
  ) {
    this.filePath = filePath;
    this.readFile = readFile;
    this.writeAtomicFile = writeAtomicFile;
  }

  public load = (): Promise<ManualCrossingOutboxState> =>
    this.readFile(this.filePath)
      .then((contents: string): ManualCrossingOutboxState => {
        try {
          return parseManualCrossingOutboxState(JSON.parse(contents));
        } catch {
          return { items: [], quarantined: [contents] };
        }
      })
      .catch((error: Error): ManualCrossingOutboxState => {
        if (/ENOENT|not found/iu.test(error.message))
          return { items: [], quarantined: [] };
        throw error;
      });

  public save = (state: ManualCrossingOutboxState): Promise<void> =>
    this.writeAtomicFile(this.filePath, JSON.stringify(state));
}
