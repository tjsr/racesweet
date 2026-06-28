import React from 'react';
import { IdentifierListControl } from './identifierListControl.js';
import { type EventParticipant, type ParticipantTransponder } from '../model/eventparticipant.js';

interface TimingDevicesControlProps {
  onUpdateTimingDevices: (participantId: string, timingDevices: ParticipantTransponder[]) => void | Promise<void>;
  participants: EventParticipant[];
}

export const TimingDevicesControl = (props: TimingDevicesControlProps): React.ReactElement => {
  return (
    <IdentifierListControl
      addButtonLabel="Add device"
      allowMultiple={true}
      heading="Timing devices"
      identifierType="txNo"
      normalizeValue={(value) => {
        const trimmed = value.trim();
        return trimmed.startsWith('Tx') ? trimmed.slice(2) : trimmed;
      }}
      onUpdateIdentifiers={(participantId, values) => props.onUpdateTimingDevices(participantId, values as ParticipantTransponder[])}
      participants={props.participants}
      removeButtonLabel="Remove device"
      rowLabel="Timing device"
      showAssignmentTime={true}
    />
  );
};
