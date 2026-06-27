import React from 'react';
import { LicencesControl } from '../../controls/licencesControl.js';
import { RaceNumbersControl } from '../../controls/raceNumbersControl.js';
import { TimingDevicesControl } from '../../controls/timingDevicesControl.js';
import { type EventParticipant } from '../../model/eventparticipant.js';

interface IdentificationPanelProps {
  onUpdateParticipantIdentifiers?: (participantId: string, identifierType: 'racePlate' | 'txNo', values: Array<string | number>) => void | Promise<void>;
  participants: EventParticipant[];
}

export const IdentificationPanel = (props: IdentificationPanelProps): React.ReactElement => (
  <section className="events-panel">
    <h2>Identification</h2>
    <RaceNumbersControl
      participants={props.participants}
      onUpdateRaceNumbers={(participantId, raceNumbers) => props.onUpdateParticipantIdentifiers?.(participantId, 'racePlate', raceNumbers)}
    />
    <TimingDevicesControl
      participants={props.participants}
      onUpdateTimingDevices={(participantId, timingDevices) => props.onUpdateParticipantIdentifiers?.(participantId, 'txNo', timingDevices)}
    />
    <LicencesControl />
  </section>
);
