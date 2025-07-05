import React, { type JSX, type ReactNode } from 'react';
import { ChipCrossingData, EventParticipant, EventParticipantId, TimeRecord } from '../../model';
import { FlagRecord, GreenFlagRecord } from '../../model/flag';
import { EventCategory, EventCategoryId } from '../../model/eventcategory';
import { isFlagRecord, isGreenFlag } from '../../controllers/flag';
import { Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { MillisecondsDuration, millisecondsToTime, tableTimeString } from '../../app/utils/timeutils.ts';
import { categoriesTextFromLookupFn, categoryTextString, getElapsedTimeForCategory, setCategoryStartForPassings } from '../../controllers/category.ts';
import "./recent.css"
import { getTimeRecordIdentifier, isCrossingRecord } from '../../controllers/timerecord.ts';
import { ParticipantPassingRecord } from '../../model/timerecord.ts';
import { InvalidCategoryIdError, NoCrossingError, NoParticipantError, ParticipantNotFoundError } from '../../validators/errors.ts';
import { RaceStateLookup } from '../../model/racestate.ts';
import { getParticipantNumber } from '../../controllers/participant.ts';
import { getLapTimeCell } from '../../controllers/laps.ts';

interface RecordsProps {
  records: TimeRecord[];
  raceStateLookup: RaceStateLookup;
  warnings?: string[];
}

interface RecentRecordRowProps<RecordType extends TimeRecord = TimeRecord> {
  record: RecordType;
  index: number;
  raceStateLookup: RaceStateLookup;
}

interface FlagRecordRowProps<FlagType extends FlagRecord> extends RecentRecordRowProps<FlagType> {
  categoryList?: EventCategory[];
}

interface GreenFlagEventRowProps extends FlagRecordRowProps<GreenFlagRecord> {
}

export const FlagRecordRow = (props: FlagRecordRowProps<FlagRecord>) => {
  const record: FlagRecord = props.record;
  // if (!isGreenFlag(record)) {
  //   const greenFlag: GreenFlagRecord = props.record as GreenFlagRecord;
  //   return <GreenFlagRow record={greenFlag} index={props.index} />;
  // }
    
  if (!isFlagRecord(record)) {
    throw new Error('FlagRecord component used with non-flag record');
  }
  let flagClass = 'flag green';
  let flagText = 'Green flag'
  
  const categoryList: EventCategory[] = props.categoryList || [];
  const categoryLookup = props.raceStateLookup.getCategoryById.bind(props.raceStateLookup);

  return (<>
    <TableRow className={flagClass} key={props.index}>
      <TableCell>{record.sequence}</TableCell>
      <TableCell>{flagText}</TableCell>
      <TableCell colSpan={3}>{tableTimeString(record.time)}</TableCell>
      <TableCell colSpan={5}>{categoriesTextFromLookupFn(record.categoryIds || [], categoryLookup)}</TableCell>
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
}

export const PassingRecordRow = (
  props: PassingRecordRowProps
): JSX.Element => {
  const passing: ParticipantPassingRecord = props.passing;
  
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

          if (entrant?.categoryId) {
      const cat = rs.getCategoryById(entrant?.categoryId);
      if (cat) {
        elapsedTime = getElapsedTimeForCategory(cat, passing.time!) || elapsedTime || '00:00:00.000';
        if (cat.name) {
          categoryStr = cat?.name;
        }
      }
    }
};


export const RecordRow = (props: RecentRecordRowProps) => {
  const record = props.record;
  if (isFlagRecord(record)) {
    return <FlagRecordRow
      record={record}
      index={props.index}
      raceStateLookup={props.raceStateLookup}
    />;
  }

  const rs = props.raceStateLookup;
  
  let ant = '';
  let passing: ParticipantPassingRecord;
  if (isCrossingRecord(record)) {
    return <PassingRecordRow passing={record as ParticipantPassingRecord} />;
    passing = record as ParticipantPassingRecord;



    }
    if (!plateNumber) {
      return <UnknownChipRow
        sequenceNumber={passing.sequence}
        timeRecordId={passing.id}
        ant='0'
        passingTime={passing.time!}
        txNo={0}
        identifier=''
        rs={props.raceStateLookup} />;
      //(passing, rs, identifier, ant, timeString);
    }
    const plateNumberString: string = plateNumber?.toString() || '';
  
    if (!entrantName) {
      entrantName = '';
    }

  }


  
  let categoryName = 'No category';

  const timeString = tableTimeString(record.time);


  return (<>
    <TableRow key={record.id} data-record-id={record.id}>
      <TableCell>{record.sequence}</TableCell>
      <TableCell>Ant</TableCell>
      <TableCell>Tx</TableCell>
      <TableCell>{timeString}</TableCell>
      <TableCell>No</TableCell>
      <TableCell>Entrant</TableCell>
      <TableCell>{categoryStr || ''}</TableCell>
      <TableCell>Category</TableCell>
      <TableCell>Lap#</TableCell>
      <TableCell>Elapsed</TableCell>
      <TableCell>Lap time</TableCell>
    </TableRow>
  </>);
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

export const RecentRecords = (props: RecordsProps) => {
  const gridColumns: GridColDef<(typeof props.records)[number]>[] = [
    { field: 'time', headerName: 'Time', width: 180, valueFormatter: (params) => formatGridTime(params) },
    { field: 'source', headerName: 'Source', width: 150 },
    { field: 'sequence', headerName: 'Details', flex: 1 },
    { field: 'flagType', headerName: 'Flag Type', width: 150 },
    { field: 'category', headerName: 'Category', width: 150 },
  ];

  return <>
    <h2>Recent Records</h2>
    { warnings?.length > 0 && <Warnings warnings={warnings} />}
    {
      !(props.records?.length > 0) ? <p>No records available.</p> :
        <Box sx={{ flexGrow: 1, width: '100%' }}>
          <TableContainer component={Paper}>
            <Table component={Paper} stickyHeader sx={{ minWidth: 650 }} size="small">
              <TableHead>
                <TableCell>Seq</TableCell>
                <TableCell>Antenna</TableCell>
                <TableCell>TxNo</TableCell>
                <TableCell>Time</TableCell>
                <TableCell>Number</TableCell>
                <TableCell>Entrant</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Lap#</TableCell>
                <TableCell>Elapsed Time</TableCell>
                <TableCell>Lap Time</TableCell>
              </TableHead>
              <TableBody>
                {props.records.map((record, index) => (
                  <RecordRow
                    key={record.id}
                    record={record}
                    index={index}
                    raceStateLookup={props.raceStateLookup}
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
    }
  </>;
};
