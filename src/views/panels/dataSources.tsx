import { FormControlLabel, MenuItem, Switch, TextField } from "@mui/material";
import React from "react";
import { formatErrorForDisplay } from "../../app/stackTrace.js";
import {
  type DataImportMode,
  type DataSourceConfig,
  type DataSourceType,
  getDataSourceTypeLabel,
} from "../../app/systemConfig.js";
import type { CtcTrackConfig } from "../../model/ctcTrackConfig.js";
import { TimeRecordSourceId } from "../../model/types.js";
import type {
  MrScatsDataFileInventory,
  MrScatsDataFileSummary,
} from "../../parsers/mrScats/fileInventory.js";
import type { MrScatsDataFilePreview } from "../../parsers/mrScats/filePreview.js";
import { AsyncButton } from "../asyncButton.js";
import { DataSourceTypesPanel } from "./dataSourceTypes.js";
import { FileSelectionField } from "./fileSelectionField.js";
import type { InlineLoadingProgress } from "./InlineLoadingIndicator.js";
import { MrScatsDataSourcePanel } from "./mrScatsDataSourcePanel.js";

interface DataSourcesPanelProps {
  dataSources: DataSourceConfig[];
  onCreateSource: (type: DataSourceType) => void | Promise<void>;
  onCreateApicalSourceFrom?: (
    sourceId: TimeRecordSourceId,
    apicalEventId: number,
  ) => void | Promise<void>;
  onDeleteSource: (sourceId: TimeRecordSourceId) => void | Promise<void>;
  onDisplayError?: (source: string, error: unknown) => void;
  onFetchApicalDataNow: (sourceId: TimeRecordSourceId) => void | Promise<void>;
  onLoadApicalEvents: (sourceId: TimeRecordSourceId) => void | Promise<void>;
  onLoadMrScatsEvent?: (
    sourceId: TimeRecordSourceId,
    onProgress?: (progress: InlineLoadingProgress) => void | Promise<void>,
  ) => void | Promise<void>;
  onLoadDorianCtcSrtFile?: (
    sourceId: TimeRecordSourceId,
    onProgress?: (progress: InlineLoadingProgress) => void | Promise<void>,
  ) => void | Promise<void>;
  onLoadDurtFileMakerDatabase?: (
    sourceId: TimeRecordSourceId,
    onProgress?: (progress: InlineLoadingProgress) => void | Promise<void>,
  ) => void | Promise<void>;
  onOpenLocalFile?: (filePath: string) => void | Promise<void>;
  onOpenExternalUrl?: (url: string) => void | Promise<void>;
  onPreviewMrScatsDataFile?: (
    sourceId: TimeRecordSourceId,
    file: MrScatsDataFileSummary,
  ) => Promise<MrScatsDataFilePreview>;
  onPreviewDorianCtcSrtFile?: (
    sourceId: TimeRecordSourceId,
  ) => Promise<MrScatsDataFilePreview>;
  onReprocessApicalData: (sourceId: TimeRecordSourceId) => void | Promise<void>;
  onSaveSource: (
    sourceId: TimeRecordSourceId,
    changes: Partial<DataSourceConfig>,
  ) => void | Promise<void>;
  onStartRfidDecoderListener?: (
    sourceId: TimeRecordSourceId,
  ) => void | Promise<void>;
  onStopRfidDecoderListener?: (
    sourceId: TimeRecordSourceId,
  ) => void | Promise<void>;
  onSelectMrScatsDataArchive?: () => Promise<
    MrScatsDataFileInventory | undefined
  >;
  onSelectMrScatsDataDirectory?: () => Promise<
    MrScatsDataFileInventory | undefined
  >;
  onSelectLocalFile?: () => Promise<string | undefined>;
  onSelectDorianCtcSrtFile?: () => Promise<string | undefined>;
  onSelectDorianCtcTrackConfigFile?: () => Promise<string | undefined>;
  onSelectDurtFileMakerDatabase?: () => Promise<string | undefined>;
  onSelectDurtFileMakerExtractor?: () => Promise<string | undefined>;
  rfidDecoderOutput?: Record<string, string>;
}

interface SourceFetchError {
  details: string;
  title: string;
}

interface DraftInputProps {
  ariaLabel: string;
  onCommit: (value: string) => void | Promise<void>;
  type?: "number" | "text";
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
    <TextField
      slotProps={{ htmlInput: { "aria-label": props.ariaLabel } }}
      onBlur={commit}
      onChange={(event) => setDraft(event.target.value)}
      type={props.type || "text"}
      value={draft}
    />
  );
};

const countCtcTrackConfigLines = (trackConfig: CtcTrackConfig): number =>
  trackConfig.networks.reduce(
    (total, network) => total + network.lines.length,
    0,
  );

const countCtcTrackConfigLoops = (trackConfig: CtcTrackConfig): number =>
  trackConfig.networks.reduce(
    (networkTotal, network) =>
      networkTotal +
      network.lines.reduce(
        (lineTotal, line) => lineTotal + line.loops.length,
        0,
      ),
    0,
  );

const CtcTrackConfigDetails = ({
  onSave,
  source,
}: {
  onSave: (trackConfig: CtcTrackConfig) => void;
  source: DataSourceConfig;
}): React.ReactElement | null => {
  const trackConfig = source.fileConfig?.ctcTrackConfig;
  if (!trackConfig) {
    return source.fileConfig?.trackConfigFilePath ? (
      <p>
        No TRACK.CFG metadata has been loaded for this source yet. Re-select the
        TRACK.CFG file or import the CTC file to parse it.
      </p>
    ) : null;
  }

  const lineCount = countCtcTrackConfigLines(trackConfig);
  const loopCount = countCtcTrackConfigLoops(trackConfig);

  return (
    <details open>
      <summary>
        TRACK.CFG metadata: {trackConfig.networks.length} network
        {trackConfig.networks.length === 1 ? "" : "s"}, {lineCount} line
        {lineCount === 1 ? "" : "s"}, {loopCount} loop
        {loopCount === 1 ? "" : "s"}
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
          {trackConfig.networks.flatMap((network) =>
            network.lines.flatMap((line) =>
              line.loops.map((loop) => (
                <tr
                  key={`${network.name}-${line.line}-${line.name}-${loop.loopNumber}-${loop.siteAddress}-${loop.card}-${loop.comPort}`}
                >
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
                          networks: trackConfig.networks.map(
                            (candidateNetwork) =>
                              candidateNetwork === network
                                ? {
                                  ...candidateNetwork,
                                  lines: candidateNetwork.lines.map(
                                    (candidateLine) =>
                                      candidateLine === line
                                        ? {
                                          ...candidateLine,
                                          loops: candidateLine.loops.map(
                                            (candidateLoop) =>
                                              candidateLoop === loop
                                                ? {
                                                  ...candidateLoop,
                                                  isLapCompletion:
                                                          event.target.checked,
                                                }
                                                : candidateLoop,
                                          ),
                                        }
                                        : candidateLine,
                                  ),
                                }
                                : candidateNetwork,
                          ),
                        };
                        onSave(nextTrackConfig);
                      }}
                      type="checkbox"
                    />
                  </td>
                </tr>
              )),
            ),
          )}
        </tbody>
      </table>
    </details>
  );
};

interface RfidDecoderOutputFieldProps {
  sourceId: string;
  value: string;
}

const RfidDecoderOutputField = (
  props: RfidDecoderOutputFieldProps,
): React.ReactElement => {
  const outputRef = React.useRef<HTMLTextAreaElement | null>(null);
  const shouldFollowOutputRef = React.useRef(true);

  const handleScroll = (event: React.UIEvent<HTMLTextAreaElement>): void => {
    const output: HTMLTextAreaElement = event.currentTarget;
    shouldFollowOutputRef.current =
      output.scrollTop + output.clientHeight >= output.scrollHeight - 1;
  };

  React.useLayoutEffect((): void => {
    const output: HTMLTextAreaElement | null = outputRef.current;
    if (output && shouldFollowOutputRef.current) {
      output.scrollTop = output.scrollHeight;
    }
  }, [props.value]);

  return (
    <TextField
      fullWidth
      inputRef={outputRef}
      label="Received TCP data"
      maxRows={20}
      minRows={8}
      multiline
      slotProps={{
        htmlInput: {
          "aria-label": `RFID Decoder Received Data ${props.sourceId}`,
          onScroll: handleScroll,
          readOnly: true,
        },
      }}
      sx={{
        "& .MuiInputBase-root": {
          maxHeight: "calc(100dvh - 18rem)",
          overflowY: "auto",
        },
        "& textarea": {
          overflowY: "auto !important",
        },
      }}
      value={props.value}
    />
  );
};

export const DataSourcesPanel = (
  props: DataSourcesPanelProps,
): React.ReactElement => {
  const [newSourceType, setNewSourceType] = React.useState<DataSourceType>(
    "timing-rfid-decoder",
  );
  const [selectedSourceId, setSelectedSourceId] = React.useState<
    string | undefined
  >(props.dataSources[0]?.id);
  const [sourceFetchErrors, setSourceFetchErrors] = React.useState<
    Record<string, SourceFetchError>
  >({});
  const [masterProfileDraftErrors, setMasterProfileDraftErrors] =
    React.useState<Record<string, string>>({});
  const [dorianCtcPreview, setDorianCtcPreview] = React.useState<
    MrScatsDataFilePreview | undefined
  >();
  const [dorianCtcPreviewError, setDorianCtcPreviewError] = React.useState<
    string | undefined
  >();
  const [dorianCtcPreviewLoadingFile, setDorianCtcPreviewLoadingFile] =
    React.useState<string | undefined>();

  React.useEffect(() => {
    if (props.dataSources.length === 0) {
      setSelectedSourceId(undefined);
      return;
    }

    if (
      !selectedSourceId ||
      !props.dataSources.find((source) => source.id === selectedSourceId)
    ) {
      setSelectedSourceId(props.dataSources[0]?.id);
    }
  }, [props.dataSources, selectedSourceId]);

  const selectedSource = props.dataSources.find(
    (source) => source.id === selectedSourceId,
  );

  const handleLoadApicalEvents = async (
    sourceId: TimeRecordSourceId,
  ): Promise<void> => {
    setSourceFetchErrors((current) => {
      const next = { ...current };
      delete next[sourceId];
      return next;
    });

    try {
      await props.onLoadApicalEvents(sourceId);
    } catch (error: unknown) {
      const formattedError = formatErrorForDisplay(error);
      console.error(
        `Failed to fetch Apical events for source ${sourceId}:\n${formattedError}`,
      );
      props.onDisplayError?.("System", error);
      setSourceFetchErrors((current) => ({
        ...current,
        [sourceId]: {
          details: formattedError,
          title: "Failed to fetch Apical events",
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

  const handleSelectRfidCsvFile = async (
    source: DataSourceConfig,
  ): Promise<void> => {
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

  const handleSelectDorianCtcSrtFile = async (
    source: DataSourceConfig,
  ): Promise<void> => {
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

  const handleSelectDorianCtcTrackConfigFile = async (
    source: DataSourceConfig,
  ): Promise<void> => {
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

  const handleSelectDurtFileMakerDatabase = async (
    source: DataSourceConfig,
  ): Promise<void> => {
    const databaseFilePath = await props.onSelectDurtFileMakerDatabase?.();
    if (!databaseFilePath) {
      return;
    }
    await props.onSaveSource(source.id, {
      durtFileMakerConfig: { ...source.durtFileMakerConfig, databaseFilePath },
    });
  };

  const handleSelectDurtFileMakerExtractor = async (
    source: DataSourceConfig,
  ): Promise<void> => {
    const extractorPath = await props.onSelectDurtFileMakerExtractor?.();
    if (!extractorPath) {
      return;
    }
    await props.onSaveSource(source.id, {
      durtFileMakerConfig: { ...source.durtFileMakerConfig, extractorPath },
    });
  };

  const handleSaveDorianCtcImportMode = (
    source: DataSourceConfig,
    importMode: DataImportMode,
  ): void => {
    void props.onSaveSource(source.id, {
      fileConfig: {
        ...source.fileConfig,
        importMode,
      },
    });
  };

  const handleSaveDorianCtcPlaceholderEntrants = (
    source: DataSourceConfig,
    importPlaceholderEntrantsForUnknownTransmitters: boolean,
  ): void => {
    void props.onSaveSource(source.id, {
      fileConfig: {
        ...source.fileConfig,
        importPlaceholderEntrantsForUnknownTransmitters,
      },
    });
  };

  const handlePreviewDorianCtcSrtFile = async (
    source: DataSourceConfig,
  ): Promise<void> => {
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
                      style={{ cursor: "pointer" }}
                    >
                      <td>{source.name}</td>
                      <td>{getDataSourceTypeLabel(source.type)}</td>
                      <td>{source.enabled ? "Yes" : "No"}</td>
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
              const isApicalApi =
                source.type === "api-apical-excel-file" ||
                source.type === "api-apical-recent-laps";
              const isApicalRecentLaps =
                source.type === "api-apical-recent-laps";
              const listedEvents = source.listedEvents || [];
              const selectedEventIds = source.apiConfig?.selectedEventIds || [];
              const selectedApicalEventId = selectedEventIds[0];
              const isMasterEntrants =
                source.type === "master-entrant-profiles";
              const isMrScatsData = source.type === "file-mr-scats-data";
              const isRfidTimingCsv = source.type === "file-rfid-timing-csv";
              const isDorianCtcSrt = source.type === "file-dorian-ctc-srt";
              const isDurtFileMaker = source.type === "file-durt-filemaker";
              const isRfidDecoder = source.type === "timing-rfid-decoder";
              const isRfidDecoderListening =
                source.rfidDecoderConfig?.isListening === true;
              const masterProfilesJson = JSON.stringify(
                source.masterEntrantConfig?.profiles || [],
                null,
                2,
              );
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
                      onCommit={(value) =>
                        props.onSaveSource(source.id, { name: value })
                      }
                    />
                  </label>
                  <FormControlLabel
                    control={
                      <Switch
                        slotProps={{
                          input: {
                            "aria-label": `Source Enabled ${source.id}`,
                          },
                        }}
                        checked={source.enabled}
                        onChange={(_event, checked: boolean): void => {
                          void props.onSaveSource(source.id, {
                            enabled: checked,
                          });
                        }}
                      />
                    }
                    label="Enabled"
                  />

                  {isRfidDecoder ? (
                    <>
                      <h4>RFID Decoder Listener</h4>
                      <div className="events-actions">
                        <AsyncButton
                          disabled={isRfidDecoderListening || !source.enabled}
                          loadingAriaLabel="Starting RFID decoder listener"
                          onAsyncClick={() =>
                            props.onStartRfidDecoderListener?.(source.id)
                          }
                          variant="contained"
                        >
                          Start
                        </AsyncButton>
                        <AsyncButton
                          disabled={!isRfidDecoderListening}
                          loadingAriaLabel="Stopping RFID decoder listener"
                          onAsyncClick={() =>
                            props.onStopRfidDecoderListener?.(source.id)
                          }
                          variant="outlined"
                        >
                          Stop
                        </AsyncButton>
                      </div>
                      <label>
                        Listen port
                        <DraftInput
                          ariaLabel={`RFID Decoder Listen Port ${source.id}`}
                          type="number"
                          value={
                            source.rfidDecoderConfig?.listenPort?.toString() ||
                            ""
                          }
                          onCommit={(value) =>
                            props.onSaveSource(source.id, {
                              rfidDecoderConfig: {
                                ...source.rfidDecoderConfig,
                                listenPort: Number(value) || undefined,
                              },
                            })
                          }
                        />
                      </label>
                      <label>
                        Raw TCP capture file
                        <DraftInput
                          ariaLabel={`RFID Decoder Capture File ${source.id}`}
                          value={
                            source.rfidDecoderConfig?.captureFilePath || ""
                          }
                          onCommit={(value) =>
                            props.onSaveSource(source.id, {
                              rfidDecoderConfig: {
                                ...source.rfidDecoderConfig,
                                captureFilePath: value || undefined,
                              },
                            })
                          }
                        />
                      </label>
                      <RfidDecoderOutputField
                        sourceId={source.id}
                        value={props.rfidDecoderOutput?.[source.id] || ""}
                      />
                      <p>
                        Every received TCP byte is appended to the capture file.
                        Assign this source to a session, then configure the
                        decoder to connect here and send one RFID Timing
                        crossing per line.
                      </p>
                    </>
                  ) : null}

                  {isMrScatsData ? (
                    <MrScatsDataSourcePanel
                      source={source}
                      onPreviewDataFile={props.onPreviewMrScatsDataFile}
                      onSaveSource={props.onSaveSource}
                      onSelectDataArchive={props.onSelectMrScatsDataArchive}
                      onSelectDataDirectory={props.onSelectMrScatsDataDirectory}
                    />
                  ) : isRfidTimingCsv ? (
                    <>
                      <h4>RFID Timing CSV File</h4>
                      <FileSelectionField
                        actions={[
                          {
                            label: "Select File",
                            onClick: () => handleSelectRfidCsvFile(source),
                          },
                        ]}
                        ariaLabel={`RFID Timing CSV File Path ${source.id}`}
                        label="File Path"
                        placeholder="No file selected"
                        value={source.fileConfig?.filePath || ""}
                      />
                    </>
                  ) : isDorianCtcSrt ? (
                    <>
                      <h4>Dorian CTC SRT / ERF File</h4>
                      <p>
                        Imports raw crossing times and transponder metadata
                        without creating competitors.
                      </p>
                      <FileSelectionField
                        actions={[
                          {
                            label: "Select File",
                            onClick: () => handleSelectDorianCtcSrtFile(source),
                          },
                        ]}
                        ariaLabel={`Dorian CTC SRT / ERF File Path ${source.id}`}
                        label="File Path"
                        placeholder="No file selected"
                        value={source.fileConfig?.filePath || ""}
                      />
                      <FileSelectionField
                        actions={[
                          {
                            label: "Select File",
                            onClick: () =>
                              handleSelectDorianCtcTrackConfigFile(source),
                          },
                        ]}
                        ariaLabel={`Dorian CTC TRACK.CFG File Path ${source.id}`}
                        label="TRACK.CFG File Path (optional)"
                        placeholder="No TRACK.CFG selected"
                        value={source.fileConfig?.trackConfigFilePath || ""}
                      />
                      <CtcTrackConfigDetails
                        onSave={(ctcTrackConfig) => {
                          const finishLineNumbers = ctcTrackConfig.networks
                            .flatMap((network) => network.lines)
                            .filter((line) =>
                              line.loops.some(
                                (loop) => loop.isLapCompletion === true,
                              ),
                            )
                            .map((line) => line.line);
                          void props.onSaveSource(source.id, {
                            fileConfig: {
                              ...source.fileConfig,
                              ctcTrackConfig,
                            },
                            finishLineNumbers: Array.from(
                              new Set(finishLineNumbers),
                            ).sort((left, right) => left - right),
                          });
                        }}
                        source={source}
                      />
                      <fieldset>
                        <legend>Data import mode</legend>
                        <label>
                          <input
                            checked={
                              (source.fileConfig?.importMode || "import") ===
                              "import"
                            }
                            name={`dorian-ctc-import-mode-${source.id}`}
                            onChange={() =>
                              handleSaveDorianCtcImportMode(source, "import")
                            }
                            type="radio"
                          />
                          Import — remove the selected session&apos;s existing
                          imported data before loading the file.
                        </label>
                        <label>
                          <input
                            checked={source.fileConfig?.importMode === "update"}
                            name={`dorian-ctc-import-mode-${source.id}`}
                            onChange={() =>
                              handleSaveDorianCtcImportMode(source, "update")
                            }
                            type="radio"
                          />
                          Update — retain existing data and update or add
                          matching file records where possible.
                        </label>
                      </fieldset>
                      <label>
                        <input
                          checked={
                            source.fileConfig
                              ?.importPlaceholderEntrantsForUnknownTransmitters ===
                            true
                          }
                          onChange={(event) =>
                            handleSaveDorianCtcPlaceholderEntrants(
                              source,
                              event.target.checked,
                            )
                          }
                          type="checkbox"
                        />
                        Import placeholder entrant for unknown transmitters
                      </label>
                      <div className="events-actions">
                        <AsyncButton
                          type="button"
                          disabled={
                            !source.fileConfig?.filePath ||
                            !props.onPreviewDorianCtcSrtFile
                          }
                          loadingAriaLabel="Loading Dorian CTC preview"
                          onAsyncClick={() =>
                            handlePreviewDorianCtcSrtFile(source)
                          }
                          variant="outlined"
                        >
                          Preview
                        </AsyncButton>
                        {props.onLoadDorianCtcSrtFile ? (
                          <AsyncButton
                            disabled={!source.fileConfig?.filePath}
                            loadingAriaLabel="Importing Dorian CTC data"
                            onAsyncClick={() =>
                              props.onLoadDorianCtcSrtFile?.(source.id)
                            }
                            variant="contained"
                          >
                            Import into selected session
                          </AsyncButton>
                        ) : null}
                      </div>
                    </>
                  ) : isDurtFileMaker ? (
                    <>
                      <h4>DURT FileMaker Database</h4>
                      <p>
                        Imports entrant and crossing tables from a FileMaker
                        .fp7 or .fmp12 file using the bundled fmp2json
                        extractor.
                      </p>
                      <FileSelectionField
                        actions={[
                          {
                            label: "Select Database",
                            onClick: () =>
                              handleSelectDurtFileMakerDatabase(source),
                          },
                        ]}
                        ariaLabel={`DURT FileMaker Database Path ${source.id}`}
                        label="Database file"
                        placeholder="No database selected"
                        value={
                          source.durtFileMakerConfig?.databaseFilePath || ""
                        }
                      />
                      <label>
                        fmp2json executable (bundled)
                        <details className="inline-info">
                          <summary
                            aria-label="About fmp2json"
                            title="About the required fmp2json extractor"
                          >
                            ⓘ
                          </summary>
                          <p>
                            FileMaker databases are proprietary binary files.
                            RaceSweet uses fmp2json to read their tables safely,
                            then converts DURT entrants and crossings into the
                            RaceSweet ledger.
                          </p>
                          <p>
                            RaceSweet packages fmp2json with the Windows app, so
                            normal users do not need a compiler or separate
                            installation. Developers can create that package
                            with npm run build:fmptools:win32; the build runs
                            entirely in Docker.
                          </p>
                          <p>
                            The bundled binary is built from{" "}
                            <a
                              href="https://github.com/evanmiller/fmptools/releases"
                              onClick={(event) => {
                                event.preventDefault();
                                void props.onOpenExternalUrl?.(
                                  "https://github.com/evanmiller/fmptools/releases",
                                );
                              }}
                            >
                              fmptools releases
                            </a>
                            . A custom executable can be selected below only
                            when troubleshooting or testing a different build.
                          </p>
                        </details>
                        <FileSelectionField
                          actions={[
                            {
                              label: "Select Extractor",
                              onClick: () =>
                                handleSelectDurtFileMakerExtractor(source),
                            },
                          ]}
                          ariaLabel={`DURT FileMaker Extractor Path ${source.id}`}
                          label="fmp2json executable (bundled)"
                          placeholder="Bundled extractor will be used"
                          value={
                            source.durtFileMakerConfig?.extractorPath || ""
                          }
                        />
                      </label>
                      <fieldset>
                        <legend>Data import mode</legend>
                        <label>
                          <input
                            checked={
                              (source.durtFileMakerConfig?.importMode ||
                                "import") === "import"
                            }
                            name={`durt-import-mode-${source.id}`}
                            onChange={() =>
                              props.onSaveSource(source.id, {
                                durtFileMakerConfig: {
                                  ...source.durtFileMakerConfig,
                                  importMode: "import",
                                },
                              })
                            }
                            type="radio"
                          />
                          Import — replace imported state for the selected
                          session.
                        </label>
                        <label>
                          <input
                            checked={
                              source.durtFileMakerConfig?.importMode ===
                              "update"
                            }
                            name={`durt-import-mode-${source.id}`}
                            onChange={() =>
                              props.onSaveSource(source.id, {
                                durtFileMakerConfig: {
                                  ...source.durtFileMakerConfig,
                                  importMode: "update",
                                },
                              })
                            }
                            type="radio"
                          />
                          Update — merge imported records into the selected
                          session.
                        </label>
                      </fieldset>
                      <div className="events-actions"></div>
                    </>
                  ) : isApicalApi && source.apiConfig ? (
                    <>
                      <h4>Apical Endpoint</h4>
                      <label>
                        Base URL
                        <DraftInput
                          ariaLabel={`Apical Base URL ${source.id}`}
                          value={source.apiConfig.baseUrl}
                          onCommit={(value) =>
                            props.onSaveSource(source.id, {
                              apiConfig: {
                                ...source.apiConfig!,
                                baseUrl: value,
                              },
                            })
                          }
                        />
                      </label>
                      <label>
                        Auth Header Name
                        <DraftInput
                          ariaLabel={`Apical Auth Header Name ${source.id}`}
                          value={source.apiConfig.authHeaderName}
                          onCommit={(value) =>
                            props.onSaveSource(source.id, {
                              apiConfig: {
                                ...source.apiConfig!,
                                authHeaderName: value,
                              },
                            })
                          }
                        />
                      </label>
                      <label>
                        Auth Header Value
                        <DraftInput
                          ariaLabel={`Apical Auth Header Value ${source.id}`}
                          value={source.apiConfig.authHeaderValue}
                          onCommit={(value) =>
                            props.onSaveSource(source.id, {
                              apiConfig: {
                                ...source.apiConfig!,
                                authHeaderValue: value,
                              },
                            })
                          }
                        />
                      </label>
                      <label>
                        Company Id
                        <DraftInput
                          ariaLabel={`Apical Company Id ${source.id}`}
                          type="number"
                          value={source.apiConfig.companyId.toString()}
                          onCommit={(value) =>
                            props.onSaveSource(source.id, {
                              apiConfig: {
                                ...source.apiConfig!,
                                companyId: Number(value) || 2,
                              },
                            })
                          }
                        />
                      </label>
                      <label>
                        Poll Interval (seconds)
                        <DraftInput
                          ariaLabel={`Apical Poll Interval ${source.id}`}
                          type="number"
                          value={source.apiConfig.pollIntervalSeconds.toString()}
                          onCommit={(value) =>
                            props.onSaveSource(source.id, {
                              apiConfig: {
                                ...source.apiConfig!,
                                pollIntervalSeconds: Number(value) || 30,
                              },
                            })
                          }
                        />
                      </label>
                      <label>
                        HTTP Timeout (seconds)
                        <DraftInput
                          ariaLabel={`Apical Http Timeout ${source.id}`}
                          type="number"
                          value={source.apiConfig.httpTimeoutSeconds.toString()}
                          onCommit={(value) =>
                            props.onSaveSource(source.id, {
                              apiConfig: {
                                ...source.apiConfig!,
                                httpTimeoutSeconds: Number(value) || 30,
                              },
                            })
                          }
                        />
                      </label>
                      <FormControlLabel
                        control={
                          <Switch
                            slotProps={{
                              input: {
                                "aria-label": `Apical Live ${source.id}`,
                              },
                            }}
                            checked={source.apiConfig.live}
                            onChange={(_event, checked: boolean): void => {
                              const changedAt: string =
                                new Date().toISOString();
                              void props.onSaveSource(source.id, {
                                apiConfig: {
                                  ...source.apiConfig!,
                                  live: checked,
                                  pollingResumedAt: checked
                                    ? changedAt
                                    : source.apiConfig!.pollingResumedAt,
                                  pollingStopReason: checked
                                    ? undefined
                                    : "Polling was stopped manually.",
                                  pollingStoppedAt: checked
                                    ? undefined
                                    : changedAt,
                                },
                              });
                            }}
                          />
                        }
                        label="Live polling"
                      />
                      <div className="events-actions">
                        <AsyncButton
                          loadingAriaLabel="Fetching Apical events"
                          onAsyncClick={() => handleLoadApicalEvents(source.id)}
                          variant="outlined"
                        >
                          Fetch Apical Events
                        </AsyncButton>
                        <AsyncButton
                          disabled={!selectedApicalEventId}
                          loadingAriaLabel={
                            isApicalRecentLaps
                              ? "Reloading Apical data"
                              : "Importing Apical event"
                          }
                          onAsyncClick={() =>
                            props.onFetchApicalDataNow(source.id)
                          }
                          variant="contained"
                        >
                          {isApicalRecentLaps
                            ? "Reload now and resume polling"
                            : "Import selected event"}
                        </AsyncButton>
                        {!isApicalRecentLaps ? (
                          <AsyncButton
                            disabled={!source.apicalDataFilePath}
                            loadingAriaLabel="Loading linked Apical sessions"
                            onAsyncClick={() =>
                              props.onReprocessApicalData(source.id)
                            }
                            variant="outlined"
                          >
                            Re-load linked sessions
                          </AsyncButton>
                        ) : null}
                      </div>
                      <p>
                        Data last retrieved:{" "}
                        {source.dataLastRetrieved || "Never"}
                      </p>
                      {isApicalRecentLaps &&
                      source.apiConfig.pollingStopReason ? (
                          <p role="status">
                          Polling stopped
                            {source.apiConfig.pollingStoppedAt
                              ? ` at ${source.apiConfig.pollingStoppedAt}`
                              : ""}
                          : {source.apiConfig.pollingStopReason}
                          </p>
                        ) : null}
                      {source.apicalDataFilePath ? (
                        <p>
                          <a
                            href="#"
                            onClick={(event) => {
                              event.preventDefault();
                              void handleOpenLocalFile(
                                source.apicalDataFilePath!,
                              );
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
                          <TextField
                            fullWidth
                            label="Apical Event"
                            select
                            slotProps={{
                              htmlInput: {
                                "aria-label": `Apical Selected Event ${source.id}`,
                              },
                            }}
                            value={selectedApicalEventId || ""}
                            onChange={(event): void => {
                              const eventId: number = Number(
                                event.target.value,
                              );
                              if (!eventId) {
                                return;
                              }
                              void props.onSaveSource(source.id, {
                                apiConfig: {
                                  ...source.apiConfig!,
                                  apicalEventId: eventId,
                                  selectedEventIds: [eventId],
                                },
                              });
                            }}
                          >
                            <MenuItem value="">Select Apical event</MenuItem>
                            {listedEvents.map((eventItem) => (
                              <MenuItem key={eventItem.id} value={eventItem.id}>
                                {eventItem.name} ({eventItem.id})
                              </MenuItem>
                            ))}
                          </TextField>
                          <select
                            aria-label={`Apical Selected Event ${source.id}`}
                            hidden
                            value={selectedApicalEventId || ""}
                            onChange={(
                              event: React.ChangeEvent<HTMLSelectElement>,
                            ): void => {
                              const eventId: number = Number(
                                event.target.value,
                              );
                              if (!eventId) {
                                return;
                              }
                              void props.onSaveSource(source.id, {
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
                          {!isApicalRecentLaps ? (
                            <AsyncButton
                              disabled={
                                !selectedApicalEventId ||
                                !props.onCreateApicalSourceFrom
                              }
                              loadingAriaLabel="Creating Apical data source"
                              onAsyncClick={() => {
                                if (selectedApicalEventId) {
                                  return props.onCreateApicalSourceFrom?.(
                                    source.id,
                                    selectedApicalEventId,
                                  );
                                }
                              }}
                              variant="contained"
                            >
                              Create new from
                            </AsyncButton>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  ) : isMasterEntrants ? (
                    <>
                      <h4>Master Entrant Profiles</h4>
                      <p>
                        Used as fallback when imported timing data does not
                        contain full entrant profile fields.
                      </p>
                      <label>
                        Profiles JSON
                        <textarea
                          aria-label={`Master Entrant Profiles ${source.id}`}
                          defaultValue={masterProfilesJson}
                          onBlur={(event) => {
                            try {
                              const parsed = JSON.parse(event.target.value);
                              if (!Array.isArray(parsed)) {
                                throw new Error(
                                  "Profiles JSON must be an array.",
                                );
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
                              const message =
                                error instanceof Error
                                  ? error.message
                                  : String(error);
                              props.onDisplayError?.("System", error);
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
                          <p>
                            Failed to parse profiles:{" "}
                            {masterProfileDraftErrors[source.id]}
                          </p>
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
                    <p>
                      Placeholder only; runtime integration not implemented for
                      this source type yet.
                    </p>
                  )}

                  <div className="events-actions">
                    <AsyncButton
                      color="error"
                      loadingAriaLabel="Deleting data source"
                      onAsyncClick={() => props.onDeleteSource(source.id)}
                      variant="outlined"
                    >
                      Delete Source
                    </AsyncButton>
                  </div>
                </>
              );
            })()
          ) : (
            <p>Select a data source from the table to edit details.</p>
          )}
        </section>
      </div>
      {dorianCtcPreview ||
      dorianCtcPreviewError ||
      dorianCtcPreviewLoadingFile ? (
          <div className="warning-modal-backdrop">
            <section
              className="warning-modal reload-summary-dialog mr-scats-preview-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="mr-scats-preview-title"
            >
              <div className="warning-modal-heading">
                <h2 id="mr-scats-preview-title">
                  {dorianCtcPreview?.fileName ||
                  dorianCtcPreviewLoadingFile ||
                  "CTC file preview"}
                </h2>
              </div>
              <div className="mr-scats-preview-content">
                {dorianCtcPreviewLoadingFile ? <p>Loading preview...</p> : null}
                {dorianCtcPreviewError ? (
                  <div className="inline-error" role="alert">
                    <pre>{dorianCtcPreviewError}</pre>
                  </div>
                ) : null}
                {dorianCtcPreview ? (
                  <>
                    <p>
                      {dorianCtcPreview.parser.toUpperCase()} preview:{" "}
                      {dorianCtcPreview.displayedRowCount}
                      {dorianCtcPreview.recordCount === undefined
                        ? " rows"
                        : ` of ${dorianCtcPreview.recordCount} records`}
                    </p>
                    {dorianCtcPreview.warnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                    <table
                      aria-label={`MR-SCATS File Preview ${dorianCtcPreview.fileName}`}
                    >
                      <thead>
                        <tr>
                          {dorianCtcPreview.columns.map((column) => (
                            <th key={column}>{column}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dorianCtcPreview.rows.map((row, rowIndex) => (
                          <tr key={`${dorianCtcPreview.fileName}-${rowIndex}`}>
                            {dorianCtcPreview.columns.map((column) => (
                              <td key={column}>{row[column]}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : null}
              </div>
              <div className="events-actions warning-modal-actions">
                <button
                  type="button"
                  onClick={() => {
                    setDorianCtcPreview(undefined);
                    setDorianCtcPreviewError(undefined);
                    setDorianCtcPreviewLoadingFile(undefined);
                  }}
                >
                Close
                </button>
              </div>
            </section>
          </div>
        ) : null}
    </section>
  );
};
