declare const RACESWEET_BUILD_TIMESTAMP: string;

export interface RuntimeVersions {
  chromium: string;
  electron: string;
  node: string;
}

const UNKNOWN_VERSION = 'unknown';
const UNKNOWN_BUILD_TIMESTAMP = 'unknown';

export const getBuildTimestamp = (): string =>
  typeof RACESWEET_BUILD_TIMESTAMP === 'string' ? RACESWEET_BUILD_TIMESTAMP : UNKNOWN_BUILD_TIMESTAMP;

export const formatBuildTimestamp = (buildTimestamp: string): string => {
  const buildDate: Date = new Date(buildTimestamp);

  if (Number.isNaN(buildDate.getTime())) {
    return UNKNOWN_BUILD_TIMESTAMP;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    second: '2-digit',
    timeZoneName: 'long',
    year: 'numeric',
  }).format(buildDate);
};

export const getRuntimeVersions = (): RuntimeVersions => {
  const chromium = window.versions?.chrome?.() || UNKNOWN_VERSION;
  const node = window.versions?.node?.() || UNKNOWN_VERSION;
  const electron = window.versions?.electron?.() || UNKNOWN_VERSION;

  return {
    chromium,
    electron,
    node,
  };
};
