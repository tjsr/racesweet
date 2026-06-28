import React from 'react';
import { type EventCatalogSession, type EventCatalogState } from '../../app/eventCatalog.js';
import { SESSION_SOURCE_RELOAD_OPTIONS, type SessionSourceReloadMode } from '../../app/sessionSourceReload.js';
import { type SystemConfiguration } from '../../app/systemConfig.js';
import { type EventId } from '../../model/raceevent.js';

interface SessionDraft {
  kind: EventCatalogSession['kind'];
  name: string;
  notes: string;
  scheduledStart: string;
  status: EventCatalogSession['status'];
}

interface SessionDetailsPanelProps {
  catalog: EventCatalogState;
  config: SystemConfiguration;
  effectiveSessionSourceIds: string[];
  onApplySessionSources: () => void | Promise<void>;
  onDeleteSession: () => void | Promise<void>;
  onMoveSessionToEvent?: (eventId: EventId) => void | Promise<void>;
  onReloadSessionSources: (mode: SessionSourceReloadMode) => void | Promise<void>;
  onSaveSessionAssignment: (mode: 'default' | 'specific', sourceIds: string[]) => void | Promise<void>;
  onSetSessionDraft: React.Dispatch<React.SetStateAction<SessionDraft>>;
  onSaveSession: () => void | Promise<void>;
  requestFormExit: (action: () => void | Promise<void>) => void;
  selectedEvent?: { id: EventId; name: string };
  selectedSession?: EventCatalogSession;
  sessionAssignment?: { mode: 'default' | 'specific'; sourceIds: string[] };
  sessionDraft: SessionDraft;
  warningModal?: React.ReactNode;
}

export const SessionDetailsPanel = (props: SessionDetailsPanelProps): React.ReactElement => {
  const [reloadMode, setReloadMode] = React.useState<SessionSourceReloadMode>('all');

  return (
    <section className="events-panel">
      <h2>Session Details</h2>
      {props.selectedSession ? (
        <>
          <label>
          Parent Event
            <select
              aria-label="Sessions Page Parent Event"
              value={props.selectedSession.eventId}
              onChange={(event) => {
                const eventId = event.target.value;
                if (props.onMoveSessionToEvent) {
                  props.requestFormExit(() => props.onMoveSessionToEvent?.(eventId));
                }
              }}
              disabled={!props.onMoveSessionToEvent}
            >
              {props.catalog.events.map((event) => (
                <option key={`session-parent-${props.selectedSession?.id}-${event.id}`} value={event.id}>{event.name}</option>
              ))}
            </select>
          </label>
          <label>
          Session Name
            <input
              aria-label="Sessions Page Name"
              type="text"
              value={props.sessionDraft.name}
              onChange={(event) => props.onSetSessionDraft((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label>
          Session Kind
            <select
              aria-label="Sessions Page Kind"
              value={props.sessionDraft.kind}
              onChange={(event) => props.onSetSessionDraft((current) => ({ ...current, kind: event.target.value as EventCatalogSession['kind'] }))}
            >
              <option value="practice">Practice</option>
              <option value="qualifying">Qualifying</option>
              <option value="race">Race</option>
              <option value="warmup">Warmup</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
          Session Status
            <select
              aria-label="Sessions Page Status"
              value={props.sessionDraft.status}
              onChange={(event) => props.onSetSessionDraft((current) => ({ ...current, status: event.target.value as EventCatalogSession['status'] }))}
            >
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
              <option value="live">Live</option>
              <option value="completed">Completed</option>
            </select>
          </label>
          <label>
          Scheduled Start
            <input
              aria-label="Sessions Page Start"
              type="datetime-local"
              value={props.sessionDraft.scheduledStart.slice(0, 16)}
              onChange={(event) => props.onSetSessionDraft((current) => ({ ...current, scheduledStart: `${event.target.value}:00.000Z` }))}
            />
          </label>
          <label>
          Notes
            <textarea
              aria-label="Sessions Page Notes"
              value={props.sessionDraft.notes}
              onChange={(event) => props.onSetSessionDraft((current) => ({ ...current, notes: event.target.value }))}
            />
          </label>

          <h3>Session Data Sources</h3>
          <label>
          Source mode
            <select
              aria-label="Sessions Source Mode"
              value={props.sessionAssignment?.mode || 'default'}
              onChange={(event) => props.onSaveSessionAssignment(event.target.value as 'default' | 'specific', props.sessionAssignment?.sourceIds || [])}
            >
              <option value="default">Default (all event sources)</option>
              <option value="specific">Specific source selection</option>
            </select>
          </label>

          {props.sessionAssignment?.mode === 'specific' ? (
            props.config.dataSources.length === 0 ? (
              <p>No configured data sources are available yet. Add and configure them in System.</p>
            ) : (
              <ul>
                {props.config.dataSources.map((source) => {
                  const checked = props.sessionAssignment?.sourceIds.includes(source.id);
                  return (
                    <li key={`session-source-${props.selectedSession?.id}-${source.id}`}>
                      <label>
                        <input
                          aria-label={`Session Source ${props.selectedSession?.id} ${source.id}`}
                          type="checkbox"
                          checked={checked}
                          onChange={() => props.onSaveSessionAssignment('specific', props.sessionAssignment ? toggleInList(props.sessionAssignment.sourceIds, source.id) : [source.id])}
                        />
                        {source.name}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )
          ) : null}

          <p>Effective sources: {props.effectiveSessionSourceIds.length}</p>
          <div className="events-actions">
            <button type="button" onClick={() => props.onSaveSession()}>
              Save Session
            </button>
            <button type="button" onClick={() => props.onDeleteSession()}>
              Delete Session
            </button>
            <button type="button" onClick={() => props.onApplySessionSources()}>
              Apply Assigned Sources To Session
            </button>
            <span className="inline-action-group">
              <select
                aria-label="Session Source Reload Mode"
                value={reloadMode}
                onChange={(event) => setReloadMode(event.target.value as SessionSourceReloadMode)}
              >
                {SESSION_SOURCE_RELOAD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => props.onReloadSessionSources(reloadMode)}
              >
                Re-load from sources
              </button>
            </span>
          </div>
          {props.warningModal}
        </>
      ) : (
        <p>No sessions are defined for this event.</p>
      )}
    </section>
  );
};

const toggleInList = (values: string[], value: string): string[] => {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
};
