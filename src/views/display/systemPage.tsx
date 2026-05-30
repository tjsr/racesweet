import React from 'react';

import {
  getDataSourceTypeLabel,
  type DataSourceConfig,
  type DataSourceType,
  type SystemConfiguration,
} from '../../app/systemConfig.js';
import { getRuntimeVersions } from '../../app/versionInfo.js';

interface SystemPageProps {
  config: SystemConfiguration;
  onCreateSource: (type: DataSourceType) => void | Promise<void>;
  onDeleteSource: (sourceId: string) => void | Promise<void>;
  onLoadApicalEvents: (sourceId: string) => void | Promise<void>;
  onSaveApicalSource: (sourceId: string, changes: Partial<DataSourceConfig>) => void | Promise<void>;
}

const sourceTypeOptions: DataSourceType[] = [
  'timing-rfid-decoder',
  'timing-mylaps-decoder',
  'timing-dorian-data1-supernode',
  'file-rfid-timing-csv',
  'file-apical-data-file',
  'file-racesweet-ledger',
  'api-aws-sqs',
  'api-http-request',
  'api-apical-data-file',
  'master-entrant-profiles',
];

export const SystemPage = (props: SystemPageProps): React.ReactElement => {
  const [newSourceType, setNewSourceType] = React.useState<DataSourceType>(sourceTypeOptions[0]);
  const [selectedSourceId, setSelectedSourceId] = React.useState<string | undefined>(props.config.dataSources[0]?.id);
  const [sourceFetchErrors, setSourceFetchErrors] = React.useState<Record<string, string>>({});
  const [masterProfileDraftErrors, setMasterProfileDraftErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (props.config.dataSources.length === 0) {
      setSelectedSourceId(undefined);
      return;
    }

    if (!selectedSourceId || !props.config.dataSources.find((source) => source.id === selectedSourceId)) {
      setSelectedSourceId(props.config.dataSources[0]?.id);
    }
  }, [props.config.dataSources, selectedSourceId]);

  const runtimeVersions = getRuntimeVersions();
  const selectedSource = props.config.dataSources.find((source) => source.id === selectedSourceId);

  const handleLoadApicalEvents = async (sourceId: string): Promise<void> => {
    setSourceFetchErrors((current) => {
      const next = { ...current };
      delete next[sourceId];
      return next;
    });

    try {
      await props.onLoadApicalEvents(sourceId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      const detailedMessage = stack ? `${message}\n${stack}` : message;
      console.error('Error loading Apical events for source', sourceId, message, error);
      setSourceFetchErrors((current) => ({
        ...current,
        [sourceId]: detailedMessage,
      }));
    }
  };

  return (
    <section className="events-screen">
      <h1>System</h1>
      <p>Configure global data-source definitions and source connection settings.</p>

      <section className="events-panel">
        <h2>Runtime Information</h2>
        <ul>
          <li>Electron: {runtimeVersions.electron}</li>
          <li>Node.js: {runtimeVersions.node}</li>
          <li>Chromium: {runtimeVersions.chromium}</li>
        </ul>
      </section>

      <section className="events-panel">
        <h2>Data Source Types</h2>
        <div className="events-actions">
          <label>
            Data Source Type
            <select
              aria-label="New Data Source Type"
              value={newSourceType}
              onChange={(event) => setNewSourceType(event.target.value as DataSourceType)}
            >
              {sourceTypeOptions.map((type) => (
                <option key={type} value={type}>{getDataSourceTypeLabel(type)}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => props.onCreateSource(newSourceType)}>
            Add Data Source
          </button>
        </div>
      </section>

      <section className="events-panel">
        <h2>Configured Data Sources</h2>
        <div className="events-layout two-panel">
          <section className="events-panel">
            {props.config.dataSources.length === 0 ? (
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
                  {props.config.dataSources.map((source) => {
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
                const isApicalApi = source.type === 'api-apical-data-file';
                const listedEvents = source.listedEvents || [];
                const selectedEventIds = source.apiConfig?.selectedEventIds || [];
                const selectedApicalEventId = selectedEventIds[0] || source.apiConfig?.apicalEventId;
                const isMasterEntrants = source.type === 'master-entrant-profiles';
                const masterProfilesJson = JSON.stringify(source.masterEntrantConfig?.profiles || [], null, 2);

                return (
                  <>
                    <h3>{source.name}</h3>
                    <p>{getDataSourceTypeLabel(source.type)}</p>
                    <label>
                      Source Name
                      <input
                        aria-label={`Source Name ${source.id}`}
                        type="text"
                        value={source.name}
                        onChange={(event) => props.onSaveApicalSource(source.id, { name: event.target.value })}
                      />
                    </label>
                    <label>
                      Enabled
                      <input
                        aria-label={`Source Enabled ${source.id}`}
                        type="checkbox"
                        checked={source.enabled}
                        onChange={(event) => props.onSaveApicalSource(source.id, { enabled: event.target.checked })}
                      />
                    </label>

                    {isApicalApi && source.apiConfig ? (
                      <>
                        <h4>Apical Endpoint</h4>
                        <label>
                          Base URL
                          <input
                            aria-label={`Apical Base URL ${source.id}`}
                            type="text"
                            value={source.apiConfig.baseUrl}
                            onChange={(event) => props.onSaveApicalSource(source.id, {
                              apiConfig: {
                                ...source.apiConfig!,
                                baseUrl: event.target.value,
                              },
                            })}
                          />
                        </label>
                        <label>
                          Auth Header Name
                          <input
                            aria-label={`Apical Auth Header Name ${source.id}`}
                            type="text"
                            value={source.apiConfig.authHeaderName}
                            onChange={(event) => props.onSaveApicalSource(source.id, {
                              apiConfig: {
                                ...source.apiConfig!,
                                authHeaderName: event.target.value,
                              },
                            })}
                          />
                        </label>
                        <label>
                          Auth Header Value
                          <input
                            aria-label={`Apical Auth Header Value ${source.id}`}
                            type="text"
                            value={source.apiConfig.authHeaderValue}
                            onChange={(event) => props.onSaveApicalSource(source.id, {
                              apiConfig: {
                                ...source.apiConfig!,
                                authHeaderValue: event.target.value,
                              },
                            })}
                          />
                        </label>
                        <label>
                          Company Id
                          <input
                            aria-label={`Apical Company Id ${source.id}`}
                            type="number"
                            value={source.apiConfig.companyId}
                            onChange={(event) => props.onSaveApicalSource(source.id, {
                              apiConfig: {
                                ...source.apiConfig!,
                                companyId: Number(event.target.value) || 2,
                              },
                            })}
                          />
                        </label>
                        <label>
                          Apical Event Id
                          <input
                            aria-label={`Apical Event Id ${source.id}`}
                            type="number"
                            value={source.apiConfig.apicalEventId || ''}
                            onChange={(event) => props.onSaveApicalSource(source.id, {
                              apiConfig: {
                                ...source.apiConfig!,
                                apicalEventId: Number(event.target.value) || undefined,
                              },
                            })}
                          />
                        </label>
                        <label>
                          Poll Interval (seconds)
                          <input
                            aria-label={`Apical Poll Interval ${source.id}`}
                            type="number"
                            value={source.apiConfig.pollIntervalSeconds}
                            onChange={(event) => props.onSaveApicalSource(source.id, {
                              apiConfig: {
                                ...source.apiConfig!,
                                pollIntervalSeconds: Number(event.target.value) || 30,
                              },
                            })}
                          />
                        </label>
                        <label>
                          HTTP Timeout (seconds)
                          <input
                            aria-label={`Apical Http Timeout ${source.id}`}
                            type="number"
                            value={source.apiConfig.httpTimeoutSeconds}
                            onChange={(event) => props.onSaveApicalSource(source.id, {
                              apiConfig: {
                                ...source.apiConfig!,
                                httpTimeoutSeconds: Number(event.target.value) || 30,
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
                            onChange={(event) => props.onSaveApicalSource(source.id, {
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
                        {sourceFetchErrors[source.id] ? (
                          <p className="inline-error" role="alert">
                            Failed to fetch Apical events: {sourceFetchErrors[source.id]}
                          </p>
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
                                  props.onSaveApicalSource(source.id, {
                                    apiConfig: {
                                      ...source.apiConfig!,
                                      apicalEventId: eventId,
                                      selectedEventIds: [eventId],
                                    },
                                  });
                                }}
                              >
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
                                props.onSaveApicalSource(source.id, {
                                  masterEntrantConfig: {
                                    profiles: parsed,
                                  },
                                });
                              } catch (error: unknown) {
                                const message = error instanceof Error ? error.message : String(error);
                                setMasterProfileDraftErrors((current) => ({
                                  ...current,
                                  [source.id]: message,
                                }));
                              }
                            }}
                          />
                        </label>
                        {masterProfileDraftErrors[source.id] ? (
                          <p className="inline-error" role="alert">
                            Failed to parse profiles: {masterProfileDraftErrors[source.id]}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p>Placeholder only; runtime integration not implemented for this source type yet.</p>
                    )}

                    <div className="events-actions">
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
    </section>
  );
};
