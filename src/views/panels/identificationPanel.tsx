import React from 'react';
import { LicencesControl } from '../../controls/licencesControl.js';
import { RaceNumbersControl } from '../../controls/raceNumbersControl.js';
import { TimingDevicesControl } from '../../controls/timingDevicesControl.js';
import { type EventParticipant, type ParticipantIdentifierUpdate } from '../../model/eventparticipant.js';

interface IdentificationPanelProps {
  enableMultiplePlates?: boolean;
  onUpdateParticipantIdentifiers?: (participantId: string, identifierType: 'racePlate' | 'txNo', values: ParticipantIdentifierUpdate[]) => void | Promise<void>;
  participants?: EventParticipant[];
  selectedParticipant?: EventParticipant;
}

export const IdentificationPanel = (props: IdentificationPanelProps): React.ReactElement => {
  const participants = props.participants || (props.selectedParticipant ? [props.selectedParticipant] : []);

  return (
    <section className="events-panel">
      <h2>Identification</h2>
      <RaceNumbersControl
        enableMultiplePlates={props.enableMultiplePlates}
        participants={participants}
        onUpdateRaceNumbers={(participantId, raceNumbers) => props.onUpdateParticipantIdentifiers?.(participantId, 'racePlate', raceNumbers)}
      />
      <TimingDevicesControl
        participants={participants}
        onUpdateTimingDevices={(participantId, timingDevices) => props.onUpdateParticipantIdentifiers?.(participantId, 'txNo', timingDevices)}
      />
      <LicencesControl />
    </section>
  );
};
