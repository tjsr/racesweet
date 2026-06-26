import React from 'react';
import { type EventCatalogEntrant } from '../app/eventCatalog.js';

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
      {raceNumberText || timingDeviceText ? (
        <div className="entrant-list-card-meta">
          {raceNumberText ? <span className="entrant-race-number">{raceNumberText}</span> : null}
          {timingDeviceText ? <span className="entrant-timing-devices">{timingDeviceText}</span> : null}
        </div>
      ) : null}
      <strong>{props.entrant.name}</strong>
      {props.entrant.entrantType === 'rider' ? (
        <>
          <span className="entrant-category-chip">
            {props.categoryName || 'No category'}
          </span>
          {props.teamName ? (
            <span className="entrant-team-chip">
              Team: {props.teamName}
            </span>
          ) : null}
        </>
      ) : null}
      <span className="entrant-list-type">{props.entrant.entrantType}</span>
    </button>
  );
};
