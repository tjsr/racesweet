import React from 'react';
import { getParticipantIdentifiers } from '../controllers/participant.js';
import { type EventParticipant } from '../model/eventparticipant.js';

interface RaceNumbersControlProps {
  onUpdateRaceNumbers: (participantId: string, raceNumbers: string[]) => void | Promise<void>;
  participants: EventParticipant[];
}

const parseIdentifierList = (value: string): string[] => Array.from(new Set(
  value.split(',').map((item) => item.trim().replace(/^#/, '')).filter((item) => item.length > 0)
));

export const RaceNumbersControl = (props: RaceNumbersControlProps): React.ReactElement => {
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    setDrafts(Object.fromEntries(props.participants.map((participant) => [
      participant.id.toString(),
      getParticipantIdentifiers(participant, 'racePlate').map((identifier) => identifier.toString()).join(', '),
    ])));
  }, [props.participants]);

  return (
    <section className="readonly-summary-section">
      <h3>Race Numbers</h3>
      {props.participants.length === 0 ? (
        <p className="readonly-summary">No participant is selected.</p>
      ) : props.participants.map((participant) => {
        const participantId = participant.id.toString();

        return (
          <div className="identification-editor" key={participantId}>
            <label>
              {`${participant.firstname} ${participant.surname}`.trim() || participantId}
              <input
                aria-label={`Race Numbers ${participant.firstname} ${participant.surname}`.trim()}
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
              onClick={() => props.onUpdateRaceNumbers(participantId, parseIdentifierList(drafts[participantId] || ''))}
            >
              Save Race Numbers
            </button>
          </div>
        );
      })}
    </section>
  );
};
