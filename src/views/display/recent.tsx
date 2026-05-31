import React, { type JSX, type ReactNode } from 'react';
import { EventParticipant, EventParticipantId, EventTimeRecord } from '../../model';
import { FlagRecord } from '../../model/flag';
import { EventCategory, EventCategoryId } from '../../model/eventcategory';
import { isFlagRecord } from '../../controllers/flag';
import { Box, createTheme, FormControl, InputLabel, Menu, MenuItem, Paper, Select, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { MillisecondsDuration, millisecondsToTime, tableTimeString } from '../../app/utils/timeutils.ts';
import { categoriesTextFromLookupFn, getElapsedTimeForCategory } from '../../controllers/category.ts';
import "./recent.css"
import { getAutomaticIdentifier, getTimeRecordIdentifier, isCrossingRecord } from '../../controllers/timerecord.ts';
import { ParticipantPassingRecord } from '../../model/timerecord.ts';
import { InvalidCategoryIdError, NoCrossingError, NoParticipantError, ParticipantNotFoundError } from '../../validators/errors.ts';
import { RaceStateLookup } from '../../model/racestate.ts';
import { getParticipantNumber } from '../../controllers/participant.ts';
import { getLapTimeCell } from '../../controllers/laps.ts';

interface RecordsProps {
  records: EventTimeRecord[];
  raceStateLookup: RaceStateLookup;
  warnings?: string[];
  selectedCategories: Set<EventCategoryId>;
  selectedParticipants: Set<EventParticipantId>;
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
      <TableCell colSpan={1}>{tableTimeString(record.time)}</TableCell>
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
}

const categoryStringFromParticipant = (
  participant: EventParticipant,
  categoryLookup: (id: EventCategoryId) => EventCategory | undefined
): string => {
  if (!participant.categoryId) {
    return 'No category';
  }
  return categoryStringFromId(participant.categoryId, categoryLookup);
}

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

const categoriesFromCrossing = (
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

interface CompletedLapProps {
  elapsedTime: MillisecondsDuration;
}

const UnknownChipRow = (
  { timeRecordId, sequenceNumber, txNo, passingTime, rs, identifier, ant }: {
    ant: string
    txNo: number,
    sequenceNumber: number
    passingTime: Date,
    timeRecordId: string,
    rs: RaceStateLookup,
    identifier: string,
  }
): JSX.Element => {
  const txCount = rs.countTransponderCrossings(txNo, passingTime);
  const content = `Unknown transponder ${identifier} (${txCount})`;
  const timeString = tableTimeString(passingTime);

  return (
  <TableRow key={timeRecordId} data-record-id={timeRecordId}>
    <TableCell>{sequenceNumber}</TableCell>
    <TableCell>Ant</TableCell>
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
  const timeString = tableTimeString(passing.time);
  const identifier: string = getTimeRecordIdentifier(passing, true);
  const entrant = passing.participantId ? rs.getParticipantById(passing.participantId) : undefined;
  let plateNumber: string | number | undefined = undefined;
  let entrantName: string | undefined = undefined;
  let lapNo: string = '';
  let elapsedTime = '--:--:--.---';
  let lapTime = '';

  if (passing.participantId) {
    let participant = props.raceStateLookup.getParticipantById(passing.participantId);
    const categoryLookup = props.raceStateLookup.getCategoryById.bind(props.raceStateLookup);
    categoryStr = participant ? categoryStringFromParticipant(participant, categoryLookup) : undefined;
  }

  let className = passing.isValid ? 'passing' : 'invalid-passing';
  let cellClasses = '';

  if (entrant) {
    plateNumber = getParticipantNumber(entrant);
    entrantName = `${entrant.firstname} ${entrant.surname}`;
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
        className += ' selected-category';
      }
    }
  }

  let categoryName = 'No category';

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
        onClick={(event: React.MouseEvent<HTMLTableRowElement, MouseEvent>) => {
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
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        <MenuItem onClick={handleExclude}>
          {passing.isExcluded ? 'Include crossing' : 'Exclude crossing'}
        </MenuItem>
        
        {passing.participantId && allCategories.length > 0 && [
          <MenuItem key="cat-header" disabled sx={{ opacity: '1 !important', fontWeight: 'bold' }}>
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
  }
  const record = props.record;
  if (isFlagRecord(record)) {
    return <FlagRecordRow
      record={record}
      index={props.index}
      raceStateLookup={props.raceStateLookup}
      selectedCategories={props.selectedCategories}
      onSelect={flagRecordSelected}
    />;
  }

  const rs = props.raceStateLookup;
  
  let ant = '';
  let passing: ParticipantPassingRecord;
  if (isCrossingRecord(record)) {
    passing = record as ParticipantPassingRecord;

    const passingRecordSelected = (passingRecord: ParticipantPassingRecord): void => {
      if (!passingRecord.participantId) {
        return;
      }

      const selectionParticipant: EventParticipant|undefined = props.raceStateLookup.getParticipantById(passingRecord.participantId);
      if (props.participantSelected !== undefined && selectionParticipant) {
        const selectedEntrants: Set<EventParticipantId> = new Set<EventParticipantId>();
        selectedEntrants.add(selectionParticipant.id);
        props.participantSelected(selectedEntrants);
      }

      if (props.categorySelected && selectionParticipant?.categoryId) {
        const categorySet = new Set<EventCategoryId>()
        categorySet.add(selectionParticipant.categoryId);
        props.categorySelected(categorySet);
      }
    }

    return <PassingRecordRow
      raceStateLookup={props.raceStateLookup}
      passing={passing}
      selectedCategories={props.selectedCategories}
      selectedParticipants={props.selectedParticipants}
      onSelect={passingRecordSelected}
      onExclude={props.onExclude}
      onChangeCategory={props.onChangeCategory}
    />;
  }

  const identifier = getTimeRecordIdentifier(record, true);
  const txNo = getAutomaticIdentifier(record);
  // if (!plateNumber) {
    return <UnknownChipRow
      sequenceNumber={record.sequence}
      timeRecordId={record.id}
      ant='?'
      passingTime={record.time!}
      txNo={0}
      identifier={identifier}
      rs={props.raceStateLookup}
   />
    //(passing, rs, identifier, ant, timeString);
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

const formatGridTime = (params: { value: Date | string }) => {
  if (typeof params.value === 'string') {
    return params.value;
  }
  if (params.value instanceof Date) {
    return params.value.toLocaleString();
  }
  return '';
}

export const Warnings = ({ warnings }: { warnings: string[] }): JSX.Element => {
  if (!warnings || warnings.length === 0) {
    return <></>;
  }
  return (
    <Box sx={{ backgroundColor: 'yellow', padding: 2, marginBottom: 2 }}>
      <h3>Warnings</h3>
      <ul>
        {warnings.map((warning, index) => (
          <li key={index}>{warning}</li>
        ))}
      </ul>
    </Box>
  );
}

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

// const RecordTable = (props: RecordTableProps) => {

// };

export const RecentRecords = (props: RecordsProps & { 
  onExclude?: (crossingId: string, exclude: boolean) => void,
  onChangeCategory?: (participantId: string, categoryId: EventCategoryId) => void
}) => {
  const [recentFirst, setRecentFirst] = React.useState<boolean>(false);
  const sortedRecords = (props.records || []).sort((a, b) => {
    if (recentFirst) {
      return b.time!.getTime() - a.time!.getTime();
    } else {
      return a.time!.getTime() - b.time!.getTime();
    }
  });

  return <>
    <h2 className="recent-records">Recent Records</h2>
    <FormControl
      fullWidth={false}
      id="recent-records-type-dropdown"
      sx={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: 2 }}
    >
      <InputLabel id="show-recent-type-label">Show</InputLabel>
      <Select
        id="show-recent-type"
        defaultValue="all"
        onChange={() => undefined}
        label="Record types">
        <MenuItem value="all">All records</MenuItem>
        <MenuItem value="category">Only selected category</MenuItem>
        <MenuItem value="team">Only selected team</MenuItem>
        <MenuItem value="participant">Only selected participant</MenuItem>
        </Select>
    </FormControl>
    <FormControl
      fullWidth={false}
      id="recent-records-order-dropdown"
      sx={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: 2 }}
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
    { warnings?.length > 0 && <Warnings warnings={warnings} />}
    {
      !(sortedRecords.length > 0) ? <p>No records available.</p> :
        <Box sx={{ flexGrow: 1, width: '100%' }}>
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
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
    }
  </>;
};
