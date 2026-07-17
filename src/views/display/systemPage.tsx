import React from 'react';
import { type DataSourceConfig, type DataSourceType, type SystemConfiguration } from '../../app/systemConfig.js';
import { getRuntimeVersions } from '../../app/versionInfo.js';
import { TimeRecordSourceId } from '../../model/types.js';
import type { MrScatsDataFileInventory, MrScatsDataFileSummary } from '../../parsers/mrScats/fileInventory.js';
import type { MrScatsDataFilePreview } from '../../parsers/mrScats/filePreview.js';
import { DataSourcesPanel } from '../panels/dataSources.js';
import { FastestTimeIndicatorsPanel } from '../panels/fastestTimeIndicators.js';
import type { InlineLoadingProgress } from '../panels/InlineLoadingIndicator.js';
import { LocalStorageLocationPanel } from '../panels/localStorageLocation.js';
import { LogPanel } from '../panels/log.js';
import { RaceSweetLogo } from '../panels/RaceSweetLogo.js';
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
  onLoadMrScatsEvent?: (sourceId: TimeRecordSourceId, onProgress?: (progress: InlineLoadingProgress) => void | Promise<void>) => void | Promise<void>;
  onLoadDorianCtcSrtFile?: (sourceId: TimeRecordSourceId, onProgress?: (progress: InlineLoadingProgress) => void | Promise<void>) => void | Promise<void>;
  onReprocessApicalData: (sourceId: TimeRecordSourceId) => void | Promise<void>;
  onPreviewMrScatsDataFile?: (sourceId: TimeRecordSourceId, file: MrScatsDataFileSummary) => Promise<MrScatsDataFilePreview>;
  onPreviewDorianCtcSrtFile?: (sourceId: TimeRecordSourceId) => Promise<MrScatsDataFilePreview>;
  onSaveFastestTimeIndicatorColors?: (changes: Partial<SystemConfiguration['fastestTimeIndicatorColors']>) => void | Promise<void>;
  onSaveLocalStorageDirectoryPath: (directoryPath: string) => void | Promise<void>;
  onSaveSource: (sourceId: TimeRecordSourceId, changes: Partial<DataSourceConfig>) => void | Promise<void>;
  onSelectMrScatsDataArchive?: () => Promise<MrScatsDataFileInventory | undefined>;
  onSelectMrScatsDataDirectory?: () => Promise<MrScatsDataFileInventory | undefined>;
  onSelectLocalFile?: () => Promise<string | undefined>;
  onSelectDorianCtcSrtFile?: () => Promise<string | undefined>;
  onSelectDorianCtcTrackConfigFile?: () => Promise<string | undefined>;
}

export const SystemPage = (props: SystemPageProps): React.ReactElement => {
  const runtimeVersions = getRuntimeVersions();

  return (
    <section className="events-screen">
      <h1>System</h1>
      <p>Configure global data-source definitions and source connection settings.</p>

      <div className="system-runtime-summary">
        <RuntimeInformationPanel runtimeVersions={runtimeVersions} />
        <RaceSweetLogo className="system-runtime-summary__logo" />
      </div>

      <LocalStorageLocationPanel
        localStorageDirectoryPath={props.config.localStorageDirectoryPath}
        onSaveLocalStorageDirectoryPath={props.onSaveLocalStorageDirectoryPath}
      />
      <FastestTimeIndicatorsPanel
        colors={props.config.fastestTimeIndicatorColors}
        onSaveFastestTimeIndicatorColors={props.onSaveFastestTimeIndicatorColors || (() => undefined)}
      />

      <DataSourcesPanel
        dataSources={props.config.dataSources}
        onCreateSource={props.onCreateSource}
        onDeleteSource={props.onDeleteSource}
        onDisplayError={props.onDisplayError}
        onFetchApicalDataNow={props.onFetchApicalDataNow}
        onLoadApicalEvents={props.onLoadApicalEvents}
        onLoadMrScatsEvent={props.onLoadMrScatsEvent}
        onLoadDorianCtcSrtFile={props.onLoadDorianCtcSrtFile}
        onOpenLocalFile={props.onOpenLocalFile}
        onPreviewMrScatsDataFile={props.onPreviewMrScatsDataFile}
        onPreviewDorianCtcSrtFile={props.onPreviewDorianCtcSrtFile}
        onReprocessApicalData={props.onReprocessApicalData}
        onSaveSource={props.onSaveSource}
        onSelectMrScatsDataArchive={props.onSelectMrScatsDataArchive}
        onSelectMrScatsDataDirectory={props.onSelectMrScatsDataDirectory}
        onSelectLocalFile={props.onSelectLocalFile}
        onSelectDorianCtcSrtFile={props.onSelectDorianCtcSrtFile}
        onSelectDorianCtcTrackConfigFile={props.onSelectDorianCtcTrackConfigFile}
      />

      <LogPanel displayedErrorLog={props.displayedErrorLog} />
    </section>
  );
};
