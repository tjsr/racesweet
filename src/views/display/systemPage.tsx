import React from 'react';

import {
  getDataSourceTypeLabel,
  type DataSourceConfig,
  type DataSourceType,
  type SystemConfiguration,
} from '../../app/systemConfig.js';
import { getSessionsForEvent } from '../../app/eventCatalog.js';
import type { EventCatalogState } from '../../app/eventCatalog.js';

interface SystemPageProps {
  catalog: EventCatalogState;
  config: SystemConfiguration;
  onApplySessionSources: (eventId: string, sessionId: string) => void | Promise<void>;
  onCreateSource: (type: DataSourceType) => void | Promise<void>;
  onDeleteSource: (sourceId: string) => void | Promise<void>;
  onLoadApicalEvents: (sourceId: string) => void | Promise<void>;
  onSaveApicalSource: (sourceId: string, changes: Partial<DataSourceConfig>) => void | Promise<void>;
  onSaveEventAssignment: (eventId: string, sourceIds: string[]) => void | Promise<void>;
  onSaveSessionAssignment: (sessionId: string, mode: 'default' | 'specific', sourceIds: string[]) => void | Promise<void>;
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
];

const toggleInList = (values: string[], value: string): string[] => {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
};

export const SystemPage = (props: SystemPageProps): React.ReactElement => {
  const selectedEvent = props.catalog.events.find((event) => event.id === props.catalog.activeEventId) || props.catalog.events[0];
  const eventSessions = getSessionsForEvent(props.catalog, selectedEvent?.id);
  const assignedEventSourceIds = (selectedEvent && props.config.eventSourceAssignments[selectedEvent.id]) || [];

  return (
    <section className="events-screen">
      <h1>System</h1>
      <p>Configure global data-source settings, assign data sources to events, and choose per-session source usage.</p>

      <section className="events-panel">
        <h2>Data Source Types</h2>
        <div className="events-actions">
          {sourceTypeOptions.map((type) => (
            <button key={type} type="button" onClick={() => props.onCreateSource(type)}>
              Add {getDataSourceTypeLabel(type)}
            </button>
          ))}
        </div>
      </section>

      <section className="events-panel">
        <h2>Configured Data Sources</h2>
        {props.config.dataSources.length === 0 ? (
          <p>No data sources configured yet.</p>
        ) : (
          props.config.dataSources.map((source) => {
            const isApicalApi = source.type === 'api-apical-data-file';
            const listedEvents = source.listedEvents || [];
            const selectedEventIds = source.apiConfig?.selectedEventIds || [];

            return (
              <div key={source.id} className="events-panel" style={{ marginBottom: '12px' }}>
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
                      <button type="button" onClick={() => props.onLoadApicalEvents(source.id)}>
                        Fetch Apical Events
                      </button>
                    </div>
                    {listedEvents.length > 0 ? (
                      <div>
                        <h5>Available Apical Events</h5>
                        <ul>
                          {listedEvents.map((eventItem) => {
                            const checked = selectedEventIds.includes(eventItem.id);
                            return (
                              <li key={eventItem.id}>
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => props.onSaveApicalSource(source.id, {
                                      apiConfig: {
                                        ...source.apiConfig!,
                                        selectedEventIds: checked
                                          ? selectedEventIds.filter((id) => id !== eventItem.id)
                                          : [...selectedEventIds, eventItem.id],
                                      },
                                    })}
                                  />
                                  {eventItem.name} ({eventItem.id})
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
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
              </div>
            );
          })
        )}
      </section>

      {selectedEvent ? (
        <section className="events-panel">
          <h2>Event Source Assignment</h2>
          <p>{selectedEvent.name}</p>
          {props.config.dataSources.length === 0 ? (
            <p>No sources available for assignment.</p>
          ) : (
            <ul>
              {props.config.dataSources.map((source) => {
                const checked = assignedEventSourceIds.includes(source.id);
                return (
                  <li key={`event-assign-${source.id}`}>
                    <label>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => props.onSaveEventAssignment(
                          selectedEvent.id,
                          toggleInList(assignedEventSourceIds, source.id),
                        )}
                      />
                      {source.name}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {selectedEvent ? (
        <section className="events-panel">
          <h2>Session Source Assignment</h2>
          {eventSessions.length === 0 ? (
            <p>No sessions available for this event.</p>
          ) : (
            eventSessions.map((session) => {
              const sessionAssignment = props.config.sessionSourceAssignments[session.id] || { mode: 'default', sourceIds: [] as string[] };
              const effectiveSourceIds = sessionAssignment.mode === 'default' ? assignedEventSourceIds : sessionAssignment.sourceIds;

              return (
                <div key={session.id} className="events-panel" style={{ marginBottom: '8px' }}>
                  <h4>{session.name}</h4>
                  <label>
                    Source mode
                    <select
                      aria-label={`Session Source Mode ${session.id}`}
                      value={sessionAssignment.mode}
                      onChange={(event) => props.onSaveSessionAssignment(session.id, event.target.value as 'default' | 'specific', sessionAssignment.sourceIds)}
                    >
                      <option value="default">Default (all event sources)</option>
                      <option value="specific">Specific source selection</option>
                    </select>
                  </label>

                  {sessionAssignment.mode === 'specific' ? (
                    <ul>
                      {props.config.dataSources.map((source) => {
                        const checked = sessionAssignment.sourceIds.includes(source.id);
                        return (
                          <li key={`session-assign-${session.id}-${source.id}`}>
                            <label>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => props.onSaveSessionAssignment(session.id, 'specific', toggleInList(sessionAssignment.sourceIds, source.id))}
                              />
                              {source.name}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}

                  <p>Effective sources: {effectiveSourceIds.length}</p>
                  <div className="events-actions">
                    <button type="button" onClick={() => props.onApplySessionSources(selectedEvent.id, session.id)}>
                      Apply Assigned Sources To Session
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </section>
      ) : null}
    </section>
  );
};
