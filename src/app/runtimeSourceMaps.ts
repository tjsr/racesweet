import { install, type Environment } from 'source-map-support';

export type SourceMapEnabler = (enabled: boolean) => void;
export type SourceMapInstaller = typeof install;

type SourceMapProcess = NodeJS.Process & {
  setSourceMapsEnabled?: SourceMapEnabler;
  type?: string;
};

const getNativeSourceMapEnabler = (): SourceMapEnabler | undefined =>
  (process as SourceMapProcess).setSourceMapsEnabled;

const getSourceMapSupportEnvironment = (runtimeProcess: SourceMapProcess = process): Environment =>
  runtimeProcess.type === 'renderer' ? 'browser' : 'node';

export const enableRuntimeSourceMaps = (
  enableSourceMaps: SourceMapEnabler | undefined = getNativeSourceMapEnabler(),
  installSourceMapSupport: SourceMapInstaller = install,
  runtimeProcess: SourceMapProcess = process
): void => {
  enableSourceMaps?.(true);
  installSourceMapSupport({
    environment: getSourceMapSupportEnvironment(runtimeProcess),
    handleUncaughtExceptions: false,
  });
};

enableRuntimeSourceMaps();
