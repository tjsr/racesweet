import React from 'react';
import { Button, Menu, MenuItem, Tooltip } from '@mui/material';
import { type EventCatalogEntrant } from '../catalog/eventCatalog.js';
import { copyToClipboard } from './identifierDisplay.js';

interface EntrantListCartProps {
  categoryColor?: string;
  categoryName?: string;
  entrant: EventCatalogEntrant;
  entrantLabel?: string;
  entrySummaries?: string[];
  allowSelectedClick?: boolean;
  isSelected: boolean;
  relationshipLabel?: string;
  onSelect: (event: React.MouseEvent<HTMLButtonElement>) => void;
  participantId?: string;
  raceNumber?: string | number;
  showCategory?: boolean;
  timingDevices?: Array<string | number>;
  teamName?: string;
}

export const EntrantListCard = (props: EntrantListCartProps): React.ReactElement => {
  const [contextMenu, setContextMenu] = React.useState<{ mouseX: number; mouseY: number } | undefined>(undefined);
  const raceNumberText = props.raceNumber === undefined || props.raceNumber === null || props.raceNumber === ''
    ? undefined
    : `#${props.raceNumber}`;
  const timingDeviceText = props.timingDevices && props.timingDevices.length > 0
    ? props.timingDevices.map((timingDevice) => {
      const timingDeviceTextValue = String(timingDevice);
      return timingDeviceTextValue.startsWith('Tx') ? timingDeviceTextValue : `Tx${timingDeviceTextValue}`;
    }).join(', ')
    : undefined;
  const participantDetailLines: string[] = [`Entrant ID: ${props.entrant.id}`];
  if (props.participantId) {
    participantDetailLines.push(`Participant ID: ${props.participantId}`);
  }
  if (raceNumberText) {
    participantDetailLines.push(`Race number: ${raceNumberText}`);
  }
  if (timingDeviceText) {
    participantDetailLines.push(`Timing devices: ${timingDeviceText}`);
  }
  const contextCopyLabel: string = props.participantId ? 'Copy participant details' : 'Copy entrant details';
  const copyDetails = (): void => {
    copyToClipboard(participantDetailLines.join('\n'));
    setContextMenu(undefined);
  };
  const openContextMenu = (event: React.MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    setContextMenu({ mouseX: event.clientX - 2, mouseY: event.clientY - 4 });
  };
  const selectCard = (event: React.MouseEvent<HTMLButtonElement>): void => {
    if (!props.isSelected || props.allowSelectedClick || event.ctrlKey || event.metaKey || event.shiftKey) {
      props.onSelect(event);
    }
  };

  return <>
    <Tooltip describeChild enterDelay={0} title={participantDetailLines.join('\n')}>
      <Button
        sx={{ alignItems: 'stretch', display: 'flex', flexDirection: 'column', textAlign: 'left', textTransform: 'none' }}
        type="button"
        className={`events-list-item object-card${props.isSelected ? ' selected' : ''}`}
        data-entrant-id={props.entrant.id}
        onClick={selectCard}
        onContextMenu={openContextMenu}
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
        {props.showCategory !== false && props.categoryName ? (
          <span className="entrant-category-chip" style={{ backgroundColor: props.categoryColor }}>
            {props.categoryName || 'No category'}
          </span>
        ) : null}
        {props.entrySummaries && props.entrySummaries.length > 0 ? (
          <div className="entrant-list-entries">
            {props.entrySummaries.map((summary) => (
              <span className="entrant-entry-chip" key={summary}>{summary}</span>
            ))}
          </div>
        ) : null}
        <div className="entrant-list-team-row">
          {props.entrant.entrantType === 'rider' && props.teamName ? (
            <span className="entrant-team-chip">
              {props.relationshipLabel || 'Team'}: {props.teamName}
            </span>
          ) : null}
          <span className="entrant-list-type">{
            props.entrant.isEntryOwner
              ? 'entrant'
              : props.entrant.entrantType === 'rider'
                ? (props.entrantLabel || 'Driver').toLowerCase()
                : props.entrant.entrantType
          }</span>
        </div>
      </Button>
    </Tooltip>
    <Menu
      anchorPosition={contextMenu ? { left: contextMenu.mouseX, top: contextMenu.mouseY } : undefined}
      anchorReference="anchorPosition"
      onClose={(): void => setContextMenu(undefined)}
      open={contextMenu !== undefined}
    >
      <MenuItem onClick={copyDetails}>{contextCopyLabel}</MenuItem>
    </Menu>
  </>;
};
