import React from 'react';
import { getParticipantTransponders } from '../controllers/participant.js';
import { type EventParticipant } from '../model/eventparticipant.js';

interface TimingDevicesControlProps {
  onUpdateTimingDevices: (participantId: string, timingDevices: string[]) => void | Promise<void>;
  participants: EventParticipant[];
}

const normalizeTimingDevice = (value: string): string => {
  const trimmed = value.trim();
  return trimmed.startsWith('Tx') ? trimmed.slice(2) : trimmed;
};

const parseTimingDevices = (value: string): string[] => Array.from(new Set(
  value.split(',').map(normalizeTimingDevice).filter((item) => item.length > 0)
));

export const TimingDevicesControl = (props: TimingDevicesControlProps): React.ReactElement => {
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    setDrafts(Object.fromEntries(props.participants.map((participant) => [
      participant.id.toString(),
      getParticipantTransponders(participant).map((identifier) => `Tx${identifier}`).join(', '),
    ])));
  }, [props.participants]);

  return (
    <section className="readonly-summary-section">
      <h3>Timing devices</h3>
      {props.participants.length === 0 ? (
        <p className="readonly-summary">No participant is selected.</p>
      ) : props.participants.map((participant) => {
        const participantId = participant.id.toString();

        return (
          <div className="identification-editor" key={participantId}>
            <label>
              {`${participant.firstname} ${participant.surname}`.trim() || participantId}
              <input
                aria-label={`Timing Devices ${participant.firstname} ${participant.surname}`.trim()}
                type="text"
                value={drafts[participantId] || ''}
                onChange={(event) => setDrafts((current) => ({
                  ...current,
                  [participantId]: event.target.value,
                }))}
              />
            </label>
            <button
              type="button"
              onClick={() => props.onUpdateTimingDevices(participantId, parseTimingDevices(drafts[participantId] || ''))}
            >
              Save Timing Devices
            </button>
          </div>
        );
      })}
    </section>
  );
};
