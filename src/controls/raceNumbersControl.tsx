import React from 'react';
import { IdentifierListControl } from './identifierListControl.js';
import { type EventParticipant } from '../model/eventparticipant.js';

interface RaceNumbersControlProps {
  enableMultiplePlates?: boolean;
  onUpdateRaceNumbers: (participantId: string, raceNumbers: string[]) => void | Promise<void>;
  participants: EventParticipant[];
}

export const RaceNumbersControl = (props: RaceNumbersControlProps): React.ReactElement => {
  return (
    <IdentifierListControl
      addButtonLabel="Add plate"
      allowMultiple={props.enableMultiplePlates === true}
      heading="Race Numbers"
      identifierType="racePlate"
      normalizeValue={(value) => value.trim().replace(/^#/, '')}
      onUpdateIdentifiers={(participantId, values) => props.onUpdateRaceNumbers(participantId, values as string[])}
      participants={props.participants}
      removeButtonLabel="Remove plate"
      rowLabel="Race plate"
    />
  );
};
