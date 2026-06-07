export type SourceMapEnabler = (enabled: boolean) => void;

type SourceMapProcess = NodeJS.Process & {
  setSourceMapsEnabled?: SourceMapEnabler;
};

const getNativeSourceMapEnabler = (): SourceMapEnabler | undefined =>
  (process as SourceMapProcess).setSourceMapsEnabled;

export const enableRuntimeSourceMaps = (enableSourceMaps: SourceMapEnabler | undefined = getNativeSourceMapEnabler()): void => {
  enableSourceMaps?.(true);
};

enableRuntimeSourceMaps();
