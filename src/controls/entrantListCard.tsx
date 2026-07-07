import React from 'react';
import { type EventCatalogEntrant } from '../catalog/eventCatalog.js';

interface EntrantListCartProps {
  categoryName?: string;
  entrant: EventCatalogEntrant;
  isSelected: boolean;
  onSelect: () => void;
  raceNumber?: string | number;
  timingDevices?: Array<string | number>;
  teamName?: string;
}

export const EntrantListCard = (props: EntrantListCartProps): React.ReactElement => {
  const raceNumberText = props.raceNumber === undefined || props.raceNumber === null || props.raceNumber === ''
    ? undefined
    : `#${props.raceNumber}`;
  const timingDeviceText = props.timingDevices && props.timingDevices.length > 0
    ? props.timingDevices.map((timingDevice) => {
      const timingDeviceTextValue = String(timingDevice);
      return timingDeviceTextValue.startsWith('Tx') ? timingDeviceTextValue : `Tx${timingDeviceTextValue}`;
    }).join(', ')
    : undefined;

  return (
    <button
      type="button"
      className={`events-list-item${props.isSelected ? ' selected' : ''}`}
      onClick={() => {
        if (!props.isSelected) {
          props.onSelect();
        }
      }}
      aria-selected={props.isSelected}
    >
      <div className="entrant-list-card-header">
        <strong className="entrant-list-name">{props.entrant.name}</strong>
        {raceNumberText || timingDeviceText ? (
          <div className="entrant-list-card-identifiers">
            {raceNumberText ? <span className="entrant-race-number">{raceNumberText}</span> : null}
            {timingDeviceText ? <span className="entrant-timing-devices">{timingDeviceText}</span> : null}
          </div>
        ) : null}
      </div>
      {props.entrant.entrantType === 'rider' ? (
        <span className="entrant-category-chip">
          {props.categoryName || 'No category'}
        </span>
      ) : null}
      <div className="entrant-list-team-row">
        {props.entrant.entrantType === 'rider' && props.teamName ? (
          <span className="entrant-team-chip">
            Team: {props.teamName}
          </span>
        ) : null}
        <span className="entrant-list-type">{props.entrant.entrantType}</span>
      </div>
    </button>
  );
};
