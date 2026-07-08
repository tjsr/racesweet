import React from 'react';
import { formatErrorForDisplay } from '../../app/stackTrace.js';
import { type DataSourceConfig, type DataSourceType, getDataSourceTypeLabel } from '../../app/systemConfig.js';
import { TimeRecordSourceId } from '../../model/types.js';
import type { MrScatsDataFileInventory, MrScatsDataFileSummary } from '../../parsers/mrScats/fileInventory.js';
import type { MrScatsDataFilePreview } from '../../parsers/mrScats/filePreview.js';
import { DataSourceTypesPanel } from './dataSourceTypes.js';
import type { InlineLoadingProgress } from './InlineLoadingIndicator.js';
import { MrScatsDataSourcePanel } from './mrScatsDataSourcePanel.js';

interface DataSourcesPanelProps {
  dataSources: DataSourceConfig[];
  onCreateSource: (type: DataSourceType) => void | Promise<void>;
  onDeleteSource: (sourceId: TimeRecordSourceId) => void | Promise<void>;
  onDisplayError?: (source: string, error: unknown) => void;
  onFetchApicalDataNow: (sourceId: TimeRecordSourceId) => void | Promise<void>;
  onLoadApicalEvents: (sourceId: TimeRecordSourceId) => void | Promise<void>;
  onLoadMrScatsEvent?: (sourceId: TimeRecordSourceId, onProgress?: (progress: InlineLoadingProgress) => void | Promise<void>) => void | Promise<void>;
  onOpenLocalFile?: (filePath: string) => void | Promise<void>;
  onPreviewMrScatsDataFile?: (sourceId: TimeRecordSourceId, file: MrScatsDataFileSummary) => Promise<MrScatsDataFilePreview>;
  onReprocessApicalData: (sourceId: TimeRecordSourceId) => void | Promise<void>;
  onSaveSource: (sourceId: TimeRecordSourceId, changes: Partial<DataSourceConfig>) => void | Promise<void>;
  onSelectMrScatsDataArchive?: () => Promise<MrScatsDataFileInventory | undefined>;
  onSelectMrScatsDataDirectory?: () => Promise<MrScatsDataFileInventory | undefined>;
  onSelectLocalFile?: () => Promise<string | undefined>;
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

export const DataSourcesPanel = (props: DataSourcesPanelProps): React.ReactElement => {
  const [newSourceType, setNewSourceType] = React.useState<DataSourceType>('timing-rfid-decoder');
  const [selectedSourceId, setSelectedSourceId] = React.useState<string | undefined>(props.dataSources[0]?.id);
  const [sourceFetchErrors, setSourceFetchErrors] = React.useState<Record<string, SourceFetchError>>({});
  const [masterProfileDraftErrors, setMasterProfileDraftErrors] = React.useState<Record<string, string>>({});

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
    </section>
  );
};
