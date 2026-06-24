import { Box, Checkbox, FormControl, InputLabel, ListItemText, Menu, MenuItem, Paper, Select, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import React, { type JSX } from 'react';
import { type MillisecondsDuration, type TimeDisplayZoneMode, millisecondsToTime, resolveDisplayTimeZone, tableTimeString } from '../../app/utils/timeutils.ts';
import { categoriesTextFromLookupFn, getElapsedTimeForCategory, shouldExcludeCategoryFromResults } from '../../controllers/category.ts';
import { isFlagRecord } from '../../controllers/flag';
import { getLapTimeCell } from '../../controllers/laps.ts';
import { getParticipantNumber } from '../../controllers/participant.ts';
import { getAutomaticIdentifier, getTimeRecordIdentifier, isCrossingRecord } from '../../controllers/timerecord.ts';
import { EventParticipant, EventParticipantId, EventTimeRecord } from '../../model';
import { EventCategory, EventCategoryId } from '../../model/eventcategory';
import { EventTeam } from '../../model/eventteam.ts';
import { FlagRecord } from '../../model/flag';
import { RaceStateLookup } from '../../model/racestate.ts';
import { EVENT_SESSION_END, ParticipantPassingRecord } from '../../model/timerecord.ts';
import { InvalidCategoryIdError, NoCrossingError, NoParticipantError, ParticipantNotFoundError } from '../../validators/errors.ts';
import "./recent.css";

type RecentRecordsFilterMode = 'all' | 'category' | 'participant' | 'team';
type RecentRecordsIgnoreMode = 'outsideEventWindow' | 'unrecognised';

const ignoreModeLabels: Record<RecentRecordsIgnoreMode, string> = {
  outsideEventWindow: 'Outside event window',
  unrecognised: 'Unrecognised',
};

interface RecordsProps {
  eventTimeZone?: string;
  onTimeDisplayZoneModeChange?: (mode: TimeDisplayZoneMode) => void;
  records: EventTimeRecord[];
  raceStateLookup: RaceStateLookup;
  warnings?: string[];
  selectedCategories: Set<EventCategoryId>;
  selectedParticipants: Set<EventParticipantId>;
  timeDisplayZoneMode?: TimeDisplayZoneMode;
  categorySelected?: ((ids: Set<EventCategoryId>) => void) | undefined;
  participantSelected?: ((participantId: Set<EventParticipantId>) => void) | undefined;
}

interface RecentRecordRowProps<RecordType extends EventTimeRecord = EventTimeRecord> {
  record: RecordType;
  index: number;
  raceStateLookup: RaceStateLookup;
  selectedCategories?: Set<EventCategoryId>;
  selectedParticipants?: Set<EventParticipantId>;
  categorySelected?: ((ids: Set<EventCategoryId>) => void) | undefined;
  participantSelected?: ((participantId: Set<EventParticipantId>) => void) | undefined;
  onExclude?: (crossingId: string, exclude: boolean) => void;
  onChangeCategory?: (participantId: string, categoryId: EventCategoryId) => void;
  timeZone?: string;
}

interface FlagRecordRowProps<FlagType extends FlagRecord> extends RecentRecordRowProps<FlagType> {
  categoryList?: EventCategory[];
  onSelect: (record: FlagType) => void;
}

export const FlagRecordRow = (props: FlagRecordRowProps<FlagRecord>) => {
  const record: FlagRecord = props.record;

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

  const categoryLookup = props.raceStateLookup.getCategoryById.bind(props.raceStateLookup);
  const categoryText = categoriesTextFromLookupFn(record.categoryIds || [], categoryLookup);
  const elapsedTime = '--:--:--.---';

  return (<>
    <TableRow
      className={flagClass}
      data-record-id={record.id}
      key={record.id || props.index}
      onClick={() => {
        if (props.onSelect) {
          props.onSelect(record);
        }
      }}>
      <TableCell colSpan={3}>{record.sequence}{flagText}</TableCell>
      <TableCell colSpan={1}>{tableTimeString(record.time, props.timeZone)}</TableCell>
      <TableCell colSpan={4}>{categoryText}</TableCell>
      <TableCell colSpan={2}>{elapsedTime}</TableCell>
    </TableRow>
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
    throw new NoParticipantError(``);
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
  { timeRecordId, sequenceNumber, txNo, passingTime, rs, identifier, antennae, timeZone }: {
    antennae: string
    txNo: number | undefined,
    sequenceNumber: number
    passingTime: Date,
    timeRecordId: string,
    rs: RaceStateLookup,
    identifier: string,
    timeZone?: string,
  }
): JSX.Element => {
  const txCount = txNo !== undefined ? rs.countTransponderCrossings(txNo, passingTime) : undefined;
  const content = `Unknown transponder ${identifier} (${txCount})`;
  const timeString = tableTimeString(passingTime, timeZone);

  return (
    <TableRow key={timeRecordId} data-record-id={timeRecordId}>
      <TableCell>{sequenceNumber}</TableCell>
      <TableCell>{antennae}</TableCell>
      <TableCell>{txNo}</TableCell>
      <TableCell>{timeString}</TableCell>
      <TableCell>{identifier}</TableCell>
      <TableCell colSpan={6}>{content}</TableCell>
    </TableRow>
  );
};

interface PassingRecordRowProps {
  passing: ParticipantPassingRecord;
  raceStateLookup: RaceStateLookup;
  selectedCategories: Set<EventCategoryId> | undefined;
  selectedParticipants: Set<EventParticipantId> | undefined;
  onSelect?: (passingRecord: ParticipantPassingRecord) => void;
  onExclude?: (crossingId: string, exclude: boolean) => void;
  onChangeCategory?: (participantId: string, categoryId: EventCategoryId) => void;
  timeZone?: string;
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

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    
    if (props.onSelect && passing) {
      props.onSelect(passing);
    }

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

  let categoryStr = undefined;
  const timeString = tableTimeString(passing.time, props.timeZone);
  const identifier: string = getTimeRecordIdentifier(passing, true);
  const entrant = passing.participantId ? rs.getParticipantById(passing.participantId) : undefined;
  let plateNumber: string | number | undefined = undefined;
  let entrantName: string | undefined = undefined;
  let lapNo: string = '';
  let elapsedTime = '--:--:--.---';
  let lapTime = '';

  if (passing.participantId) {
    const participant = props.raceStateLookup.getParticipantById(passing.participantId);
    const categoryLookup = props.raceStateLookup.getCategoryById.bind(props.raceStateLookup);
    categoryStr = participant ? categoryStringFromParticipant(participant, categoryLookup) : undefined;
  }

  let className = passing.isValid ? 'passing' : 'invalid-passing';
  let cellClasses = '';

  if (entrant) {
    plateNumber = getParticipantNumber(entrant);
    entrantName = getPassingEntrantName(entrant, rs);
    const entrantLaps: ParticipantPassingRecord[] | undefined |null = rs.getParticipantLaps(entrant.id);
    if (entrantLaps) {
      // const lap = entrantLaps.find((l) => l.timeRecordId === evt.id);
      lapNo = passing.isValid ? passing?.lapNo?.toString() || '' : '';
      elapsedTime = passing?.elapsedTime ? millisecondsToTime(passing.elapsedTime) : '--:--:--.---';
      lapTime = getLapTimeCell(passing);
    }

    if (props.selectedParticipants?.has(entrant.id)) {
      className += ' selected-participant';
      cellClasses = 'selected-participant';
    }

    if (entrant?.categoryId) {
      const cat = rs.getCategoryById(entrant?.categoryId);
      if (cat) {
        elapsedTime = getElapsedTimeForCategory(cat, passing.time!) || elapsedTime || '00:00:00.000';
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
  }

  if (passing.isExcluded) {
    className += ' excluded';
  }

  const allCategories = (rs as unknown as { categories: EventCategory[] }).categories || [];

  return (
    <>
      <TableRow
        key={passing.id}
        data-record-id={passing.id}
        className={className}
        onContextMenu={handleContextMenu}
        style={{ cursor: 'context-menu' }}
        onClick={(_event: React.MouseEvent<HTMLTableRowElement, MouseEvent>) => {
          if (props.onSelect) {
            props.onSelect(passing);
          }
        }}>
        <TableCell className={cellClasses}>{passing.sequence}</TableCell>
        <TableCell className={cellClasses}></TableCell>
        <TableCell className={cellClasses}>{identifier}</TableCell>
        <TableCell className={cellClasses}>{timeString}</TableCell>
        <TableCell className={cellClasses}>{plateNumber || '?'}</TableCell>
        <TableCell className={cellClasses}>{entrantName}</TableCell>
        <TableCell className={cellClasses}>{categoryStr || ''}</TableCell>
        <TableCell className={cellClasses}>{lapNo}</TableCell>
        <TableCell className={cellClasses}>{elapsedTime}</TableCell>
        <TableCell className={cellClasses}>{lapTime}</TableCell>
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
      onSelect={flagRecordSelected}
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
        if (props.participantSelected !== undefined) {
          props.participantSelected(new Set<EventParticipantId>());
        }
        if (props.categorySelected) {
          props.categorySelected(new Set<EventCategoryId>());
        }
        return;
      }

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
      raceStateLookup={props.raceStateLookup}
      passing={passing}
      selectedCategories={props.selectedCategories}
      selectedParticipants={props.selectedParticipants}
      onSelect={passingRecordSelected}
      onExclude={props.onExclude}
      onChangeCategory={props.onChangeCategory}
      timeZone={props.timeZone}
    />;
  }

  const identifier = getTimeRecordIdentifier(record, true);
  const txNo = getAutomaticIdentifier(record);
  // if (!plateNumber) {
  return <UnknownChipRow
    sequenceNumber={record.sequence}
    timeRecordId={record.id}
    antennae='?'
    passingTime={record.time!}
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

const headings: string[] = [
  "Seq",
  "Antenna",
  "TxNo",
  "Time",
  "Number",
  "Entrant",
  "Category",
  "Lap#",
  "Elapsed Time",
  "Lap Time"
];

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
  return ignoreModes.includes('unrecognised') && isUnrecognisedCrossing(record, raceStateLookup);
};

// const RecordTable = (props: RecordTableProps) => {

// };

export const RecentRecords = (props: RecordsProps & { 
  onExclude?: (crossingId: string, exclude: boolean) => void,
  onChangeCategory?: (participantId: string, categoryId: EventCategoryId) => void
}) => {
  const [recentFirst, setRecentFirst] = React.useState<boolean>(false);
  const [filterMode, setFilterMode] = React.useState<RecentRecordsFilterMode>('all');
  const [ignoreModes, setIgnoreModes] = React.useState<RecentRecordsIgnoreMode[]>([]);
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
  const selectedParticipants = props.selectedParticipants || new Set<EventParticipantId>();
  const teamMemberIds = selectedTeamMemberIds(props.raceStateLookup, selectedParticipants);
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

  return <>
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
          <TableContainer component={Paper}>
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
                    record={record}
                    index={index}
                    raceStateLookup={props.raceStateLookup}
                    selectedCategories={props.selectedCategories}
                    selectedParticipants={props.selectedParticipants}
                    categorySelected={props.categorySelected}
                    participantSelected={props.participantSelected}
                    onExclude={props.onExclude}
                    onChangeCategory={props.onChangeCategory}
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
