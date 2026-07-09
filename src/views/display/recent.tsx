import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, ListItemText, Menu, MenuItem, Paper, Select, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip } from '@mui/material';
import React, { type JSX } from 'react';
import { DEFAULT_FASTEST_TIME_INDICATOR_COLORS, type FastestTimeIndicatorColors } from '../../app/systemConfig.ts';
import { type MillisecondsDuration, type TimeDisplayZoneMode, millisecondsToTime, resolveDisplayTimeZone, tableTimeString } from '../../app/utils/timeutils.ts';
import type { EventSessionKind } from '../../catalog/eventCatalog.ts';
import { categoriesTextFromLookupFn, shouldExcludeCategoryFromResults } from '../../controllers/category.ts';
import { createGreenFlagEvent, createRedFlagEvent, isFlagRecord } from '../../controllers/flag';
import { getLapTimeCell, getPassingLineNumber, getPassingLoopNumber, getTimingLineKey, isFinishLinePassing } from '../../controllers/laps.ts';
import { getParticipantNumber, getParticipantTransponders } from '../../controllers/participant.ts';
import { findEntrantByChipCode, findEntrantByPlateNumber } from '../../controllers/participantSearch.ts';
import { getAutomaticIdentifier, getTimeRecordIdentifier, isCrossingRecord } from '../../controllers/timerecord.ts';
import { EventParticipant, EventParticipantId, EventTimeRecord } from '../../model';
import { EventCategory, EventCategoryId } from '../../model/eventcategory';
import { EventTeam } from '../../model/eventteam.ts';
import { FlagRecord } from '../../model/flag';
import { createTimeRecordId, createTimeRecordSourceId } from '../../model/ids.ts';
import { EventId, SessionId } from '../../model/raceevent.ts';
import { RaceStateLookup } from '../../model/racestate.ts';
import { EVENT_FLAG_DISPLAYED, EVENT_SESSION_END, ParticipantPassingRecord, RECORD_TX_CROSSING, TimeRecordId } from '../../model/timerecord.ts';
import { InvalidCategoryIdError, NoCrossingError, NoParticipantError, ParticipantNotFoundError } from '../../validators/errors.ts';
import "./recent.css";

type RecentRecordsFilterMode = 'all' | 'category' | 'participant' | 'team';
type RecentRecordsIgnoreMode = 'outsideEventWindow' | 'sectorLoops' | 'unrecognised';

interface LapTimeIndicators {
  entrantFaster: boolean;
  entrantFastest: boolean;
  lapLeader: boolean;
  overallFastest: boolean;
}

const ignoreModeLabels: Record<RecentRecordsIgnoreMode, string> = {
  outsideEventWindow: 'Outside event window',
  sectorLoops: 'Sector loops',
  unrecognised: 'Unrecognised',
};

type AddableRecordType = 'passing' | 'flag';
type AddableFlagType = 'green' | 'yellow' | 'white' | 'red' | 'chequered';

type RecordDialogMode = 'add' | 'edit';

interface AddRecordDialogState {
  anchorRecord: EventTimeRecord;
  existingRecord?: EventTimeRecord;
  mode: RecordDialogMode;
}

const MANUAL_RECORD_SOURCE_ID = createTimeRecordSourceId('manual-entry');
const manualFlagLabelByType: Record<AddableFlagType, string> = {
  chequered: 'Checquered',
  green: 'Green',
  red: 'Red',
  white: 'White',
  yellow: 'Yellow',
};

const formatManualTimeOfDay = (time: Date | undefined): string => {
  if (!time) {
    return '';
  }
  const hours = `${time.getUTCHours()}`.padStart(2, '0');
  const minutes = `${time.getUTCMinutes()}`.padStart(2, '0');
  const seconds = `${time.getUTCSeconds()}`.padStart(2, '0');
  const milliseconds = `${time.getUTCMilliseconds()}`.padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
};

const parseManualTimeOfDay = (anchorTime: Date | undefined, value: string): Date | undefined => {
  if (!anchorTime) {
    return undefined;
  }
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
  if (!match) {
    return undefined;
  }
  const [, hoursText, minutesText, secondsText = '0', millisecondsText = '0'] = match;
  const parsedTime = new Date(anchorTime);
  parsedTime.setUTCHours(
    Number(hoursText),
    Number(minutesText),
    Number(secondsText),
    Number(millisecondsText.padEnd(3, '0'))
  );
  return parsedTime;
};

const participantArrayFromLookup = (raceStateLookup: RaceStateLookup): EventParticipant[] => {
  return (raceStateLookup as unknown as { participants?: EventParticipant[] }).participants || [];
};

const participantMapFromLookup = (raceStateLookup: RaceStateLookup): Map<EventParticipantId, EventParticipant> => {
  return new Map(participantArrayFromLookup(raceStateLookup).map((participant) => [participant.id, participant]));
};

const resolveParticipantForManualEntry = (
  participantMap: Map<EventParticipantId, EventParticipant>,
  txNo: string,
  plate: string
): EventParticipant | undefined => {
  const normalizedTx = txNo.trim();
  if (normalizedTx.length > 0 && !Number.isNaN(Number(normalizedTx))) {
    const txMatch = findEntrantByChipCode(participantMap, Number(normalizedTx));
    if (txMatch) {
      return txMatch;
    }
  }
  const normalizedPlate = plate.trim();
  if (normalizedPlate.length > 0) {
    return findEntrantByPlateNumber(participantMap, normalizedPlate) || undefined;
  }
  return undefined;
};

const getParticipantTeamName = (participant: EventParticipant | undefined, raceStateLookup: RaceStateLookup): string => {
  if (!participant) {
    return '';
  }
  const participantName = `${participant.firstname || ''} ${participant.surname || ''}`.trim();
  const teams = (raceStateLookup as unknown as { teams?: EventTeam[] }).teams || [];
  const team = teams.find((candidate) => candidate.members.includes(participant.id) && candidate.name !== participantName);
  return team?.name || '';
};

const getParticipantSessionCategoryIds = (participant: EventParticipant, raceStateLookup: RaceStateLookup): EventCategoryId[] => {
  const teams = (raceStateLookup as unknown as { teams?: EventTeam[] }).teams || [];
  const categoryIds = new Set<EventCategoryId>();

  if (participant.categoryId) {
    categoryIds.add(participant.categoryId);
  }

  teams.forEach((team) => {
    if (team.members.includes(participant.id) && team.categoryId) {
      categoryIds.add(team.categoryId);
    }
  });

  return Array.from(categoryIds);
};

const buildManualFlagRecord = (
  anchorRecord: EventTimeRecord,
  currentEventId: EventId | undefined,
  currentSessionId: SessionId | undefined,
  records: EventTimeRecord[],
  time: Date,
  flagType: AddableFlagType,
  categoryIds: EventCategoryId[],
  existingRecord?: EventTimeRecord
): FlagRecord => {
  const baseRecord = {
    eventId: currentEventId || existingRecord?.eventId || anchorRecord.eventId,
    id: existingRecord?.id || createTimeRecordId(),
    recordType: EVENT_FLAG_DISPLAYED,
    sequence: existingRecord?.sequence || Math.max(...records.map((record) => record.sequence), 0) + 1,
    sessionId: currentSessionId || existingRecord?.sessionId || anchorRecord.sessionId,
    source: existingRecord?.source || MANUAL_RECORD_SOURCE_ID,
    time,
  };

  if (flagType === 'green') {
    return createGreenFlagEvent({
      ...baseRecord,
      categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
      indicatesRaceStart: true,
    });
  }
  if (flagType === 'red') {
    return createRedFlagEvent({
      ...baseRecord,
      categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
    });
  }
  return {
    ...baseRecord,
    categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
    flagType,
    flagValue: flagType === 'yellow' ? 'caution' : 'course',
  } as FlagRecord;
};

const buildManualPassingRecord = (
  anchorRecord: EventTimeRecord,
  currentEventId: EventId | undefined,
  currentSessionId: SessionId | undefined,
  records: EventTimeRecord[],
  time: Date,
  txNo: string,
  plate: string,
  antenna: string,
  existingRecord?: EventTimeRecord
): ParticipantPassingRecord => {
  const trimmedTxNo = txNo.trim();
  const trimmedPlate = plate.trim();
  const record: ParticipantPassingRecord & { antenna?: string; chipCode?: number; plateNumber?: string } = {
    eventId: currentEventId || existingRecord?.eventId || anchorRecord.eventId,
    id: existingRecord?.id || createTimeRecordId(),
    recordType: RECORD_TX_CROSSING,
    sequence: existingRecord?.sequence || Math.max(...records.map((entry) => entry.sequence), 0) + 1,
    sessionId: currentSessionId || existingRecord?.sessionId || anchorRecord.sessionId,
    source: existingRecord?.source || MANUAL_RECORD_SOURCE_ID,
    time,
  };

  if (trimmedTxNo.length > 0 && !Number.isNaN(Number(trimmedTxNo))) {
    record.chipCode = Number(trimmedTxNo);
  }
  if (trimmedPlate.length > 0) {
    record.plateNumber = trimmedPlate;
  }
  if (antenna.trim().length > 0) {
    record.antenna = antenna.trim();
  }

  return record;
};

const getEditableFlagCategoryIds = (record: EventTimeRecord): EventCategoryId[] => {
  if (!isFlagRecord(record)) {
    return [];
  }
  return [...(record.categoryIds || [])];
};

const getEditablePassingTxNo = (record: EventTimeRecord): string => {
  const txNo = getAutomaticIdentifier(record);
  return txNo !== undefined ? txNo.toString() : '';
};

const getEditablePassingPlate = (record: EventTimeRecord, raceStateLookup: RaceStateLookup): string => {
  const passingRecord = record as ParticipantPassingRecord & { plateNumber?: string | number };
  if (passingRecord.plateNumber !== undefined) {
    return passingRecord.plateNumber.toString();
  }
  const participant = passingRecord.participantId ? raceStateLookup.getParticipantById(passingRecord.participantId) : undefined;
  const plateNumber = participant ? getParticipantNumber(participant) : undefined;
  return plateNumber !== undefined ? plateNumber.toString() : '';
};

const getEditablePassingAntenna = (record: EventTimeRecord): string => {
  return ((record as ParticipantPassingRecord & { antenna?: string }).antenna || '').toString();
};

const formatOptionalNumber = (value: number | undefined): string => {
  return value === undefined ? '' : value.toString();
};

const formatFinishLineNumbers = (raceStateLookup: RaceStateLookup): string => {
  return (raceStateLookup.getFinishLineNumbers?.() || [1]).join(', ');
};

const isLapControlCrossing = (
  record: EventTimeRecord,
  raceStateLookup: RaceStateLookup
): boolean => {
  if (!isCrossingRecord(record)) {
    return false;
  }

  const effectiveLoopNumber = getPassingLoopNumber(record) ?? getPassingLineNumber(record);
  if (effectiveLoopNumber !== undefined) {
    return effectiveLoopNumber === 1 || isFinishLinePassing(record, raceStateLookup.getFinishLineNumbers?.());
  }

  return record.isLapCompletion !== false;
};

const getCrossingUnrelatedReason = (passing: ParticipantPassingRecord): string | undefined => {
  return passing.unrelatedReason;
};

interface RecordsProps {
  currentEventId?: EventId;
  currentSessionId?: SessionId;
  eventTimeZone?: string;
  fastestTimeIndicatorColors?: FastestTimeIndicatorColors;
  onAddRecord?: (record: EventTimeRecord) => void;
  onEditRecord?: (record: EventTimeRecord) => void;
  onTimeDisplayZoneModeChange?: (mode: TimeDisplayZoneMode) => void;
  records: EventTimeRecord[];
  raceStateLookup: RaceStateLookup;
  sessionKind?: EventSessionKind;
  warnings?: string[];
  selectedCategories: Set<EventCategoryId>;
  selectedParticipants: Set<EventParticipantId>;
  sessionValidCategoryIds?: Set<EventCategoryId>;
  timeDisplayZoneMode?: TimeDisplayZoneMode;
  categorySelected?: ((ids: Set<EventCategoryId>) => void) | undefined;
  participantSelected?: ((participantId: Set<EventParticipantId>) => void) | undefined;
}

interface RecentRecordRowProps<RecordType extends EventTimeRecord = EventTimeRecord> {
  record: RecordType;
  index: number;
  raceStateLookup: RaceStateLookup;
  lapTimeIndicators?: LapTimeIndicators;
  selectedRecordId?: TimeRecordId;
  selectedCategories?: Set<EventCategoryId>;
  selectedPlateNumber?: string;
  selectedParticipants?: Set<EventParticipantId>;
  sessionValidCategoryIds?: Set<EventCategoryId>;
  categorySelected?: ((ids: Set<EventCategoryId>) => void) | undefined;
  participantSelected?: ((participantId: Set<EventParticipantId>) => void) | undefined;
  onAssignFlagCategory?: (flagId: TimeRecordId, categoryId: EventCategoryId) => void;
  onExclude?: (crossingId: TimeRecordId, exclude: boolean) => void;
  onChangeCategory?: (participantId: EventParticipantId, categoryId: EventCategoryId) => void;
  onOpenAddRecordDialog?: (record: EventTimeRecord) => void;
  onOpenEditRecordDialog?: (record: EventTimeRecord) => void;
  onMarkFlagDeleted?: (flagId: TimeRecordId, deleted: boolean) => void;
  onRemoveFlagCategory?: (flagId: TimeRecordId, categoryId: EventCategoryId) => void;
  onSelectRecord?: (recordId: TimeRecordId | undefined) => void;
  onSelectUnrecognisedPlateNumber?: (plateNumber: string | undefined) => void;
  sectorTimesByRecordId?: Map<TimeRecordId, number>;
  timeZone?: string;
  showSectorColumn?: boolean;
}

interface FlagRecordRowProps<FlagType extends FlagRecord> extends RecentRecordRowProps<FlagType> {
  categoryList?: EventCategory[];
  onSelect: (record: FlagType) => void;
}

export const FlagRecordRow = (props: FlagRecordRowProps<FlagRecord>) => {
  const record: FlagRecord = props.record;
  const [contextMenu, setContextMenu] = React.useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);

  if (!isFlagRecord(record)) {
    throw new Error('FlagRecord component used with non-flag record');
  }

  const normalizedFlagType = (record.flagType || 'flag').toLowerCase();
  const prettyType = normalizedFlagType.charAt(0).toUpperCase() + normalizedFlagType.slice(1);
  const flagText = `${prettyType} flag`;
  let flagClass = `flag ${normalizedFlagType}`;
  
  if (record.categoryIds?.some((id: EventCategoryId) => props.selectedCategories?.has(id))) {
    flagClass += ' selected-category';
  }
  if (record.id === props.selectedRecordId) {
    flagClass += ' selected-row';
  }
  if (record.deleted) {
    flagClass += ' excluded';
  }

  const categoryLookup = props.raceStateLookup.getCategoryById.bind(props.raceStateLookup);
  const categoryText = categoriesTextFromLookupFn(record.categoryIds || [], categoryLookup);
  const elapsedTime = '--:--:--.---';
  const allCategories = (props.raceStateLookup as unknown as { categories?: EventCategory[] }).categories || [];
  const assignedCategoryIds = new Set<EventCategoryId>(record.categoryIds || []);
  const assignedCategories = allCategories.filter((category) => assignedCategoryIds.has(category.id));
  const unassignedCategories = allCategories.filter((category) => !assignedCategoryIds.has(category.id));
  const handleContextMenu = (event: React.MouseEvent): void => {
    event.preventDefault();
    props.onSelectRecord?.(record.id);
    props.onSelect?.(record);
    setContextMenu(
      contextMenu === null
        ? {
          mouseX: event.clientX + 2,
          mouseY: event.clientY - 6,
        }
        : null
    );
  };
  const handleClose = (): void => {
    setContextMenu(null);
  };
  const handleMarkDeleted = (): void => {
    props.onMarkFlagDeleted?.(record.id, !record.deleted);
    handleClose();
  };
  const handleRemoveCategory = (categoryId: EventCategoryId): void => {
    props.onRemoveFlagCategory?.(record.id, categoryId);
    handleClose();
  };
  const handleAssignCategory = (categoryId: EventCategoryId): void => {
    props.onAssignFlagCategory?.(record.id, categoryId);
    handleClose();
  };
  const handleAddRecord = (): void => {
    props.onOpenAddRecordDialog?.(record);
    handleClose();
  };
  const handleEditRecord = (): void => {
    props.onOpenEditRecordDialog?.(record);
    handleClose();
  };

  return (<>
    <TableRow
      className={flagClass}
      data-record-id={record.id}
      key={record.id || props.index}
      onContextMenu={handleContextMenu}
      style={{ cursor: 'context-menu' }}
      onClick={() => {
        props.onSelectRecord?.(record.id);
        if (props.onSelect) {
          props.onSelect(record);
        }
      }}>
      <TableCell colSpan={1}>{record.sequence}</TableCell>
      <TableCell colSpan={2}>{flagText}</TableCell>
      <TableCell colSpan={1}>{tableTimeString(record.time, props.timeZone)}</TableCell>
      <TableCell colSpan={4}>{categoryText}</TableCell>
      <TableCell colSpan={props.showSectorColumn ? 3 : 2}>{elapsedTime}</TableCell>
    </TableRow>
    <Menu
      open={contextMenu !== null}
      onClose={handleClose}
      anchorReference="anchorPosition"
      anchorPosition={
        contextMenu !== null
          ? { left: contextMenu.mouseX, top: contextMenu.mouseY }
          : undefined
      }
    >
      <MenuItem onClick={handleAddRecord}>
        Add record
      </MenuItem>
      <MenuItem onClick={handleEditRecord}>
        Edit record
      </MenuItem>
      <MenuItem onClick={handleMarkDeleted}>
        {record.deleted ? 'Restore flag' : 'Mark deleted'}
      </MenuItem>
      <MenuItem disabled sx={{ fontWeight: 'bold', opacity: '1 !important' }}>
        Remove category
      </MenuItem>
      {assignedCategories.length === 0 ? (
        <MenuItem disabled sx={{ pl: 4 }}>No assigned categories</MenuItem>
      ) : assignedCategories.map((category) => (
        <MenuItem key={`remove-${category.id}`} onClick={() => handleRemoveCategory(category.id)} sx={{ pl: 4 }}>
          {category.name || category.id}
        </MenuItem>
      ))}
      <MenuItem disabled sx={{ fontWeight: 'bold', opacity: '1 !important' }}>
        Assign category
      </MenuItem>
      {unassignedCategories.length === 0 ? (
        <MenuItem disabled sx={{ pl: 4 }}>No available categories</MenuItem>
      ) : unassignedCategories.map((category) => (
        <MenuItem key={`assign-${category.id}`} onClick={() => handleAssignCategory(category.id)} sx={{ pl: 4 }}>
          {category.name || category.id}
        </MenuItem>
      ))}
    </Menu>
  </>);
};

const categoryStringFromId = (
  categoryId: EventCategoryId | undefined,
  categoryLookup: (id: EventCategoryId) => EventCategory | undefined
): string => {
  if (!categoryId) {
    throw new InvalidCategoryIdError(`No category ID provided for lookup.`);
  }
  const category = categoryLookup(categoryId);
  if (!category) {
    return `Unknown category &${categoryId}`;
  }
  return category.name || `Unnamed Category &${categoryId}`;
};

const categoryStringFromParticipant = (
  participant: EventParticipant,
  categoryLookup: (id: EventCategoryId) => EventCategory | undefined
): string => {
  if (!participant.categoryId) {
    return 'No category';
  }
  return categoryStringFromId(participant.categoryId, categoryLookup);
};

const categoryStringFromParticipantId = (
  participantId: EventParticipantId,
  participantLookup: (id: EventParticipantId) => EventParticipant | undefined,
  categoryLookup: (id: EventCategoryId) => EventCategory | undefined
): string => {
  if (!participantId) {
    throw new NoParticipantError(`No participant ID provided for lookup.`);
  }
  const participant = participantLookup(participantId);
  if (!participant) {
    throw new ParticipantNotFoundError(participantId);
  }
  return categoryStringFromParticipant(participant, categoryLookup);
};

const _categoriesFromCrossing = (
  crossing: ParticipantPassingRecord | undefined,
  participantLookup: (id: EventParticipantId) => EventParticipant | undefined,
  categoryLookup: (id: EventCategoryId) => EventCategory | undefined
): string => {
  if (!crossing) {
    throw new NoCrossingError();
  }

  if (!crossing.participantId) {
    throw new NoParticipantError(`No participant for crossing#${crossing.id}`);
  }

  return categoryStringFromParticipantId(crossing.participantId, participantLookup, categoryLookup);
};

const getPassingEntrantName = (participant: EventParticipant, rs: RaceStateLookup): string => {
  const participantName = `${participant.firstname} ${participant.surname}`;
  const teams = (rs as unknown as { teams?: EventTeam[] }).teams || [];
  const team = teams.find((candidate) => {
    return candidate.name !== participantName && candidate.members.includes(participant.id);
  });

  return team?.name ? `${participantName} (${team.name})` : participantName;
};

interface _CompletedLapProps {
  elapsedTime: MillisecondsDuration;
}

const UnknownChipRow = (
  { timeRecordId, sequenceNumber, txNo, passingTime, rs, identifier, antennae, onOpenAddRecordDialog, onOpenEditRecordDialog, onSelectRecord, onSelectUnrecognisedPlateNumber, plateNumber, record, selectedPlateNumber, selectedRecordId, showSectorColumn, timeZone }: {
    antennae: string
    onOpenAddRecordDialog?: (record: EventTimeRecord) => void,
    onOpenEditRecordDialog?: (record: EventTimeRecord) => void,
    onSelectRecord?: (recordId: TimeRecordId | undefined) => void,
    onSelectUnrecognisedPlateNumber?: (plateNumber: string | undefined) => void,
    plateNumber?: string,
    record: EventTimeRecord,
    selectedPlateNumber?: string,
    selectedRecordId?: TimeRecordId,
    showSectorColumn?: boolean,
    txNo: number | undefined,
    sequenceNumber: number
    passingTime: Date,
    timeRecordId: TimeRecordId,
    rs: RaceStateLookup,
    identifier: string,
    timeZone?: string,
  }
): JSX.Element => {
  const [contextMenu, setContextMenu] = React.useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);
  const txCount = txNo !== undefined ? rs.countTransponderCrossings(txNo, passingTime) : undefined;
  const content = plateNumber
    ? `Unknown race number #${plateNumber}`
    : `Unknown transponder ${identifier} (${txCount})`;
  const timeString = tableTimeString(passingTime, timeZone);
  const isSelectedPlate = plateNumber !== undefined && plateNumber.length > 0 && plateNumber === selectedPlateNumber;
  const rowClassName = [
    timeRecordId === selectedRecordId ? 'selected-row' : '',
    isSelectedPlate ? 'selected-plate-number' : '',
  ].filter((value) => value.length > 0).join(' ') || undefined;
  const handleSelect = (): void => {
    onSelectRecord?.(timeRecordId);
    onSelectUnrecognisedPlateNumber?.(plateNumber);
  };
  const handleContextMenu = (event: React.MouseEvent): void => {
    event.preventDefault();
    handleSelect();
    setContextMenu(
      contextMenu === null
        ? {
          mouseX: event.clientX + 2,
          mouseY: event.clientY - 6,
        }
        : null
    );
  };
  const handleClose = (): void => {
    setContextMenu(null);
  };
  const handleAddRecord = (): void => {
    onOpenAddRecordDialog?.(record);
    handleClose();
  };
  const handleEditRecord = (): void => {
    onOpenEditRecordDialog?.(record);
    handleClose();
  };

  return (
    <>
      <TableRow
        className={rowClassName}
        key={timeRecordId}
        data-record-id={timeRecordId}
        onContextMenu={handleContextMenu}
        onClick={handleSelect}
        style={{ cursor: 'context-menu' }}
      >
        <TableCell>{sequenceNumber}</TableCell>
        <TableCell>{antennae}</TableCell>
        <TableCell>{txNo ?? ''}</TableCell>
        <TableCell>{timeString}</TableCell>
        <TableCell>{plateNumber || ''}</TableCell>
        <TableCell colSpan={showSectorColumn ? 7 : 6}>{content}</TableCell>
      </TableRow>
      <Menu
        open={contextMenu !== null}
        onClose={handleClose}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { left: contextMenu.mouseX, top: contextMenu.mouseY }
            : undefined
        }
      >
        <MenuItem onClick={handleAddRecord}>
          Add record
        </MenuItem>
        <MenuItem onClick={handleEditRecord}>
          Edit record
        </MenuItem>
      </Menu>
    </>
  );
};

interface PassingRecordRowProps {
  lapTimeIndicators?: LapTimeIndicators;
  passing: ParticipantPassingRecord;
  raceStateLookup: RaceStateLookup;
  selectedCategories: Set<EventCategoryId> | undefined;
  selectedPlateNumber?: string;
  selectedParticipants: Set<EventParticipantId> | undefined;
  sessionValidCategoryIds?: Set<EventCategoryId>;
  onSelect?: (passingRecord: ParticipantPassingRecord) => void;
  onExclude?: (crossingId: TimeRecordId, exclude: boolean) => void;
  onChangeCategory?: (participantId: EventParticipantId, categoryId: EventCategoryId) => void;
  onOpenAddRecordDialog?: (record: EventTimeRecord) => void;
  onOpenEditRecordDialog?: (record: EventTimeRecord) => void;
  onSelectRecord?: (recordId: TimeRecordId | undefined) => void;
  onSelectUnrecognisedPlateNumber?: (plateNumber: string | undefined) => void;
  sectorTime?: number;
  selectedRecordId?: TimeRecordId;
  timeZone?: string;
  showSectorColumn?: boolean;
}

export const PassingRecordRow = (
  props: PassingRecordRowProps
): JSX.Element => {
  const passing: ParticipantPassingRecord = props.passing;
  const rs: RaceStateLookup = props.raceStateLookup;
  
  const [contextMenu, setContextMenu] = React.useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);

  const recordPlateNumber = ((passing as ParticipantPassingRecord & { plateNumber?: string | number }).plateNumber);
  const normalizedRecordPlateNumber = recordPlateNumber === undefined || recordPlateNumber === null ? undefined : recordPlateNumber.toString().trim();
  const automaticIdentifier = getAutomaticIdentifier(passing);
  const txNo = automaticIdentifier !== undefined && automaticIdentifier > 0 ? automaticIdentifier : undefined;
  const handleSelect = (): void => {
    props.onSelectRecord?.(passing.id);
    if (passing.participantId) {
      props.onSelectUnrecognisedPlateNumber?.(undefined);
    } else {
      props.onSelectUnrecognisedPlateNumber?.(normalizedRecordPlateNumber);
    }
    if (props.onSelect) {
      props.onSelect(passing);
    }
  };

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    handleSelect();

    setContextMenu(
      contextMenu === null
        ? {
          mouseX: event.clientX + 2,
          mouseY: event.clientY - 6,
        }
        : null,
    );
  };

  const handleClose = () => {
    setContextMenu(null);
  };

  const handleExclude = () => {
    if (props.onExclude) {
      props.onExclude(passing.id, !passing.isExcluded);
    }
    handleClose();
  };

  const handleChangeCategory = (categoryId: EventCategoryId) => {
    if (props.onChangeCategory && passing.participantId) {
      props.onChangeCategory(passing.participantId, categoryId);
    }
    handleClose();
  };
  const handleAddRecord = (): void => {
    props.onOpenAddRecordDialog?.(passing);
    handleClose();
  };
  const handleEditRecord = (): void => {
    props.onOpenEditRecordDialog?.(passing);
    handleClose();
  };

  let categoryStr = undefined;
  const timeString = tableTimeString(passing.time, props.timeZone);
  const identifier: string = txNo !== undefined ? `Tx${txNo}` : '';
  const antenna = (passing as ParticipantPassingRecord & { antenna?: string }).antenna || '';
  const participantMap = participantMapFromLookup(rs);
  const entrant = passing.participantId
    ? rs.getParticipantById(passing.participantId)
    : normalizedRecordPlateNumber
      ? findEntrantByPlateNumber(participantMap, normalizedRecordPlateNumber, passing.time)
      : undefined;
  let plateNumber: string | number | undefined = undefined;
  let entrantName: string | undefined = undefined;
  let lapNo: string = '';
  let elapsedTime = '--:--:--.---';
  let lapTime = '';
  const sectorTime = props.sectorTime !== undefined ? millisecondsToTime(props.sectorTime) : '';

  let className = passing.isValid ? 'passing' : 'invalid-passing';
  let cellClasses = '';

  if (passing.participantId) {
    const participant = props.raceStateLookup.getParticipantById(passing.participantId);
    const categoryLookup = props.raceStateLookup.getCategoryById.bind(props.raceStateLookup);
    categoryStr = participant ? categoryStringFromParticipant(participant, categoryLookup) : undefined;
  }

  if (entrant) {
    if (props.selectedParticipants?.has(entrant.id)) {
      className += ' selected-participant';
      cellClasses += ' selected-participant';
    }
    plateNumber = getParticipantNumber(entrant);
    entrantName = getPassingEntrantName(entrant, rs);
    const entrantLaps: ParticipantPassingRecord[] | undefined |null = rs.getParticipantLaps(entrant.id);
    if (entrantLaps) {
      // const lap = entrantLaps.find((l) => l.timeRecordId === evt.id);
      lapNo = passing.isValid ? passing?.lapNo?.toString() || '' : '';
      elapsedTime = passing?.elapsedTime ? millisecondsToTime(passing.elapsedTime) : '--:--:--.---';
      lapTime = getLapTimeCell(passing);
    }

    if (entrant?.categoryId) {
      const cat = rs.getCategoryById(entrant?.categoryId);
      if (cat) {
        if (cat.name) {
          categoryStr = cat?.name;
        }
      }

      if (props.selectedCategories?.has(entrant?.categoryId)) {
        if (!shouldExcludeCategoryFromResults(cat)) {
          className += ' selected-category';
        }
      }
    }

    if (props.sessionValidCategoryIds) {
      const entrantCategoryIds = getParticipantSessionCategoryIds(entrant, rs);
      const isRelatedToSession = entrantCategoryIds.some((categoryId) => props.sessionValidCategoryIds?.has(categoryId));
      if (!isRelatedToSession) {
        className += ' unrelated';
        cellClasses += ' unrelated';
        categoryStr = categoryStr ? `${categoryStr} (unrelated)` : 'Unrelated';
      }
    }
  }

  if (passing.isExcluded) {
    className += ' excluded';
  }
  if (passing.id === props.selectedRecordId) {
    className += ' selected-row';
  }
  if (!passing.participantId && normalizedRecordPlateNumber && normalizedRecordPlateNumber === props.selectedPlateNumber) {
    className += ' selected-plate-number';
    cellClasses += ' selected-plate-number';
  }
  if (props.lapTimeIndicators?.lapLeader) {
    className += ' lapLeader';
  }

  const allCategories = (rs as unknown as { categories: EventCategory[] }).categories || [];
  const lapTimeCellClasses = [
    cellClasses,
    'lap-time-cell',
    props.lapTimeIndicators?.entrantFaster ? 'entrantFaster' : '',
    props.lapTimeIndicators?.entrantFastest ? 'entrantFastest' : '',
    props.lapTimeIndicators?.overallFastest ? 'overallFastest' : '',
  ].filter((classItem) => classItem.length > 0).join(' ');
  const unrelatedReason = getCrossingUnrelatedReason(passing);

  return (
    <>
      <TableRow
        key={passing.id}
        data-record-id={passing.id}
        className={className}
        onContextMenu={handleContextMenu}
        style={{ cursor: 'context-menu' }}
        onClick={handleSelect}>
        <TableCell className={cellClasses}>{passing.sequence}</TableCell>
        <TableCell className={cellClasses}>{antenna}</TableCell>
        <TableCell className={cellClasses}>{identifier}</TableCell>
        <TableCell className={cellClasses}>{timeString}</TableCell>
        <TableCell className={cellClasses}>{plateNumber || normalizedRecordPlateNumber || '?'}</TableCell>
        <TableCell className={cellClasses}>{entrantName}</TableCell>
        <TableCell className={cellClasses}>{categoryStr || ''}</TableCell>
        <TableCell className={cellClasses}>{lapNo}</TableCell>
        <TableCell className={cellClasses}>{elapsedTime}</TableCell>
        {props.showSectorColumn ? <TableCell className={cellClasses}>{sectorTime}</TableCell> : null}
        <TableCell className={lapTimeCellClasses}>
          <span>{lapTime}</span>
          {unrelatedReason ? (
            <Tooltip title={unrelatedReason}>
              <span
                aria-label={unrelatedReason}
                className="unrelated-reason-marker"
                role="img"
              >
                !
              </span>
            </Tooltip>
          ) : null}
        </TableCell>
      </TableRow>
      <Menu
        open={contextMenu !== null}
        onClose={handleClose}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { left: contextMenu.mouseX, top: contextMenu.mouseY,  }
            : undefined
        }
      >
        <MenuItem onClick={handleAddRecord}>
          Add record
        </MenuItem>
        <MenuItem onClick={handleEditRecord}>
          Edit record
        </MenuItem>
        <MenuItem onClick={handleExclude}>
          {passing.isExcluded ? 'Include crossing' : 'Exclude crossing'}
        </MenuItem>
        
        {passing.participantId && allCategories.length > 0 && [
          <MenuItem key="cat-header" disabled sx={{ fontWeight: 'bold', opacity: '1 !important' }}>
            Change Category
          </MenuItem>,
          ...allCategories.map((cat) => (
            <MenuItem 
              key={cat.id} 
              onClick={() => handleChangeCategory(cat.id)}
              selected={entrant?.categoryId === cat.id}
              sx={{ pl: 4 }}
            >
              {cat.name}
            </MenuItem>
          ))
        ]}
      </Menu>
    </>
  );
};


export const RecordRow = (props: RecentRecordRowProps) => {
  const flagRecordSelected = (record: FlagRecord): void => {
    if (props.categorySelected) {
      props.categorySelected(new Set<EventCategoryId>(record.categoryIds));
    }
  };
  const record = props.record;
  if (isFlagRecord(record)) {
    return <FlagRecordRow
      record={record}
      index={props.index}
      raceStateLookup={props.raceStateLookup}
      selectedCategories={props.selectedCategories}
      selectedPlateNumber={props.selectedPlateNumber}
      selectedRecordId={props.selectedRecordId}
      onAssignFlagCategory={props.onAssignFlagCategory}
      onMarkFlagDeleted={props.onMarkFlagDeleted}
      onOpenAddRecordDialog={props.onOpenAddRecordDialog}
      onOpenEditRecordDialog={props.onOpenEditRecordDialog}
      onRemoveFlagCategory={props.onRemoveFlagCategory}
      onSelectRecord={props.onSelectRecord}
      onSelectUnrecognisedPlateNumber={props.onSelectUnrecognisedPlateNumber}
      onSelect={flagRecordSelected}
      showSectorColumn={props.showSectorColumn}
      timeZone={props.timeZone}
    />;
  }

  let passing: ParticipantPassingRecord;
  if (isCrossingRecord(record)) {
    passing = record as ParticipantPassingRecord;

    const passingRecordSelected = (passingRecord: ParticipantPassingRecord): void => {
      if (!passingRecord.participantId) {
        return;
      }

      const selectionParticipant: EventParticipant|undefined = props.raceStateLookup.getParticipantById(passingRecord.participantId);
      if (!selectionParticipant) {
        return;
      }

      if (props.selectedParticipants?.has(selectionParticipant.id)) {
        props.onSelectRecord?.(undefined);
        if (props.participantSelected !== undefined) {
          props.participantSelected(new Set<EventParticipantId>());
        }
        if (props.categorySelected) {
          props.categorySelected(new Set<EventCategoryId>());
        }
        return;
      }

      props.onSelectRecord?.(passingRecord.id);
      if (props.participantSelected !== undefined) {
        const selectedEntrants: Set<EventParticipantId> = new Set<EventParticipantId>();
        selectedEntrants.add(selectionParticipant.id);
        props.participantSelected(selectedEntrants);
      }

      if (props.categorySelected && selectionParticipant?.categoryId) {
        const categorySet = new Set<EventCategoryId>();
        categorySet.add(selectionParticipant.categoryId);
        props.categorySelected(categorySet);
      }
    };

    return <PassingRecordRow
      lapTimeIndicators={props.lapTimeIndicators}
      raceStateLookup={props.raceStateLookup}
      passing={passing}
      selectedCategories={props.selectedCategories}
      selectedPlateNumber={props.selectedPlateNumber}
      selectedParticipants={props.selectedParticipants}
      sectorTime={props.sectorTimesByRecordId?.get(passing.id)}
      sessionValidCategoryIds={props.sessionValidCategoryIds}
      selectedRecordId={props.selectedRecordId}
      showSectorColumn={props.showSectorColumn}
      onSelect={passingRecordSelected}
      onExclude={props.onExclude}
      onChangeCategory={props.onChangeCategory}
      onOpenAddRecordDialog={props.onOpenAddRecordDialog}
      onOpenEditRecordDialog={props.onOpenEditRecordDialog}
      onSelectRecord={props.onSelectRecord}
      onSelectUnrecognisedPlateNumber={props.onSelectUnrecognisedPlateNumber}
      timeZone={props.timeZone}
    />;
  }

  const identifier = getTimeRecordIdentifier(record, true);
  const automaticIdentifier = getAutomaticIdentifier(record);
  const txNo = automaticIdentifier !== undefined && automaticIdentifier > 0 ? automaticIdentifier : undefined;
  const plateNumber = ((record as EventTimeRecord & { plateNumber?: string | number }).plateNumber);
  const normalizedPlateNumber = plateNumber === undefined || plateNumber === null ? undefined : plateNumber.toString();
  // if (!plateNumber) {
  return <UnknownChipRow
    sequenceNumber={record.sequence}
    timeRecordId={record.id}
    antennae='?'
    onOpenAddRecordDialog={props.onOpenAddRecordDialog}
    onOpenEditRecordDialog={props.onOpenEditRecordDialog}
    onSelectRecord={props.onSelectRecord}
    onSelectUnrecognisedPlateNumber={props.onSelectUnrecognisedPlateNumber}
    passingTime={record.time!}
    plateNumber={normalizedPlateNumber}
    record={record}
    selectedPlateNumber={props.selectedPlateNumber}
    selectedRecordId={props.selectedRecordId}
    showSectorColumn={props.showSectorColumn}
    txNo={txNo}
    identifier={identifier}
    rs={props.raceStateLookup}
    timeZone={props.timeZone}
  />;
  // (passing, rs, identifier, ant, timeString);
  // }
  // const plateNumberString: string = plateNumber?.toString() || '';

  // if (!entrantName) {
  //   entrantName = '';
  // } 

  // let categoryName = 'No category';
  // const timeString = tableTimeString(record.time);

  // return (<>
  //   <TableRow key={record.id} data-record-id={record.id}>
  //     <TableCell>{record.sequence}</TableCell>
  //     <TableCell>Ant</TableCell>
  //     <TableCell>Tx</TableCell>
  //     <TableCell>{timeString}</TableCell>
  //     <TableCell>No</TableCell>
  //     <TableCell>Entrant</TableCell>
  //     <TableCell>{categoryStr || ''}</TableCell>
  //     <TableCell>Category</TableCell>
  //     <TableCell>Lap#</TableCell>
  //     <TableCell>Elapsed</TableCell>
  //     <TableCell>Lap time</TableCell>
  //   </TableRow>
  // </>);
};

const warnings: string[] = [];

const _formatGridTime = (params: { value: Date | string }) => {
  if (typeof params.value === 'string') {
    return params.value;
  }
  if (params.value instanceof Date) {
    return params.value.toLocaleString();
  }
  return '';
};

export const Warnings = ({ warnings }: { warnings: string[] }): JSX.Element => {
  if (!warnings || warnings.length === 0) {
    return <></>;
  }
  return (
    <Box sx={{ backgroundColor: 'yellow', marginBottom: 2, padding: 2 }}>
      <h3>Warnings</h3>
      <ul>
        {warnings.map((warning, index) => (
          <li key={index}>{warning}</li>
        ))}
      </ul>
    </Box>
  );
};

const getHeadings = (showSectorColumn: boolean): string[] => ([
  'Seq',
  'Antenna',
  'TxNo',
  'Time',
  'Number',
  'Entrant',
  'Category',
  'Lap#',
  'Elapsed Time',
  ...(showSectorColumn ? ['Sector'] : []),
  'Lap Time',
]);

const recordMatchesSelectedCategory = (
  record: EventTimeRecord,
  raceStateLookup: RaceStateLookup,
  selectedCategories: Set<EventCategoryId>
): boolean => {
  if (selectedCategories.size === 0) {
    return false;
  }

  if (isFlagRecord(record)) {
    return record.categoryIds?.some((categoryId) => selectedCategories.has(categoryId)) || false;
  }

  if (!isCrossingRecord(record) || !record.participantId) {
    return false;
  }

  const participant = raceStateLookup.getParticipantById(record.participantId);
  const category = participant?.categoryId ? raceStateLookup.getCategoryById(participant.categoryId) : undefined;
  return !!participant?.categoryId && selectedCategories.has(participant.categoryId) && !shouldExcludeCategoryFromResults(category);
};

const selectedTeamMemberIds = (
  raceStateLookup: RaceStateLookup,
  selectedParticipants: Set<EventParticipantId>
): Set<EventParticipantId> => {
  const teams = (raceStateLookup as unknown as { teams?: EventTeam[] }).teams || [];
  const selectedTeam = teams.find((team) => team.members.some((memberId) => selectedParticipants.has(memberId)));

  return new Set<EventParticipantId>(selectedTeam?.members || []);
};

const recordMatchesSelectedParticipants = (
  record: EventTimeRecord,
  selectedParticipants: Set<EventParticipantId>
): boolean => {
  return isCrossingRecord(record) && !!record.participantId && selectedParticipants.has(record.participantId);
};

const getFlagCategoryIds = (flag: FlagRecord): EventCategoryId[] => {
  const categoryId = (flag as FlagRecord & { categoryId?: EventCategoryId }).categoryId;
  return [...(flag.categoryIds || []), ...(categoryId ? [categoryId] : [])];
};

const isStartFlag = (flag: FlagRecord): boolean => {
  const normalizedFlagType = flag.flagType?.toLowerCase();
  return normalizedFlagType === 'green' && (flag as FlagRecord & { indicatesRaceStart?: boolean }).indicatesRaceStart !== false;
};

const isSystemGeneratedFlag = (record: EventTimeRecord): boolean => {
  return isFlagRecord(record) && record.systemGenerated === true && !isStartFlag(record);
};

const isFinishFlag = (flag: FlagRecord): boolean => {
  const normalizedFlagType = flag.flagType?.toLowerCase();
  return normalizedFlagType === 'chequered' || normalizedFlagType === 'finish' || (flag.recordType & EVENT_SESSION_END) > 0;
};

const compareRecordsByTimeAndInputOrder = (
  left: { index: number; record: EventTimeRecord },
  right: { index: number; record: EventTimeRecord }
): number => {
  const leftTime = left.record.time?.getTime();
  const rightTime = right.record.time?.getTime();

  if (leftTime === undefined && rightTime === undefined) {
    return left.index - right.index;
  }
  if (leftTime === undefined) {
    return 1;
  }
  if (rightTime === undefined) {
    return -1;
  }
  return leftTime === rightTime ? left.index - right.index : leftTime - rightTime;
};

const getKnownCategoryIds = (raceStateLookup: RaceStateLookup): EventCategoryId[] => {
  return ((raceStateLookup as unknown as { categories?: EventCategory[] }).categories || []).map((category) => category.id);
};

const buildCategoryStartTimes = (
  records: EventTimeRecord[],
  raceStateLookup: RaceStateLookup
): Map<EventCategoryId, Date> => {
  const categoryStartTimes = new Map<EventCategoryId, Date>();
  const knownCategoryIds = getKnownCategoryIds(raceStateLookup);

  records.forEach((record) => {
    if (!isFlagRecord(record) || !isStartFlag(record) || !record.time) {
      return;
    }

    const categoryIds = getFlagCategoryIds(record);
    const affectedCategoryIds = categoryIds.length > 0 ? categoryIds : knownCategoryIds;
    affectedCategoryIds.forEach((categoryId) => {
      const existingStartTime = categoryStartTimes.get(categoryId);
      if (!existingStartTime || existingStartTime.getTime() < record.time!.getTime()) {
        categoryStartTimes.set(categoryId, record.time!);
      }
    });
  });

  return categoryStartTimes;
};

const isUnrecognisedCrossing = (
  record: EventTimeRecord,
  raceStateLookup: RaceStateLookup
): boolean => {
  if (isFlagRecord(record) || !isCrossingRecord(record)) {
    return false;
  }
  if (!record.participantId) {
    return true;
  }

  const participant = raceStateLookup.getParticipantById(record.participantId);
  if (!participant?.categoryId) {
    return true;
  }
  const category = raceStateLookup.getCategoryById(participant.categoryId);
  return !category || shouldExcludeCategoryFromResults(category);
};

const getPostFinishAcceptanceKeys = (
  categoryId: EventCategoryId,
  entrantKey: string,
  eventFinished: boolean,
  finishedCategoryIds: Set<EventCategoryId>
): string[] => {
  const acceptanceKeys: string[] = [];

  if (eventFinished) {
    acceptanceKeys.push(`event:${entrantKey}`);
  }
  if (finishedCategoryIds.has(categoryId)) {
    acceptanceKeys.push(`category:${categoryId}:${entrantKey}`);
  }

  return acceptanceKeys;
};

const getEntrantKey = (
  participant: EventParticipant,
  raceStateLookup: RaceStateLookup
): string => {
  return raceStateLookup.getEntrantIdForParticipant(participant.id)?.toString() ||
    participant.entrantId?.toString() ||
    participant.id.toString();
};

const createEmptyLapTimeIndicators = (): LapTimeIndicators => ({
  entrantFaster: false,
  entrantFastest: false,
  lapLeader: false,
  overallFastest: false,
});

const buildLapTimeIndicatorMap = (
  records: EventTimeRecord[],
  raceStateLookup: RaceStateLookup,
  sessionKind: EventSessionKind | undefined = 'race'
): Map<TimeRecordId, LapTimeIndicators> => {
  const indicatorsByRecordId = new Map<TimeRecordId, LapTimeIndicators>();
  const bestLapTimeByEntrant = new Map<string, MillisecondsDuration>();
  const previousLapTimeByEntrant = new Map<string, MillisecondsDuration>();
  const leadingLapNumbers = new Set<number>();
  const isRaceSession = sessionKind === undefined || sessionKind === 'race';
  let overallBestLapTime: MillisecondsDuration | undefined = undefined;

  records
    .map((record, index) => ({ index, record }))
    .sort(compareRecordsByTimeAndInputOrder)
    .forEach(({ record }) => {
      if (!isCrossingRecord(record) || !record.participantId || !record.isValid || record.isExcluded || record.isLapCompletion === false) {
        return;
      }

      const passingRecord = record as ParticipantPassingRecord;
      const lapNo = passingRecord.lapNo;
      const lapTime = passingRecord.lapTime;
      if (lapNo === undefined || lapNo === null || lapTime === undefined || lapTime === null || lapTime <= 0) {
        return;
      }

      const participant = raceStateLookup.getParticipantById(record.participantId);
      if (!participant) {
        return;
      }

      const indicators = createEmptyLapTimeIndicators();
      const entrantKey = getEntrantKey(participant, raceStateLookup);
      const previousLapTime = previousLapTimeByEntrant.get(entrantKey);
      const entrantBestLapTime = bestLapTimeByEntrant.get(entrantKey);

      if (isRaceSession && !leadingLapNumbers.has(lapNo)) {
        indicators.lapLeader = true;
        leadingLapNumbers.add(lapNo);
      }
      if (previousLapTime !== undefined && lapTime < previousLapTime) {
        indicators.entrantFaster = true;
      }
      if (entrantBestLapTime === undefined || lapTime < entrantBestLapTime) {
        indicators.entrantFastest = true;
        bestLapTimeByEntrant.set(entrantKey, lapTime);
      }
      if (overallBestLapTime === undefined || lapTime < overallBestLapTime) {
        indicators.overallFastest = true;
        if (!isRaceSession) {
          indicators.lapLeader = true;
        }
        overallBestLapTime = lapTime;
      }

      previousLapTimeByEntrant.set(entrantKey, lapTime);
      indicatorsByRecordId.set(record.id, indicators);
    });

  return indicatorsByRecordId;
};

const buildSectorTimesByRecordId = (
  records: EventTimeRecord[],
  raceStateLookup: RaceStateLookup
): Map<TimeRecordId, number> => {
  const sectorTimesByRecordId = new Map<TimeRecordId, number>();
  const previousCrossingsByParticipant = new Map<EventParticipantId, ParticipantPassingRecord[]>();
  const finishLineNumbers = raceStateLookup.getFinishLineNumbers?.();

  records
    .map((record, index) => ({ index, record }))
    .sort(compareRecordsByTimeAndInputOrder)
    .forEach(({ record }) => {
      if (!isCrossingRecord(record) || !record.participantId || !record.time) {
        return;
      }

      const previousCrossings = previousCrossingsByParticipant.get(record.participantId) || [];
      const currentLineKey = getTimingLineKey(record, finishLineNumbers);
      const previousCrossingOnAnotherLine = [...previousCrossings]
        .reverse()
        .find((crossing) => crossing.time && getTimingLineKey(crossing, finishLineNumbers) !== currentLineKey);

      if (previousCrossingOnAnotherLine?.time) {
        sectorTimesByRecordId.set(record.id, record.time.getTime() - previousCrossingOnAnotherLine.time.getTime());
      }

      previousCrossings.push(record);
      previousCrossingsByParticipant.set(record.participantId, previousCrossings);
    });

  return sectorTimesByRecordId;
};

const shouldShowSectorColumnForLookup = (
  records: EventTimeRecord[],
  raceStateLookup: RaceStateLookup
): boolean => {
  const lineKeys = new Set<string>();
  const finishLineNumbers = raceStateLookup.getFinishLineNumbers?.();
  records.forEach((record) => {
    if (!isCrossingRecord(record)) {
      return;
    }
    lineKeys.add(getTimingLineKey(record, finishLineNumbers));
  });
  return lineKeys.size > 1;
};

const getOutsideEventWindowIgnoredRecordIds = (
  records: EventTimeRecord[],
  raceStateLookup: RaceStateLookup
): Set<string> => {
  const ignoredRecordIds = new Set<string>();
  const categoryStartTimes = buildCategoryStartTimes(records, raceStateLookup);
  const finishedCategoryIds = new Set<EventCategoryId>();
  const acceptedPostFinishKeys = new Set<string>();
  let eventFinished = false;

  records
    .map((record, index) => ({ index, record }))
    .sort(compareRecordsByTimeAndInputOrder)
    .forEach(({ record }) => {
      if (isFlagRecord(record)) {
        if (isFinishFlag(record)) {
          const categoryIds = getFlagCategoryIds(record);
          if (categoryIds.length === 0) {
            eventFinished = true;
          } else {
            categoryIds.forEach((categoryId) => finishedCategoryIds.add(categoryId));
          }
        }
        return;
      }

      if (!isCrossingRecord(record) || !record.time || !record.participantId) {
        return;
      }

      const participant = raceStateLookup.getParticipantById(record.participantId);
      const categoryId = participant?.categoryId;
      if (!participant || !categoryId || !raceStateLookup.getCategoryById(categoryId)) {
        return;
      }

      const categoryStartTime = categoryStartTimes.get(categoryId);
      if (categoryStartTime && record.time.getTime() < categoryStartTime.getTime()) {
        ignoredRecordIds.add(record.id.toString());
        return;
      }

      const entrantKey = getEntrantKey(participant, raceStateLookup);
      const acceptanceKeys = getPostFinishAcceptanceKeys(categoryId, entrantKey, eventFinished, finishedCategoryIds);
      if (acceptanceKeys.length > 0) {
        if (acceptanceKeys.some((key) => acceptedPostFinishKeys.has(key))) {
          ignoredRecordIds.add(record.id.toString());
          return;
        }
        acceptanceKeys.forEach((key) => acceptedPostFinishKeys.add(key));
      }
    });

  return ignoredRecordIds;
};

const shouldIgnoreRecord = (
  record: EventTimeRecord,
  ignoredRecordIds: Set<string>,
  ignoreModes: RecentRecordsIgnoreMode[],
  raceStateLookup: RaceStateLookup
): boolean => {
  if (ignoreModes.includes('outsideEventWindow') && ignoredRecordIds.has(record.id.toString())) {
    return true;
  }
  if (ignoreModes.includes('sectorLoops') && isNonLapCrossing(record, raceStateLookup)) {
    return true;
  }
  return ignoreModes.includes('unrecognised') && isUnrecognisedCrossing(record, raceStateLookup);
};

const isNonLapCrossing = (
  record: EventTimeRecord,
  raceStateLookup: RaceStateLookup
): boolean => {
  if (!isCrossingRecord(record)) {
    return false;
  }
  if (record.isLapCompletion === false) {
    return true;
  }
  const effectiveLoopNumber = getPassingLoopNumber(record) ?? getPassingLineNumber(record);
  if (effectiveLoopNumber === undefined) {
    return false;
  }

  return effectiveLoopNumber !== 1 && !isFinishLinePassing(record, raceStateLookup.getFinishLineNumbers?.());
};

interface AddRecordDialogProps {
  currentEventId?: string;
  currentSessionId?: string;
  onClose: () => void;
  onSave: (record: EventTimeRecord, mode: RecordDialogMode) => void;
  openState: AddRecordDialogState | null;
  raceStateLookup: RaceStateLookup;
  records: EventTimeRecord[];
}

const AddRecordDialog = (props: AddRecordDialogProps): JSX.Element => {
  const anchorRecord = props.openState?.anchorRecord;
  const dialogMode = props.openState?.mode || 'add';
  const editingRecord = props.openState?.existingRecord;
  const categories = (props.raceStateLookup as unknown as { categories?: EventCategory[] }).categories || [];
  const participantMap = React.useMemo(() => participantMapFromLookup(props.raceStateLookup), [props.raceStateLookup]);
  const participants = React.useMemo(() => participantArrayFromLookup(props.raceStateLookup), [props.raceStateLookup]);
  const [timeOfDay, setTimeOfDay] = React.useState<string>('');
  const [recordType, setRecordType] = React.useState<AddableRecordType>('passing');
  const [flagType, setFlagType] = React.useState<AddableFlagType>('green');
  const [selectedFlagCategoryIds, setSelectedFlagCategoryIds] = React.useState<EventCategoryId[]>([]);
  const [passingTxNo, setPassingTxNo] = React.useState<string>('');
  const [passingPlate, setPassingPlate] = React.useState<string>('');
  const [passingAntenna, setPassingAntenna] = React.useState<string>('');
  const [timeError, setTimeError] = React.useState<string>('');

  React.useEffect(() => {
    if (!anchorRecord) {
      return;
    }
    if (dialogMode === 'edit' && editingRecord) {
      setTimeOfDay(formatManualTimeOfDay(editingRecord.time));
      setRecordType(isFlagRecord(editingRecord) ? 'flag' : 'passing');
      setFlagType(isFlagRecord(editingRecord) ? editingRecord.flagType as AddableFlagType : 'green');
      setSelectedFlagCategoryIds(getEditableFlagCategoryIds(editingRecord));
      setPassingTxNo(getEditablePassingTxNo(editingRecord));
      setPassingPlate(getEditablePassingPlate(editingRecord, props.raceStateLookup));
      setPassingAntenna(getEditablePassingAntenna(editingRecord));
    } else {
      setTimeOfDay(formatManualTimeOfDay(anchorRecord.time));
      setRecordType('passing');
      setFlagType('green');
      setSelectedFlagCategoryIds([]);
      setPassingTxNo('');
      setPassingPlate('');
      setPassingAntenna('');
    }
    setTimeError('');
  }, [anchorRecord, dialogMode, editingRecord, props.raceStateLookup]);

  const txOptions = React.useMemo(() => {
    return participants
      .flatMap((participant) => getParticipantTransponders(participant))
      .map((identifier) => identifier.toString())
      .filter((value, index, array) => value.length > 0 && array.indexOf(value) === index)
      .sort();
  }, [participants]);

  const plateOptions = React.useMemo(() => {
    return participants
      .map((participant) => getParticipantNumber(participant))
      .filter((value): value is string | number => value !== undefined)
      .map((value) => value.toString())
      .filter((value, index, array) => value.length > 0 && array.indexOf(value) === index)
      .sort();
  }, [participants]);

  const resolvedParticipant = React.useMemo(() => {
    return resolveParticipantForManualEntry(participantMap, passingTxNo, passingPlate);
  }, [participantMap, passingPlate, passingTxNo]);

  const resolvedCategory = resolvedParticipant?.categoryId ? props.raceStateLookup.getCategoryById(resolvedParticipant.categoryId) : undefined;
  const resolvedEntrantName = resolvedParticipant ? `${resolvedParticipant.firstname || ''} ${resolvedParticipant.surname || ''}`.trim() : '';
  const resolvedTeamName = getParticipantTeamName(resolvedParticipant, props.raceStateLookup);
  const resolvedCategoryName = resolvedCategory?.name || '';
  const editablePassingRecord = editingRecord && isCrossingRecord(editingRecord) ? editingRecord : undefined;
  const editablePassingLineNumber = editablePassingRecord ? getPassingLineNumber(editablePassingRecord) : undefined;
  const editablePassingLoopNumber = editablePassingRecord ? getPassingLoopNumber(editablePassingRecord) : undefined;
  const editablePassingLapControl = editablePassingRecord ? (isLapControlCrossing(editablePassingRecord, props.raceStateLookup) ? 'Yes' : 'No') : '';
  const editableFinishLineNumbers = editablePassingRecord ? formatFinishLineNumbers(props.raceStateLookup) : '';

  const handleTxNoChange = (value: string): void => {
    setPassingTxNo(value);
    const matchedParticipant = resolveParticipantForManualEntry(participantMap, value, '');
    const matchedPlate = matchedParticipant ? getParticipantNumber(matchedParticipant) : undefined;
    if (matchedPlate !== undefined) {
      setPassingPlate(matchedPlate.toString());
    }
  };

  const handleSave = (): void => {
    if (!anchorRecord) {
      return;
    }
    const parsedTime = parseManualTimeOfDay(anchorRecord.time, timeOfDay);
    if (!parsedTime) {
      setTimeError('Enter a valid time of day like 09:15:03.250');
      return;
    }
    setTimeError('');
    if (recordType === 'passing' && passingTxNo.trim().length === 0 && passingPlate.trim().length === 0) {
      setTimeError('Enter a TxNo or Plate for a passing record');
      return;
    }
    const record = recordType === 'flag'
      ? buildManualFlagRecord(
        anchorRecord,
        props.currentEventId,
        props.currentSessionId,
        props.records,
        parsedTime,
        flagType,
        selectedFlagCategoryIds,
        editingRecord
      )
      : buildManualPassingRecord(
        anchorRecord,
        props.currentEventId,
        props.currentSessionId,
        props.records,
        parsedTime,
        passingTxNo,
        passingPlate,
        passingAntenna,
        editingRecord
      );
    props.onSave(record, dialogMode);
    props.onClose();
  };

  return (
    <Dialog fullWidth maxWidth="md" onClose={props.onClose} open={props.openState !== null}>
      <DialogTitle>{dialogMode === 'edit' ? 'Edit record' : 'Add record'}</DialogTitle>
      <DialogContent>
        <div className="event-details-form-grid">
          <TextField
            autoFocus
            error={timeError.length > 0}
            helperText={timeError || ' '}
            label="Time of day"
            margin="dense"
            onChange={(event) => setTimeOfDay(event.target.value)}
            slotProps={{ htmlInput: { 'aria-label': 'Time of day' } }}
            value={timeOfDay}
          />
          <div className="event-details-form-row">
            <label className="page-filter-label">
              Record type
              <select
                aria-label="Record type"
                onChange={(event) => setRecordType(event.target.value as AddableRecordType)}
                value={recordType}
              >
                <option value="passing">Passing</option>
                <option value="flag">Flag</option>
              </select>
            </label>
            {recordType === 'flag' ? (
              <label className="page-filter-label">
                Flag type
                <select
                  aria-label="Flag type"
                  onChange={(event) => setFlagType(event.target.value as AddableFlagType)}
                  value={flagType}
                >
                  {(Object.keys(manualFlagLabelByType) as AddableFlagType[]).map((value) => (
                    <option key={value} value={value}>{manualFlagLabelByType[value]}</option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          {recordType === 'flag' ? (
            <FormControl fullWidth margin="dense">
              <InputLabel id="manual-record-categories-label" shrink>For category</InputLabel>
              <Select
                displayEmpty
                id="manual-record-categories"
                label="For category"
                labelId="manual-record-categories-label"
                multiple
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedFlagCategoryIds(typeof value === 'string' ? value.split(',') as EventCategoryId[] : value as EventCategoryId[]);
                }}
                renderValue={(selected) => (selected as string[]).length > 0
                  ? categories
                    .filter((category) => (selected as string[]).includes(category.id))
                    .map((category) => category.name || category.id)
                    .join(', ')
                  : 'All'}
                value={selectedFlagCategoryIds}
              >
                {categories.map((category) => (
                  <MenuItem key={category.id} value={category.id}>
                    <Checkbox checked={selectedFlagCategoryIds.includes(category.id)} />
                    <ListItemText primary={category.name || category.id} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : (
            <>
              <div className="event-details-form-row">
                <TextField
                  label="TxNo"
                  margin="dense"
                  onChange={(event) => handleTxNoChange(event.target.value)}
                  slotProps={{ htmlInput: { 'aria-label': 'TxNo', list: 'manual-record-tx-options' } }}
                  value={passingTxNo}
                />
                <TextField
                  label="Plate"
                  margin="dense"
                  onChange={(event) => setPassingPlate(event.target.value)}
                  slotProps={{ htmlInput: { 'aria-label': 'Plate', list: 'manual-record-plate-options' } }}
                  value={passingPlate}
                />
                <TextField
                  label="Antenna"
                  margin="dense"
                  onChange={(event) => setPassingAntenna(event.target.value)}
                  slotProps={{ htmlInput: { 'aria-label': 'Antenna' } }}
                  value={passingAntenna}
                />
              </div>
              <datalist id="manual-record-tx-options">
                {txOptions.map((option) => <option key={option} value={option} />)}
              </datalist>
              <datalist id="manual-record-plate-options">
                {plateOptions.map((option) => <option key={option} value={option} />)}
              </datalist>
              <div className="event-details-form-row">
                <TextField disabled label="Entrant name" margin="dense" slotProps={{ htmlInput: { 'aria-label': 'Entrant name' } }} value={resolvedEntrantName} />
                <TextField disabled label="Team name" margin="dense" slotProps={{ htmlInput: { 'aria-label': 'Team name' } }} value={resolvedTeamName} />
                <TextField disabled label="Category name" margin="dense" slotProps={{ htmlInput: { 'aria-label': 'Category name' } }} value={resolvedCategoryName} />
              </div>
              {dialogMode === 'edit' && editablePassingRecord ? (
                <div className="event-details-form-row">
                  <TextField disabled label="Timing line" margin="dense" slotProps={{ htmlInput: { 'aria-label': 'Timing line' } }} value={formatOptionalNumber(editablePassingLineNumber)} />
                  <TextField disabled label="Timing loop" margin="dense" slotProps={{ htmlInput: { 'aria-label': 'Timing loop' } }} value={formatOptionalNumber(editablePassingLoopNumber)} />
                  <TextField disabled label="Lap control lines" margin="dense" slotProps={{ htmlInput: { 'aria-label': 'Lap control lines' } }} value={editableFinishLineNumbers} />
                  <TextField disabled label="Lap crossing" margin="dense" slotProps={{ htmlInput: { 'aria-label': 'Lap crossing' } }} value={editablePassingLapControl} />
                </div>
              ) : null}
            </>
          )}
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">{dialogMode === 'edit' ? 'Save record' : 'Add record'}</Button>
      </DialogActions>
    </Dialog>
  );
};

// const RecordTable = (props: RecordTableProps) => {

// };

export const RecentRecords = (props: RecordsProps & { 
  onAssignFlagCategory?: (flagId: TimeRecordId, categoryId: EventCategoryId) => void,
  onAddRecord?: (record: EventTimeRecord) => void,
  onEditRecord?: (record: EventTimeRecord) => void,
  onExclude?: (crossingId: TimeRecordId, exclude: boolean) => void,
  onChangeCategory?: (participantId: EventParticipantId, categoryId: EventCategoryId) => void,
  onMarkFlagDeleted?: (flagId: TimeRecordId, deleted: boolean) => void,
  onRemoveFlagCategory?: (flagId: TimeRecordId, categoryId: EventCategoryId) => void
}) => {
  const [addRecordDialogState, setAddRecordDialogState] = React.useState<AddRecordDialogState | null>(null);
  const [recentFirst, setRecentFirst] = React.useState<boolean>(false);
  const [filterMode, setFilterMode] = React.useState<RecentRecordsFilterMode>('all');
  const [ignoreModes, setIgnoreModes] = React.useState<RecentRecordsIgnoreMode[]>([]);
  const [selectedPlateNumber, setSelectedPlateNumber] = React.useState<string | undefined>(undefined);
  const [selectedRecordId, setSelectedRecordId] = React.useState<TimeRecordId | undefined>(undefined);
  const toolbarAnchorRef = React.useRef<HTMLDivElement>(null);
  const toolbarRef = React.useRef<HTMLDivElement>(null);
  const [toolbarDock, setToolbarDock] = React.useState({
    height: 0,
    isDocked: false,
    left: 0,
    width: 0,
  });
  const timeDisplayZoneMode = props.timeDisplayZoneMode || 'event';
  const displayTimeZone = resolveDisplayTimeZone(timeDisplayZoneMode, props.eventTimeZone);
  const selectedCategories = props.selectedCategories || new Set<EventCategoryId>();
  const emptySelectedParticipants = React.useMemo(() => new Set<EventParticipantId>(), []);
  const propSelectedParticipants = props.selectedParticipants || emptySelectedParticipants;
  const propSelectedParticipantKey = Array.from(propSelectedParticipants).sort().join('\0');
  const [localSelectedParticipants, setLocalSelectedParticipants] = React.useState<Set<EventParticipantId>>(
    () => new Set<EventParticipantId>(propSelectedParticipants)
  );
  React.useEffect(() => {
    setLocalSelectedParticipants(new Set<EventParticipantId>(propSelectedParticipants));
  }, [propSelectedParticipantKey]);
  const selectedParticipants = localSelectedParticipants;
  const teamMemberIds = selectedTeamMemberIds(props.raceStateLookup, selectedParticipants);
  const highlightedParticipantIds = new Set<EventParticipantId>([
    ...selectedParticipants,
    ...teamMemberIds,
  ]);
  const selectableCategories = (props.raceStateLookup as unknown as { categories?: EventCategory[] }).categories || [];
  const selectedCategoryIds = Array.from(selectedCategories);
  const selectedCategoryNames = selectedCategoryIds.map((categoryId) => {
    return selectableCategories.find((category) => category.id === categoryId)?.name || categoryId;
  });
  const outsideEventWindowIgnoredRecordIds = React.useMemo(() => {
    return getOutsideEventWindowIgnoredRecordIds(props.records || [], props.raceStateLookup);
  }, [props.records, props.raceStateLookup]);
  React.useEffect(() => {
    const selectedFilterHasNoTarget =
      (filterMode === 'category' && selectedCategories.size === 0) ||
      (filterMode === 'participant' && selectedParticipants.size === 0) ||
      (filterMode === 'team' && teamMemberIds.size === 0);

    if (selectedFilterHasNoTarget) {
      setFilterMode('all');
    }
  }, [filterMode, selectedCategories, selectedParticipants, teamMemberIds]);
  React.useLayoutEffect(() => {
    const updateToolbarDock = (): void => {
      const anchor = toolbarAnchorRef.current;
      const toolbar = toolbarRef.current;
      if (!anchor || !toolbar) {
        return;
      }

      const anchorRect = anchor.getBoundingClientRect();
      const toolbarRect = toolbar.getBoundingClientRect();
      const nextDock = {
        height: toolbarRect.height,
        isDocked: anchorRect.top <= 0,
        left: anchorRect.left,
        width: anchorRect.width,
      };

      setToolbarDock((current) => {
        return current.height === nextDock.height &&
          current.isDocked === nextDock.isDocked &&
          current.left === nextDock.left &&
          current.width === nextDock.width
          ? current
          : nextDock;
      });
    };

    updateToolbarDock();
    window.addEventListener('resize', updateToolbarDock);
    window.addEventListener('scroll', updateToolbarDock, true);

    return () => {
      window.removeEventListener('resize', updateToolbarDock);
      window.removeEventListener('scroll', updateToolbarDock, true);
    };
  }, []);

  const filteredRecords = (props.records || []).filter((record) => {
    if (isSystemGeneratedFlag(record)) {
      return false;
    }
    if (shouldIgnoreRecord(record, outsideEventWindowIgnoredRecordIds, ignoreModes, props.raceStateLookup)) {
      return false;
    }
    if (filterMode === 'all') {
      return true;
    }
    if (filterMode === 'category') {
      return recordMatchesSelectedCategory(record, props.raceStateLookup, selectedCategories);
    }
    if (filterMode === 'participant') {
      return recordMatchesSelectedParticipants(record, selectedParticipants);
    }
    return recordMatchesSelectedParticipants(record, teamMemberIds);
  });
  const sortedRecords = [...filteredRecords].sort((a, b) => {
    if (recentFirst) {
      return b.time!.getTime() - a.time!.getTime();
    } else {
      return a.time!.getTime() - b.time!.getTime();
    }
  });
  const lapTimeIndicators = buildLapTimeIndicatorMap(filteredRecords, props.raceStateLookup, props.sessionKind);
  const showSectorColumn = shouldShowSectorColumnForLookup(filteredRecords, props.raceStateLookup);
  const sectorTimesByRecordId = showSectorColumn ? buildSectorTimesByRecordId(filteredRecords, props.raceStateLookup) : new Map<TimeRecordId, number>();
  const headings = getHeadings(showSectorColumn);
  const fastestTimeIndicatorColors = props.fastestTimeIndicatorColors || DEFAULT_FASTEST_TIME_INDICATOR_COLORS;
  const tableContainerStyle = {
    '--entrant-faster-time-color': fastestTimeIndicatorColors.entrantFasterTime,
    '--entrant-fastest-time-color': fastestTimeIndicatorColors.entrantFastestTime,
    '--recent-records-table-header-top': toolbarDock.isDocked ? `${toolbarDock.height}px` : '0px',
    '--session-fastest-time-color': fastestTimeIndicatorColors.sessionFastestTime,
  } as React.CSSProperties;
  const openAddRecordDialog = (record: EventTimeRecord): void => {
    setAddRecordDialogState({ anchorRecord: record, mode: 'add' });
  };
  const openEditRecordDialog = (record: EventTimeRecord): void => {
    setAddRecordDialogState({ anchorRecord: record, existingRecord: record, mode: 'edit' });
  };
  const handleParticipantSelected = (participantIds: Set<EventParticipantId>): void => {
    setSelectedPlateNumber(undefined);
    setLocalSelectedParticipants(new Set<EventParticipantId>(participantIds));
    props.participantSelected?.(participantIds);
  };

  return <>
    <AddRecordDialog
      currentEventId={props.currentEventId}
      currentSessionId={props.currentSessionId}
      onClose={() => setAddRecordDialogState(null)}
      onSave={(record, mode) => {
        if (mode === 'edit') {
          props.onEditRecord?.(record);
          return;
        }
        props.onAddRecord?.(record);
      }}
      openState={addRecordDialogState}
      raceStateLookup={props.raceStateLookup}
      records={props.records}
    />
    <div
      className="recent-records-toolbar-anchor"
      ref={toolbarAnchorRef}
      style={toolbarDock.isDocked ? { height: toolbarDock.height } : undefined}
    >
      <div
        className={`recent-records-toolbar${toolbarDock.isDocked ? ' docked' : ''}`}
        ref={toolbarRef}
        style={toolbarDock.isDocked ? { left: toolbarDock.left, top: 0, width: toolbarDock.width } : undefined}
      >
        <h2 className="recent-records">Recent Records</h2>
        <FormControl
          fullWidth={false}
          id="recent-records-category-dropdown"
          sx={{ display: 'inline-block', minWidth: 220, verticalAlign: 'middle' }}
        >
          <InputLabel id="show-recent-categories-label" shrink>Categories</InputLabel>
          <Select
            displayEmpty
            multiple
            id="show-recent-categories"
            label="Categories"
            value={selectedCategoryIds}
            sx={{ minWidth: 180 }}
            onChange={(event) => {
              const value = event.target.value;
              const categoryIds = typeof value === 'string' ? value.split(',') : value;
              setLocalSelectedParticipants(new Set<EventParticipantId>());
              props.categorySelected?.(new Set<EventCategoryId>(categoryIds as EventCategoryId[]));
            }}
            renderValue={() => selectedCategoryNames.length > 0 ? selectedCategoryNames.join(', ') : 'All categories'}>
            {selectableCategories.map((category) => (
              <MenuItem key={category.id} value={category.id}>
                <Checkbox checked={selectedCategories.has(category.id)} />
                <ListItemText primary={category.name || category.id} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl
          fullWidth={false}
          id="recent-records-type-dropdown"
          sx={{ display: 'inline-block', verticalAlign: 'middle' }}
        >
          <InputLabel id="show-recent-type-label">Show</InputLabel>
          <Select
            id="show-recent-type"
            value={filterMode}
            onChange={(event) => setFilterMode(event.target.value as RecentRecordsFilterMode)}
            label="Record types">
            <MenuItem value="all">All records</MenuItem>
            <MenuItem value="category">Only selected category</MenuItem>
            <MenuItem value="team">Only selected team</MenuItem>
            <MenuItem value="participant">Only selected rider</MenuItem>
          </Select>
        </FormControl>
        <FormControl
          fullWidth={false}
          id="recent-records-time-zone-dropdown"
          sx={{ display: 'inline-block', verticalAlign: 'middle' }}
        >
          <InputLabel id="show-recent-times-in-label">Show times in</InputLabel>
          <Select
            id="show-recent-times-in"
            value={timeDisplayZoneMode}
            onChange={(event) => props.onTimeDisplayZoneModeChange?.(event.target.value as TimeDisplayZoneMode)}
            label="Show times in">
            <MenuItem value="event">Event time-zone</MenuItem>
            <MenuItem value="system">System time-zone</MenuItem>
            <MenuItem value="gmt">GMT</MenuItem>
          </Select>
        </FormControl>
        <FormControl
          fullWidth={false}
          id="recent-records-ignore-dropdown"
          sx={{ display: 'inline-block', minWidth: 180, verticalAlign: 'middle' }}
        >
          <InputLabel id="show-recent-ignore-label" shrink>Ignore</InputLabel>
          <Select
            displayEmpty
            multiple
            id="show-recent-ignore"
            label="Ignore"
            value={ignoreModes}
            sx={{ minWidth: 100 }}
            onChange={(event) => {
              const value = event.target.value;
              setIgnoreModes(typeof value === 'string' ? value.split(',') as RecentRecordsIgnoreMode[] : value as RecentRecordsIgnoreMode[]);
            }}
            renderValue={(selected) => selected.length > 0
              ? selected.map((mode) => ignoreModeLabels[mode as RecentRecordsIgnoreMode]).join(', ')
              : 'None'}>
            {(Object.keys(ignoreModeLabels) as RecentRecordsIgnoreMode[]).map((mode) => (
              <MenuItem key={mode} value={mode}>
                <Checkbox checked={ignoreModes.includes(mode)} />
                <ListItemText primary={ignoreModeLabels[mode]} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl
          fullWidth={false}
          id="recent-records-order-dropdown"
          sx={{ display: 'inline-block', verticalAlign: 'middle' }}
        >
          <InputLabel id="show-recent-order-label">Order</InputLabel>
          <Select
            id="show-recent-order"
            defaultValue="oldest"
            onChange={(e) => {
              if (e.target.value === 'recent') {
                setRecentFirst(true);
              } else {
                setRecentFirst(false);
              }
            }}
            label="Sort records">
            <MenuItem value="oldest">Oldest fist</MenuItem>
            <MenuItem value="recent">Recent first</MenuItem>
          </Select>
        </FormControl>
      </div>
    </div>
    { warnings?.length > 0 && <Warnings warnings={warnings} />}
    {
      !(sortedRecords.length > 0) ? <p>No records available.</p>
        : <Box sx={{ flexGrow: 1, width: '100%' }}>
          <TableContainer className="recent-records-table-container" component={Paper} style={tableContainerStyle}>
            <Table stickyHeader sx={{ minWidth: 650 }} size="small">
              <TableHead>
                <TableRow>
                  {headings.map((heading) => <TableCell key={heading}>{heading}</TableCell>)}
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedRecords.map((record, index) => (
                  <RecordRow
                    key={record.id}
                    lapTimeIndicators={lapTimeIndicators.get(record.id)}
                    record={record}
                    index={index}
                    raceStateLookup={props.raceStateLookup}
                    selectedRecordId={selectedRecordId}
                    selectedCategories={props.selectedCategories}
                    selectedPlateNumber={selectedPlateNumber}
                    selectedParticipants={highlightedParticipantIds}
                    sessionValidCategoryIds={props.sessionValidCategoryIds}
                    categorySelected={props.categorySelected}
                    participantSelected={handleParticipantSelected}
                    onAssignFlagCategory={props.onAssignFlagCategory}
                    onOpenAddRecordDialog={openAddRecordDialog}
                    onOpenEditRecordDialog={openEditRecordDialog}
                    onExclude={props.onExclude}
                    onChangeCategory={props.onChangeCategory}
                    onMarkFlagDeleted={props.onMarkFlagDeleted}
                    onRemoveFlagCategory={props.onRemoveFlagCategory}
                    onSelectRecord={setSelectedRecordId}
                    onSelectUnrecognisedPlateNumber={setSelectedPlateNumber}
                    sectorTimesByRecordId={sectorTimesByRecordId}
                    showSectorColumn={showSectorColumn}
                    timeZone={displayTimeZone}
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
    }
  </>;
};
