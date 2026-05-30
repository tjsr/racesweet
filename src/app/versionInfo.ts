export interface RuntimeVersions {
  chromium: string;
  electron: string;
  node: string;
}

const UNKNOWN_VERSION = 'unknown';

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
