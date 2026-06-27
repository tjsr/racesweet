import React from 'react';
import { type RuntimeVersions } from '../../app/versionInfo.js';

interface RuntimeInformationPanelProps {
  runtimeVersions: RuntimeVersions;
}

export const RuntimeInformationPanel = (props: RuntimeInformationPanelProps): React.ReactElement => (
  <section className="events-panel">
    <h2>Runtime Information</h2>
    <ul>
      <li>Electron: {props.runtimeVersions.electron}</li>
      <li>Node.js: {props.runtimeVersions.node}</li>
      <li>Chromium: {props.runtimeVersions.chromium}</li>
    </ul>
  </section>
);
