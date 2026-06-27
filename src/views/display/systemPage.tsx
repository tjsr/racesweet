import React from 'react';
import { type DataSourceConfig, type DataSourceType, type SystemConfiguration } from '../../app/systemConfig.js';
import { getRuntimeVersions } from '../../app/versionInfo.js';
import { TimeRecordSourceId } from '../../model/types.js';
import { DataSourcesPanel } from '../panels/dataSources.js';
import { LocalStorageLocationPanel } from '../panels/localStorageLocation.js';
import { RuntimeInformationPanel } from '../panels/runtimeInformation.js';

interface SystemPageProps {
  config: SystemConfiguration;
  displayedErrorLog?: string;
  onCreateSource: (type: DataSourceType) => void | Promise<void>;
  onDeleteSource: (sourceId: TimeRecordSourceId) => void | Promise<void>;
  onDisplayError?: (source: string, error: unknown) => void;
  onFetchApicalDataNow: (sourceId: TimeRecordSourceId) => void | Promise<void>;
  onOpenLocalFile?: (filePath: string) => void | Promise<void>;
  onLoadApicalEvents: (sourceId: TimeRecordSourceId) => void | Promise<void>;
  onReprocessApicalData: (sourceId: TimeRecordSourceId) => void | Promise<void>;
  onSaveLocalStorageDirectoryPath: (directoryPath: string) => void | Promise<void>;
  onSaveSource: (sourceId: TimeRecordSourceId, changes: Partial<DataSourceConfig>) => void | Promise<void>;
  onSelectLocalFile?: () => Promise<string | undefined>;
}

export const SystemPage = (props: SystemPageProps): React.ReactElement => {
  const runtimeVersions = getRuntimeVersions();

  return (
    <section className="events-screen">
      <h1>System</h1>
      <p>Configure global data-source definitions and source connection settings.</p>

      <RuntimeInformationPanel runtimeVersions={runtimeVersions} />

      <LocalStorageLocationPanel
        localStorageDirectoryPath={props.config.localStorageDirectoryPath}
        onSaveLocalStorageDirectoryPath={props.onSaveLocalStorageDirectoryPath}
      />

      <DataSourcesPanel
        dataSources={props.config.dataSources}
        onCreateSource={props.onCreateSource}
        onDeleteSource={props.onDeleteSource}
        onDisplayError={props.onDisplayError}
        onFetchApicalDataNow={props.onFetchApicalDataNow}
        onLoadApicalEvents={props.onLoadApicalEvents}
        onOpenLocalFile={props.onOpenLocalFile}
        onReprocessApicalData={props.onReprocessApicalData}
        onSaveSource={props.onSaveSource}
        onSelectLocalFile={props.onSelectLocalFile}
      />

      <section className="events-panel">
        <h2>Log</h2>
        <label>
          Error Log
          <textarea
            aria-label="Application Error Log"
            readOnly
            value={props.displayedErrorLog || ''}
          />
        </label>
      </section>
    </section>
  );
};
