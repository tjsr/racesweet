import React from 'react';
import { formatErrorForDisplay } from '../../app/stackTrace.js';
import { type DataImportMode, type DataSourceConfig, type DataSourceType, getDataSourceTypeLabel } from '../../app/systemConfig.js';
import type { CtcTrackConfig } from '../../model/ctcTrackConfig.js';
import { TimeRecordSourceId } from '../../model/types.js';
import type { MrScatsDataFileInventory, MrScatsDataFileSummary } from '../../parsers/mrScats/fileInventory.js';
import type { MrScatsDataFilePreview } from '../../parsers/mrScats/filePreview.js';
import { DataSourceTypesPanel } from './dataSourceTypes.js';
import { InlineLoadingIndicator, type InlineLoadingProgress } from './InlineLoadingIndicator.js';
import { MrScatsDataSourcePanel } from './mrScatsDataSourcePanel.js';

interface DataSourcesPanelProps {
  dataSources: DataSourceConfig[];
  onCreateSource: (type: DataSourceType) => void | Promise<void>;
  onDeleteSource: (sourceId: TimeRecordSourceId) => void | Promise<void>;
  onDisplayError?: (source: string, error: unknown) => void;
  onFetchApicalDataNow: (sourceId: TimeRecordSourceId) => void | Promise<void>;
  onLoadApicalEvents: (sourceId: TimeRecordSourceId) => void | Promise<void>;
  onLoadMrScatsEvent?: (sourceId: TimeRecordSourceId, onProgress?: (progress: InlineLoadingProgress) => void | Promise<void>) => void | Promise<void>;
  onLoadDorianCtcSrtFile?: (sourceId: TimeRecordSourceId, onProgress?: (progress: InlineLoadingProgress) => void | Promise<void>) => void | Promise<void>;
  onLoadDurtFileMakerDatabase?: (sourceId: TimeRecordSourceId, onProgress?: (progress: InlineLoadingProgress) => void | Promise<void>) => void | Promise<void>;
  onOpenLocalFile?: (filePath: string) => void | Promise<void>;
  onOpenExternalUrl?: (url: string) => void | Promise<void>;
  onPreviewMrScatsDataFile?: (sourceId: TimeRecordSourceId, file: MrScatsDataFileSummary) => Promise<MrScatsDataFilePreview>;
  onPreviewDorianCtcSrtFile?: (sourceId: TimeRecordSourceId) => Promise<MrScatsDataFilePreview>;
  onReprocessApicalData: (sourceId: TimeRecordSourceId) => void | Promise<void>;
  onSaveSource: (sourceId: TimeRecordSourceId, changes: Partial<DataSourceConfig>) => void | Promise<void>;
  onSelectMrScatsDataArchive?: () => Promise<MrScatsDataFileInventory | undefined>;
  onSelectMrScatsDataDirectory?: () => Promise<MrScatsDataFileInventory | undefined>;
  onSelectLocalFile?: () => Promise<string | undefined>;
  onSelectDorianCtcSrtFile?: () => Promise<string | undefined>;
  onSelectDorianCtcTrackConfigFile?: () => Promise<string | undefined>;
  onSelectDurtFileMakerDatabase?: () => Promise<string | undefined>;
  onSelectDurtFileMakerExtractor?: () => Promise<string | undefined>;
}

interface SourceFetchError {
  details: string;
  title: string;
}

interface DraftInputProps {
  ariaLabel: string;
  onCommit: (value: string) => void | Promise<void>;
  type?: 'number' | 'text';
  value: string;
}

const DraftInput = (props: DraftInputProps): React.ReactElement => {
  const [draft, setDraft] = React.useState(props.value);

  React.useEffect(() => {
    setDraft(props.value);
  }, [props.value]);

  const commit = (): void => {
    if (draft !== props.value) {
      void props.onCommit(draft);
    }
  };

  return (
    <input
      aria-label={props.ariaLabel}
      onBlur={commit}
      onChange={(event) => setDraft(event.target.value)}
      type={props.type || 'text'}
      value={draft}
    />
  );
};

const countCtcTrackConfigLines = (trackConfig: CtcTrackConfig): number => (
  trackConfig.networks.reduce((total, network) => total + network.lines.length, 0)
);

const countCtcTrackConfigLoops = (trackConfig: CtcTrackConfig): number => (
  trackConfig.networks.reduce((networkTotal, network) => (
    networkTotal + network.lines.reduce((lineTotal, line) => lineTotal + line.loops.length, 0)
  ), 0)
);

const CtcTrackConfigDetails = ({ onSave, source }: { onSave: (trackConfig: CtcTrackConfig) => void; source: DataSourceConfig }): React.ReactElement | null => {
  const trackConfig = source.fileConfig?.ctcTrackConfig;
  if (!trackConfig) {
    return source.fileConfig?.trackConfigFilePath ? (
      <p>No TRACK.CFG metadata has been loaded for this source yet. Re-select the TRACK.CFG file or import the CTC file to parse it.</p>
    ) : null;
  }

  const lineCount = countCtcTrackConfigLines(trackConfig);
  const loopCount = countCtcTrackConfigLoops(trackConfig);

  return (
    <details open>
      <summary>
        TRACK.CFG metadata: {trackConfig.networks.length} network{trackConfig.networks.length === 1 ? '' : 's'}, {lineCount} line{lineCount === 1 ? '' : 's'}, {loopCount} loop{loopCount === 1 ? '' : 's'}
      </summary>
      <table aria-label={`Dorian CTC TRACK.CFG Metadata ${source.id}`}>
        <thead>
          <tr>
            <th>Network</th>
            <th>Line</th>
            <th>Line name</th>
            <th>Loop</th>
            <th>Site address</th>
            <th>Card</th>
            <th>Com port</th>
            <th>Lap/finish</th>
          </tr>
        </thead>
        <tbody>
          {trackConfig.networks.flatMap((network) => network.lines.flatMap((line) => line.loops.map((loop) => (
            <tr key={`${network.name}-${line.line}-${line.name}-${loop.loopNumber}-${loop.siteAddress}-${loop.card}-${loop.comPort}`}>
              <td>{network.name}</td>
              <td>{line.line}</td>
              <td>{line.name}</td>
              <td>{loop.loopNumber}</td>
              <td>{loop.siteAddress}</td>
              <td>{loop.card}</td>
              <td>{loop.comPort}</td>
              <td>
                <input
                  aria-label={`CTC ${network.name} line ${line.line} loop ${loop.loopNumber} lap finish`}
                  checked={loop.isLapCompletion === true}
                  onChange={(event) => {
                    const nextTrackConfig: CtcTrackConfig = {
                      ...trackConfig,
                      networks: trackConfig.networks.map((candidateNetwork) => candidateNetwork === network ? {
                        ...candidateNetwork,
                        lines: candidateNetwork.lines.map((candidateLine) => candidateLine === line ? {
                          ...candidateLine,
                          loops: candidateLine.loops.map((candidateLoop) => candidateLoop === loop
                            ? { ...candidateLoop, isLapCompletion: event.target.checked }
                            : candidateLoop),
                        } : candidateLine),
                      } : candidateNetwork),
                    };
                    onSave(nextTrackConfig);
                  }}
                  type="checkbox"
                />
              </td>
            </tr>
          ))))}
        </tbody>
      </table>
    </details>
  );
};

export const DataSourcesPanel = (props: DataSourcesPanelProps): React.ReactElement => {
  const [newSourceType, setNewSourceType] = React.useState<DataSourceType>('timing-rfid-decoder');
  const [selectedSourceId, setSelectedSourceId] = React.useState<string | undefined>(props.dataSources[0]?.id);
  const [sourceFetchErrors, setSourceFetchErrors] = React.useState<Record<string, SourceFetchError>>({});
  const [masterProfileDraftErrors, setMasterProfileDraftErrors] = React.useState<Record<string, string>>({});
  const [dorianCtcLoadProgress, setDorianCtcLoadProgress] = React.useState<InlineLoadingProgress>({ completed: 0, total: 1 });
  const [isLoadingDorianCtc, setIsLoadingDorianCtc] = React.useState<boolean>(false);
  const [durtFileMakerLoadProgress, setDurtFileMakerLoadProgress] = React.useState<InlineLoadingProgress>({ completed: 0, total: 1 });
  const [isLoadingDurtFileMaker, setIsLoadingDurtFileMaker] = React.useState<boolean>(false);
  const [dorianCtcPreview, setDorianCtcPreview] = React.useState<MrScatsDataFilePreview | undefined>();
  const [dorianCtcPreviewError, setDorianCtcPreviewError] = React.useState<string | undefined>();
  const [dorianCtcPreviewLoadingFile, setDorianCtcPreviewLoadingFile] = React.useState<string | undefined>();

  React.useEffect(() => {
    if (props.dataSources.length === 0) {
      setSelectedSourceId(undefined);
      return;
    }

    if (!selectedSourceId || !props.dataSources.find((source) => source.id === selectedSourceId)) {
      setSelectedSourceId(props.dataSources[0]?.id);
    }
  }, [props.dataSources, selectedSourceId]);

  const selectedSource = props.dataSources.find((source) => source.id === selectedSourceId);

  const handleLoadApicalEvents = async (sourceId: TimeRecordSourceId): Promise<void> => {
    setSourceFetchErrors((current) => {
      const next = { ...current };
      delete next[sourceId];
      return next;
    });

    try {
      await props.onLoadApicalEvents(sourceId);
    } catch (error: unknown) {
      const formattedError = formatErrorForDisplay(error);
      console.error(`Failed to fetch Apical events for source ${sourceId}:\n${formattedError}`);
      props.onDisplayError?.('System', error);
      setSourceFetchErrors((current) => ({
        ...current,
        [sourceId]: {
          details: formattedError,
          title: 'Failed to fetch Apical events',
        },
      }));
    }
  };

  const handleFetchApicalDataNow = async (sourceId: TimeRecordSourceId): Promise<void> => {
    setSourceFetchErrors((current) => {
      const next = { ...current };
      delete next[sourceId];
      return next;
    });

    try {
      await props.onFetchApicalDataNow(sourceId);
    } catch (error: unknown) {
      const formattedError = formatErrorForDisplay(error);
      console.error(`Failed to fetch Apical event data for source ${sourceId}:\n${formattedError}`);
      props.onDisplayError?.('System', error);
      setSourceFetchErrors((current) => ({
        ...current,
        [sourceId]: {
          details: formattedError,
          title: 'Failed to fetch Apical event data',
        },
      }));
    }
  };

  const handleReprocessApicalData = async (sourceId: TimeRecordSourceId): Promise<void> => {
    setSourceFetchErrors((current) => {
      const next = { ...current };
      delete next[sourceId];
      return next;
    });

    try {
      await props.onReprocessApicalData(sourceId);
    } catch (error: unknown) {
      const formattedError = formatErrorForDisplay(error);
      console.error(`Failed to reprocess cached Apical event data for source ${sourceId}:\n${formattedError}`);
      props.onDisplayError?.('System', error);
      setSourceFetchErrors((current) => ({
        ...current,
        [sourceId]: {
          details: formattedError,
          title: 'Failed to reprocess Apical event data',
        },
      }));
    }
  };

  const handleOpenLocalFile = async (filePath: string): Promise<void> => {
    if (!props.onOpenLocalFile) {
      return;
    }

    await props.onOpenLocalFile(filePath);
  };

  const handleSelectRfidCsvFile = async (source: DataSourceConfig): Promise<void> => {
    if (!props.onSelectLocalFile) {
      return;
    }

    const filePath = await props.onSelectLocalFile();
    if (!filePath) {
      return;
    }

    await props.onSaveSource(source.id, {
      fileConfig: {
        ...source.fileConfig,
        filePath,
      },
    });
  };

  const handleSelectDorianCtcSrtFile = async (source: DataSourceConfig): Promise<void> => {
    if (!props.onSelectDorianCtcSrtFile) {
      return;
    }

    const filePath = await props.onSelectDorianCtcSrtFile();
    if (!filePath) {
      return;
    }

    await props.onSaveSource(source.id, {
      fileConfig: {
        ...source.fileConfig,
        filePath,
      },
    });
  };

  const handleSelectDorianCtcTrackConfigFile = async (source: DataSourceConfig): Promise<void> => {
    if (!props.onSelectDorianCtcTrackConfigFile) {
      return;
    }

    const trackConfigFilePath = await props.onSelectDorianCtcTrackConfigFile();
    if (!trackConfigFilePath) {
      return;
    }

    await props.onSaveSource(source.id, {
      fileConfig: {
        ...source.fileConfig,
        trackConfigFilePath,
      },
    });
  };

  const handleSelectDurtFileMakerDatabase = async (source: DataSourceConfig): Promise<void> => {
    const databaseFilePath = await props.onSelectDurtFileMakerDatabase?.();
    if (!databaseFilePath) {
      return;
    }
    await props.onSaveSource(source.id, { durtFileMakerConfig: { ...source.durtFileMakerConfig, databaseFilePath } });
  };

  const handleSelectDurtFileMakerExtractor = async (source: DataSourceConfig): Promise<void> => {
    const extractorPath = await props.onSelectDurtFileMakerExtractor?.();
    if (!extractorPath) {
      return;
    }
    await props.onSaveSource(source.id, { durtFileMakerConfig: { ...source.durtFileMakerConfig, extractorPath } });
  };

  const handleLoadDorianCtcSrtFile = async (sourceId: TimeRecordSourceId): Promise<void> => {
    if (!props.onLoadDorianCtcSrtFile) {
      return;
    }

    setIsLoadingDorianCtc(true);
    setDorianCtcLoadProgress({
      callerName: 'Importing CTC file',
      completed: 0,
      currentTask: 'Preparing CTC file import',
      total: 0,
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    let lastProgressPaintAt = Date.now();
    try {
      await props.onLoadDorianCtcSrtFile(sourceId, async (progress) => {
        setDorianCtcLoadProgress(progress);
        if (Date.now() - lastProgressPaintAt > 50 || progress.completed >= progress.total) {
          lastProgressPaintAt = Date.now();
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      });
    } finally {
      setIsLoadingDorianCtc(false);
    }
  };

  const handleLoadDurtFileMakerDatabase = async (sourceId: TimeRecordSourceId): Promise<void> => {
    if (!props.onLoadDurtFileMakerDatabase) {
      return;
    }

    setIsLoadingDurtFileMaker(true);
    setDurtFileMakerLoadProgress({
      callerName: 'Importing DURT FileMaker database',
      completed: 0,
      currentTask: 'Preparing DURT FileMaker database import',
      total: 0,
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    let lastProgressPaintAt: number = Date.now();
    try {
      await props.onLoadDurtFileMakerDatabase(sourceId, async (progress: InlineLoadingProgress) => {
        setDurtFileMakerLoadProgress(progress);
        if (Date.now() - lastProgressPaintAt > 50 || progress.completed >= progress.total) {
          lastProgressPaintAt = Date.now();
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      });
    } finally {
      setIsLoadingDurtFileMaker(false);
    }
  };

  const handleSaveDorianCtcImportMode = (source: DataSourceConfig, importMode: DataImportMode): void => {
    void props.onSaveSource(source.id, {
      fileConfig: {
        ...source.fileConfig,
        importMode,
      },
    });
  };

  const handleSaveDorianCtcPlaceholderEntrants = (source: DataSourceConfig, importPlaceholderEntrantsForUnknownTransmitters: boolean): void => {
    void props.onSaveSource(source.id, {
      fileConfig: {
        ...source.fileConfig,
        importPlaceholderEntrantsForUnknownTransmitters,
      },
    });
  };

  const handlePreviewDorianCtcSrtFile = async (source: DataSourceConfig): Promise<void> => {
    if (!props.onPreviewDorianCtcSrtFile || !source.fileConfig?.filePath) {
      return;
    }

    setDorianCtcPreview(undefined);
    setDorianCtcPreviewError(undefined);
    setDorianCtcPreviewLoadingFile(source.fileConfig.filePath);
    try {
      setDorianCtcPreview(await props.onPreviewDorianCtcSrtFile(source.id));
    } catch (error: unknown) {
      setDorianCtcPreviewError(formatErrorForDisplay(error));
    } finally {
      setDorianCtcPreviewLoadingFile(undefined);
    }
  };

  return (
    <section className="events-panel">
      <h2>Configured Data Sources</h2>
      <div className="events-layout two-panel">
        <section className="events-panel">
          <DataSourceTypesPanel
            newSourceType={newSourceType}
            onChangeNewSourceType={setNewSourceType}
            onCreateSource={props.onCreateSource}
          />
          {props.dataSources.length === 0 ? (
            <p>No data sources configured yet.</p>
          ) : (
            <table aria-label="Configured data sources table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Enabled</th>
                </tr>
              </thead>
              <tbody>
                {props.dataSources.map((source) => {
                  const isSelected = source.id === selectedSourceId;
                  return (
                    <tr
                      key={source.id}
                      aria-selected={isSelected}
                      onClick={() => setSelectedSourceId(source.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>{source.name}</td>
                      <td>{getDataSourceTypeLabel(source.type)}</td>
                      <td>{source.enabled ? 'Yes' : 'No'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <section className="events-panel">
          {selectedSource ? (
            (() => {
              const source = selectedSource;
              const isApicalApi = source.type === 'api-apical-excel-file';
              const listedEvents = source.listedEvents || [];
              const selectedEventIds = source.apiConfig?.selectedEventIds || [];
              const selectedApicalEventId = selectedEventIds[0];
              const isMasterEntrants = source.type === 'master-entrant-profiles';
              const isMrScatsData = source.type === 'file-mr-scats-data';
              const isRfidTimingCsv = source.type === 'file-rfid-timing-csv';
              const isDorianCtcSrt = source.type === 'file-dorian-ctc-srt';
              const isDurtFileMaker = source.type === 'file-durt-filemaker';
              const masterProfilesJson = JSON.stringify(source.masterEntrantConfig?.profiles || [], null, 2);
              const sourceFetchError = sourceFetchErrors[source.id];

              return (
                <>
                  <h3>{source.name}</h3>
                  <p>{getDataSourceTypeLabel(source.type)}</p>
                  <label>
                    Source Name
                    <DraftInput
                      ariaLabel={`Source Name ${source.id}`}
                      value={source.name}
                      onCommit={(value) => props.onSaveSource(source.id, { name: value })}
                    />
                  </label>
                  <label>
                    Enabled
                    <input
                      aria-label={`Source Enabled ${source.id}`}
                      type="checkbox"
                      checked={source.enabled}
                      onChange={(event) => props.onSaveSource(source.id, { enabled: event.target.checked })}
                    />
                  </label>

                  {isMrScatsData ? (
                    <MrScatsDataSourcePanel
                      source={source}
                      onLoadEvent={props.onLoadMrScatsEvent}
                      onPreviewDataFile={props.onPreviewMrScatsDataFile}
                      onSaveSource={props.onSaveSource}
                      onSelectDataArchive={props.onSelectMrScatsDataArchive}
                      onSelectDataDirectory={props.onSelectMrScatsDataDirectory}
                    />
                  ) : isRfidTimingCsv ? (
                    <>
                      <h4>RFID Timing CSV File</h4>
                      <label>
                        File Path
                        <input
                          aria-label={`RFID Timing CSV File Path ${source.id}`}
                          readOnly
                          type="text"
                          value={source.fileConfig?.filePath || ''}
                          placeholder="No file selected"
                        />
                      </label>
                      <div className="events-actions">
                        <button type="button" onClick={() => handleSelectRfidCsvFile(source)}>
                          Edit File
                        </button>
                      </div>
                    </>
                  ) : isDorianCtcSrt ? (
                    <>
                      <h4>Dorian CTC SRT / ERF File</h4>
                      <p>Imports raw crossing times and transponder metadata without creating competitors.</p>
                      <label>
                        File Path
                        <input
                          aria-label={`Dorian CTC SRT / ERF File Path ${source.id}`}
                          readOnly
                          type="text"
                          value={source.fileConfig?.filePath || ''}
                          placeholder="No file selected"
                        />
                      </label>
                      <label>
                        TRACK.CFG File Path (optional)
                        <input
                          aria-label={`Dorian CTC TRACK.CFG File Path ${source.id}`}
                          readOnly
                          type="text"
                          value={source.fileConfig?.trackConfigFilePath || ''}
                          placeholder="No TRACK.CFG selected"
                        />
                      </label>
                      <CtcTrackConfigDetails
                        onSave={(ctcTrackConfig) => {
                          const finishLineNumbers = ctcTrackConfig.networks
                            .flatMap((network) => network.lines)
                            .filter((line) => line.loops.some((loop) => loop.isLapCompletion === true))
                            .map((line) => line.line);
                          void props.onSaveSource(source.id, {
                            fileConfig: {
                              ...source.fileConfig,
                              ctcTrackConfig,
                            },
                            finishLineNumbers: Array.from(new Set(finishLineNumbers)).sort((left, right) => left - right),
                          });
                        }}
                        source={source}
                      />
                      <fieldset>
                        <legend>Data import mode</legend>
                        <label>
                          <input
                            checked={(source.fileConfig?.importMode || 'import') === 'import'}
                            name={`dorian-ctc-import-mode-${source.id}`}
                            onChange={() => handleSaveDorianCtcImportMode(source, 'import')}
                            type="radio"
                          />
                          Import — remove the selected session&apos;s existing imported data before loading the file.
                        </label>
                        <label>
                          <input
                            checked={source.fileConfig?.importMode === 'update'}
                            name={`dorian-ctc-import-mode-${source.id}`}
                            onChange={() => handleSaveDorianCtcImportMode(source, 'update')}
                            type="radio"
                          />
                          Update — retain existing data and update or add matching file records where possible.
                        </label>
                      </fieldset>
                      <label>
                        <input
                          checked={source.fileConfig?.importPlaceholderEntrantsForUnknownTransmitters === true}
                          onChange={(event) => handleSaveDorianCtcPlaceholderEntrants(source, event.target.checked)}
                          type="checkbox"
                        />
                        Import placeholder entrant for unknown transmitters
                      </label>
                      <div className="events-actions">
                        <button type="button" onClick={() => handleSelectDorianCtcSrtFile(source)}>
                          Edit File
                        </button>
                        <button type="button" onClick={() => handleSelectDorianCtcTrackConfigFile(source)}>
                          Edit TRACK.CFG
                        </button>
                        <button
                          type="button"
                          disabled={!source.fileConfig?.filePath || isLoadingDorianCtc}
                          onClick={() => {
                            void handleLoadDorianCtcSrtFile(source.id);
                          }}
                        >
                          Import CTC File
                        </button>
                        <button
                          type="button"
                          disabled={!source.fileConfig?.filePath || !props.onPreviewDorianCtcSrtFile}
                          onClick={() => {
                            void handlePreviewDorianCtcSrtFile(source);
                          }}
                        >
                          Preview
                        </button>
                        {isLoadingDorianCtc ? (
                          <InlineLoadingIndicator ariaLabel="Loading CTC file" progress={dorianCtcLoadProgress} />
                        ) : null}
                      </div>
                    </>
                  ) : isDurtFileMaker ? (
                    <>
                      <h4>DURT FileMaker Database</h4>
                      <p>Imports entrant and crossing tables from a FileMaker .fp7 or .fmp12 file using the bundled fmp2json extractor.</p>
                      <label>
                        Database file
                        <input aria-label={`DURT FileMaker Database Path ${source.id}`} readOnly type="text" value={source.durtFileMakerConfig?.databaseFilePath || ''} />
                      </label>
                      <label>
                        fmp2json executable (bundled)
                        <details className="inline-info">
                          <summary aria-label="About fmp2json" title="About the required fmp2json extractor">ⓘ</summary>
                          <p>FileMaker databases are proprietary binary files. RaceSweet uses fmp2json to read their tables safely, then converts DURT entrants and crossings into the RaceSweet ledger.</p>
                          <p>RaceSweet packages fmp2json with the Windows app, so normal users do not need a compiler or separate installation. Developers can create that package with npm run build:fmptools:win32; the build runs entirely in Docker.</p>
                          <p>The bundled binary is built from <a href="https://github.com/evanmiller/fmptools/releases" onClick={(event) => {
                            event.preventDefault(); void props.onOpenExternalUrl?.('https://github.com/evanmiller/fmptools/releases');
                          }}>fmptools releases</a>. A custom executable can be selected below only when troubleshooting or testing a different build.</p>
                        </details>
                        <input aria-label={`DURT FileMaker Extractor Path ${source.id}`} readOnly type="text" value={source.durtFileMakerConfig?.extractorPath || ''} />
                      </label>
                      <fieldset>
                        <legend>Data import mode</legend>
                        <label><input checked={(source.durtFileMakerConfig?.importMode || 'import') === 'import'} name={`durt-import-mode-${source.id}`} onChange={() => props.onSaveSource(source.id, { durtFileMakerConfig: { ...source.durtFileMakerConfig, importMode: 'import' } })} type="radio" />Import — replace imported state for the selected session.</label>
                        <label><input checked={source.durtFileMakerConfig?.importMode === 'update'} name={`durt-import-mode-${source.id}`} onChange={() => props.onSaveSource(source.id, { durtFileMakerConfig: { ...source.durtFileMakerConfig, importMode: 'update' } })} type="radio" />Update — merge imported records into the selected session.</label>
                      </fieldset>
                      <div className="events-actions">
                        <button type="button" onClick={() => handleSelectDurtFileMakerDatabase(source)}>Select Database</button>
                        <button type="button" onClick={() => handleSelectDurtFileMakerExtractor(source)}>Select Extractor</button>
                        <button disabled={!source.durtFileMakerConfig?.databaseFilePath || isLoadingDurtFileMaker} type="button" onClick={() => {
                          void handleLoadDurtFileMakerDatabase(source.id);
                        }}>Import DURT Database</button>
                        {isLoadingDurtFileMaker ? (
                          <InlineLoadingIndicator ariaLabel="Importing DURT database" progress={durtFileMakerLoadProgress} />
                        ) : null}
                      </div>
                    </>
                  ) : isApicalApi && source.apiConfig ? (
                    <>
                      <h4>Apical Endpoint</h4>
                      <label>
                        Base URL
                        <DraftInput
                          ariaLabel={`Apical Base URL ${source.id}`}
                          value={source.apiConfig.baseUrl}
                          onCommit={(value) => props.onSaveSource(source.id, {
                            apiConfig: {
                              ...source.apiConfig!,
                              baseUrl: value,
                            },
                          })}
                        />
                      </label>
                      <label>
                        Auth Header Name
                        <DraftInput
                          ariaLabel={`Apical Auth Header Name ${source.id}`}
                          value={source.apiConfig.authHeaderName}
                          onCommit={(value) => props.onSaveSource(source.id, {
                            apiConfig: {
                              ...source.apiConfig!,
                              authHeaderName: value,
                            },
                          })}
                        />
                      </label>
                      <label>
                        Auth Header Value
                        <DraftInput
                          ariaLabel={`Apical Auth Header Value ${source.id}`}
                          value={source.apiConfig.authHeaderValue}
                          onCommit={(value) => props.onSaveSource(source.id, {
                            apiConfig: {
                              ...source.apiConfig!,
                              authHeaderValue: value,
                            },
                          })}
                        />
                      </label>
                      <label>
                        Company Id
                        <DraftInput
                          ariaLabel={`Apical Company Id ${source.id}`}
                          type="number"
                          value={source.apiConfig.companyId.toString()}
                          onCommit={(value) => props.onSaveSource(source.id, {
                            apiConfig: {
                              ...source.apiConfig!,
                              companyId: Number(value) || 2,
                            },
                          })}
                        />
                      </label>
                      <label>
                        Poll Interval (seconds)
                        <DraftInput
                          ariaLabel={`Apical Poll Interval ${source.id}`}
                          type="number"
                          value={source.apiConfig.pollIntervalSeconds.toString()}
                          onCommit={(value) => props.onSaveSource(source.id, {
                            apiConfig: {
                              ...source.apiConfig!,
                              pollIntervalSeconds: Number(value) || 30,
                            },
                          })}
                        />
                      </label>
                      <label>
                        HTTP Timeout (seconds)
                        <DraftInput
                          ariaLabel={`Apical Http Timeout ${source.id}`}
                          type="number"
                          value={source.apiConfig.httpTimeoutSeconds.toString()}
                          onCommit={(value) => props.onSaveSource(source.id, {
                            apiConfig: {
                              ...source.apiConfig!,
                              httpTimeoutSeconds: Number(value) || 30,
                            },
                          })}
                        />
                      </label>
                      <label>
                        Live polling
                        <input
                          aria-label={`Apical Live ${source.id}`}
                          type="checkbox"
                          checked={source.apiConfig.live}
                          onChange={(event) => props.onSaveSource(source.id, {
                            apiConfig: {
                              ...source.apiConfig!,
                              live: event.target.checked,
                            },
                          })}
                        />
                      </label>
                      <div className="events-actions">
                        <button type="button" onClick={() => handleLoadApicalEvents(source.id)}>
                          Fetch Apical Events
                        </button>
                      </div>
                      <p>
                        Data last retrieved: {source.dataLastRetrieved || 'Never'}{' '}
                        <button
                          type="button"
                          onClick={() => handleReprocessApicalData(source.id)}
                          disabled={!source.apicalDataFilePath}
                        >
                          Reprocess data
                        </button>
                      </p>
                      {source.apicalDataFilePath ? (
                        <p>
                          <a
                            href="#"
                            onClick={(event) => {
                              event.preventDefault();
                              void handleOpenLocalFile(source.apicalDataFilePath!);
                            }}
                          >
                            Open downloaded Apical Excel file
                          </a>
                          <br />
                          <span>{source.apicalDataFilePath}</span>
                        </p>
                      ) : null}
                      {sourceFetchError ? (
                        <div className="inline-error" role="alert">
                          <p>{sourceFetchError.title}:</p>
                          <pre>{sourceFetchError.details}</pre>
                          <button
                            type="button"
                            onClick={() => {
                              setSourceFetchErrors((current) => {
                                const next = { ...current };
                                delete next[source.id];
                                return next;
                              });
                            }}
                          >
                            Dismiss
                          </button>
                        </div>
                      ) : null}
                      {listedEvents.length > 0 ? (
                        <div>
                          <h5>Available Apical Events</h5>
                          <label>
                            Apical Event
                            <select
                              aria-label={`Apical Selected Event ${source.id}`}
                              value={selectedApicalEventId || ''}
                              onChange={(event) => {
                                const eventId = Number(event.target.value);
                                if (!eventId) {
                                  return;
                                }
                                props.onSaveSource(source.id, {
                                  apiConfig: {
                                    ...source.apiConfig!,
                                    apicalEventId: eventId,
                                    selectedEventIds: [eventId],
                                  },
                                });
                              }}
                            >
                              <option value="">Select Apical event</option>
                              {listedEvents.map((eventItem) => (
                                <option key={eventItem.id} value={eventItem.id}>
                                  {eventItem.name} ({eventItem.id})
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      ) : null}
                    </>
                  ) : isMasterEntrants ? (
                    <>
                      <h4>Master Entrant Profiles</h4>
                      <p>Used as fallback when imported timing data does not contain full entrant profile fields.</p>
                      <label>
                        Profiles JSON
                        <textarea
                          aria-label={`Master Entrant Profiles ${source.id}`}
                          defaultValue={masterProfilesJson}
                          onBlur={(event) => {
                            try {
                              const parsed = JSON.parse(event.target.value);
                              if (!Array.isArray(parsed)) {
                                throw new Error('Profiles JSON must be an array.');
                              }
                              setMasterProfileDraftErrors((current) => {
                                const next = { ...current };
                                delete next[source.id];
                                return next;
                              });
                              props.onSaveSource(source.id, {
                                masterEntrantConfig: {
                                  profiles: parsed,
                                },
                              });
                            } catch (error: unknown) {
                              const message = error instanceof Error ? error.message : String(error);
                              props.onDisplayError?.('System', error);
                              setMasterProfileDraftErrors((current) => ({
                                ...current,
                                [source.id]: message,
                              }));
                            }
                          }}
                        />
                      </label>
                      {masterProfileDraftErrors[source.id] ? (
                        <div className="inline-error" role="alert">
                          <p>Failed to parse profiles: {masterProfileDraftErrors[source.id]}</p>
                          <button
                            type="button"
                            onClick={() => {
                              setMasterProfileDraftErrors((current) => {
                                const next = { ...current };
                                delete next[source.id];
                                return next;
                              });
                            }}
                          >
                            Dismiss
                          </button>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p>Placeholder only; runtime integration not implemented for this source type yet.</p>
                  )}

                  <div className="events-actions">
                    {isApicalApi ? (
                      <button type="button" onClick={() => handleFetchApicalDataNow(source.id)}>
                        Fetch event data now
                      </button>
                    ) : null}
                    <button type="button" onClick={() => props.onDeleteSource(source.id)}>
                      Delete Source
                    </button>
                  </div>
                </>
              );
            })()
          ) : (
            <p>Select a data source from the table to edit details.</p>
          )}
        </section>
      </div>
      {dorianCtcPreview || dorianCtcPreviewError || dorianCtcPreviewLoadingFile ? (
        <div className="warning-modal-backdrop">
          <section className="warning-modal reload-summary-dialog mr-scats-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="mr-scats-preview-title">
            <div className="warning-modal-heading">
              <h2 id="mr-scats-preview-title">{dorianCtcPreview?.fileName || dorianCtcPreviewLoadingFile || 'CTC file preview'}</h2>
            </div>
            <div className="mr-scats-preview-content">
              {dorianCtcPreviewLoadingFile ? <p>Loading preview...</p> : null}
              {dorianCtcPreviewError ? <div className="inline-error" role="alert"><pre>{dorianCtcPreviewError}</pre></div> : null}
              {dorianCtcPreview ? (
                <>
                  <p>{dorianCtcPreview.parser.toUpperCase()} preview: {dorianCtcPreview.displayedRowCount}{dorianCtcPreview.recordCount === undefined ? ' rows' : ` of ${dorianCtcPreview.recordCount} records`}</p>
                  {dorianCtcPreview.warnings.map((warning) => <p key={warning}>{warning}</p>)}
                  <table aria-label={`MR-SCATS File Preview ${dorianCtcPreview.fileName}`}>
                    <thead><tr>{dorianCtcPreview.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
                    <tbody>{dorianCtcPreview.rows.map((row, rowIndex) => <tr key={`${dorianCtcPreview.fileName}-${rowIndex}`}>{dorianCtcPreview.columns.map((column) => <td key={column}>{row[column]}</td>)}</tr>)}</tbody>
                  </table>
                </>
              ) : null}
            </div>
            <div className="events-actions warning-modal-actions">
              <button type="button" onClick={() => {
                setDorianCtcPreview(undefined);
                setDorianCtcPreviewError(undefined);
                setDorianCtcPreviewLoadingFile(undefined);
              }}>Close</button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
};
