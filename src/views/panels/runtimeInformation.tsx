import React from 'react';
import { type RuntimeVersions, formatBuildTimestamp } from '../../app/versionInfo.js';

interface RuntimeInformationPanelProps {
  buildTimestamp: string;
  runtimeVersions: RuntimeVersions;
}

export const RuntimeInformationPanel = (props: RuntimeInformationPanelProps): React.ReactElement => (
  <section className="events-panel">
    <h2>Runtime Information</h2>
    <ul>
      <li>Electron: {props.runtimeVersions.electron}</li>
      <li>Node.js: {props.runtimeVersions.node}</li>
      <li>Chromium: {props.runtimeVersions.chromium}</li>
      <li>Build date and time: {formatBuildTimestamp(props.buildTimestamp)}</li>
    </ul>
  </section>
);
