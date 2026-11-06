import {
  Accordion, AccordionDetails, AccordionSummary, Button, Checkbox, FormControlLabel, MenuItem,
  Radio, RadioGroup, Switch, TextField,
} from "@mui/material";
import React from "react";
import { formatErrorForDisplay } from "../../app/stackTrace.js";
import {
  type DataImportMode,
  type DataSourceConfig,
  type DataSourceType,
  getDataSourceTypeLabel,
} from "../../app/systemConfig.js";
import type { CtcTrackConfig, CtcTrackConfigLine, CtcTrackConfigLoop, CtcTrackConfigNetwork } from "../../model/ctcTrackConfig.js";
import { TimeRecordSourceId } from "../../model/types.js";
import type {
  MrScatsDataFileInventory,
  MrScatsDataFileSummary,
} from "../../parsers/mrScats/fileInventory.js";
import type { MrScatsDataFilePreview } from "../../parsers/mrScats/filePreview.js";
import { AsyncButton } from "../asyncButton.js";
import { AdminPageLayout, ResponsiveDataList, type ResponsiveDataRow, ResponsiveDialog } from '../admin/adminPrimitives.js';
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
  const [draft, setDraft] = React.useState<string>(props.value);
  const [error, setError] = React.useState<string>('');

  React.useEffect(() => {
    setDraft(props.value);
  }, [props.value]);

  const commit = (): void => {
    if (draft !== props.value) {
      setError('');
      Promise.resolve().then((): void | Promise<void> => props.onCommit(draft))
        .catch((failure: Error): void => setError(failure.message));
    }
  };

  return (
    <TextField
      label={props.ariaLabel.replace(/ [^ ]+$/u, '')}
      error={Boolean(error)} helperText={error}
      slotProps={{ htmlInput: { "aria-label": props.ariaLabel } }}
      onBlur={commit}
      onChange={(event) => setDraft(event.target.value)}
      type={props.type || "text"}
      value={draft}
    />
  );
};

const ImportModeControls = (props: {
  name: string;
  onChange: (mode: DataImportMode) => void | Promise<void>;
  value: DataImportMode;
}): React.ReactElement => <RadioGroup aria-label="Data import mode" name={props.name} value={props.value}
  onChange={(_event: React.ChangeEvent<HTMLInputElement>, value: string): void => {
    void props.onChange(value as DataImportMode);
  }}>
  <FormControlLabel control={<Radio />} label="Import — replace imported state for the selected session." value="import" />
  <FormControlLabel control={<Radio />} label="Update — retain existing data and update or add matching file records." value="update" />
</RadioGroup>;

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

const CtcTrackConfigDetails = ({ onSave, source }: {
  onSave: (trackConfig: CtcTrackConfig) => void;
  source: DataSourceConfig;
}): React.ReactElement | null => {
  const trackConfig: CtcTrackConfig | undefined = source.fileConfig?.ctcTrackConfig;
  if (!trackConfig) return source.fileConfig?.trackConfigFilePath
    ? <p>No TRACK.CFG metadata has been loaded for this source yet. Re-select the TRACK.CFG file or import the CTC file to parse it.</p>
    : null;
  const setLapFinish = (networkIndex: number, lineIndex: number, loopIndex: number, checked: boolean): void => {
    onSave({ ...trackConfig, networks: trackConfig.networks.map((network: CtcTrackConfigNetwork, ni: number): CtcTrackConfigNetwork =>
      ni !== networkIndex ? network : { ...network, lines: network.lines.map((line: CtcTrackConfigLine, li: number): CtcTrackConfigLine =>
        li !== lineIndex ? line : { ...line, loops: line.loops.map((loop: CtcTrackConfigLoop, lpi: number): CtcTrackConfigLoop =>
          lpi !== loopIndex ? loop : { ...loop, isLapCompletion: checked }) }) }) });
  };
  const rows: ResponsiveDataRow[] = trackConfig.networks.flatMap((network: CtcTrackConfigNetwork, ni: number): ResponsiveDataRow[] =>
    network.lines.flatMap((line: CtcTrackConfigLine, li: number): ResponsiveDataRow[] =>
      line.loops.map((loop: CtcTrackConfigLoop, lpi: number): ResponsiveDataRow => ({
        cells: [
          { label: 'Network', value: network.name }, { label: 'Line', value: line.line },
          { label: 'Line name', value: line.name }, { label: 'Loop', value: loop.loopNumber },
          { label: 'Site address', value: loop.siteAddress }, { label: 'Card', value: loop.card },
          { label: 'Com port', value: loop.comPort },
          { label: 'Lap/finish', value: <FormControlLabel control={<Checkbox
            slotProps={{ input: { 'aria-label': `CTC ${network.name} line ${line.line} loop ${loop.loopNumber} lap finish` } }}
            checked={loop.isLapCompletion === true}
            onChange={(_event: React.ChangeEvent<HTMLInputElement>, checked: boolean): void => setLapFinish(ni, li, lpi, checked)} />}
          label="Completes lap" /> },
        ], id: `${ni}-${li}-${lpi}`,
      }))));
  const lineCount: number = countCtcTrackConfigLines(trackConfig);
  const loopCount: number = countCtcTrackConfigLoops(trackConfig);
  return <Accordion defaultExpanded>
    <AccordionSummary>TRACK.CFG metadata: {trackConfig.networks.length} network{trackConfig.networks.length === 1 ? '' : 's'},
      {' '}{lineCount} line{lineCount === 1 ? '' : 's'}, {loopCount} loop{loopCount === 1 ? '' : 's'}</AccordionSummary>
    <AccordionDetails><ResponsiveDataList label={`Dorian CTC TRACK.CFG Metadata ${source.id}`} rows={rows} /></AccordionDetails>
  </Accordion>;
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
      <AdminPageLayout className="events-layout two-panel" selectedId={selectedSourceId}
        listLabel="data sources" detailLabel="source details">
        <section className="events-panel">
          <DataSourceTypesPanel
            newSourceType={newSourceType}
            onChangeNewSourceType={setNewSourceType}
            onCreateSource={props.onCreateSource}
          />
          {props.dataSources.length === 0 ? (
            <p>No data sources configured yet.</p>
          ) : (
            <ResponsiveDataList label="Configured data sources" rows={props.dataSources.map((source: DataSourceConfig) => ({
              cells: [
                { label: 'Name', value: <Button aria-pressed={source.id === selectedSourceId} data-source-id={source.id}
                  onClick={(): void => setSelectedSourceId(source.id)} sx={{ minHeight: 48, overflowWrap: 'anywhere' }}>{source.name}</Button> },
                { label: 'Type', value: getDataSourceTypeLabel(source.type) },
                { label: 'Enabled', value: source.enabled ? 'Yes' : 'No' },
              ], id: source.id,
            }))} />
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
                  <div className="admin-source-field">
                    Source Name
                    <DraftInput
                      ariaLabel={`Source Name ${source.id}`}
                      value={source.name}
                      onCommit={(value) =>
                        props.onSaveSource(source.id, { name: value })
                      }
                    />
                  </div>
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
                      <div className="admin-source-field">
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
                      </div>
                      <div className="admin-source-field">
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
                      </div>
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
                      <ImportModeControls name={`dorian-ctc-import-mode-${source.id}`}
                        onChange={(mode: DataImportMode): void => handleSaveDorianCtcImportMode(source, mode)}
                        value={source.fileConfig?.importMode || 'import'} />
                      <FormControlLabel control={<Checkbox
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
                      />} label="Import placeholder entrant for unknown transmitters" />
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
                      <div className="admin-source-field">
                        fmp2json executable (bundled)
                        <Accordion className="inline-info">
                          <AccordionSummary
                            aria-label="About fmp2json"
                            title="About the required fmp2json extractor"
                          >
                            ⓘ
                          </AccordionSummary>
                          <AccordionDetails>
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
                          </AccordionDetails>
                        </Accordion>
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
                      </div>
                      <ImportModeControls name={`durt-import-mode-${source.id}`}
                        onChange={(mode: DataImportMode): void => {
                          void props.onSaveSource(source.id, { durtFileMakerConfig: { ...source.durtFileMakerConfig, importMode: mode } });
                        }} value={source.durtFileMakerConfig?.importMode || 'import'} />
                      <div className="events-actions"></div>
                    </>
                  ) : isApicalApi && source.apiConfig ? (
                    <>
                      <h4>Apical Endpoint</h4>
                      <div className="admin-source-field">
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
                      </div>
                      <div className="admin-source-field">
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
                      </div>
                      <div className="admin-source-field">
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
                      </div>
                      <div className="admin-source-field">
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
                      </div>
                      <div className="admin-source-field">
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
                      </div>
                      <div className="admin-source-field">
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
                      </div>
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
                          <Button
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
                          </Button>
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
                              select: {
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
                      <div className="admin-source-field">
                        Profiles JSON
                        <TextField multiline minRows={6} fullWidth label="Profiles JSON"
                          slotProps={{ htmlInput: { "aria-label": `Master Entrant Profiles ${source.id}` } }}
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
                      </div>
                      {masterProfileDraftErrors[source.id] ? (
                        <div className="inline-error" role="alert">
                          <p>
                            Failed to parse profiles:{" "}
                            {masterProfileDraftErrors[source.id]}
                          </p>
                          <Button
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
                          </Button>
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
      </AdminPageLayout>
      {dorianCtcPreview ||
      dorianCtcPreviewError ||
      dorianCtcPreviewLoadingFile ? (
          <ResponsiveDialog open disablePortal aria-labelledby="mr-scats-preview-title" maxWidth="xl" fullWidth
            slotProps={{ paper: { className: 'mr-scats-preview-dialog' } }}>
            <section
              className="warning-modal reload-summary-dialog mr-scats-preview-dialog"
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
                <Button
                  type="button"
                  onClick={() => {
                    setDorianCtcPreview(undefined);
                    setDorianCtcPreviewError(undefined);
                    setDorianCtcPreviewLoadingFile(undefined);
                  }}
                >
                Close
                </Button>
              </div>
            </section>
          </ResponsiveDialog>
        ) : null}
    </section>
  );
};
