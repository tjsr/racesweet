import React, { type JSX, type ReactNode } from 'react';
import { TimeRecord } from '../../model';

interface RecordsProps {
  records: TimeRecord[];

}

interface RecentRecordRowProps {
  record: TimeRecord;
  index: number;
}

interface GreenFlagEventRowProps extends RecentRecordRowProps {

}

export const RecordRow = (props: RecentRecordRowProps) => {
  return (<>
    <div key={props.index}>
      <p>Time: {props.record.time?.toLocaleString()}</p>
      <p>Source: {props.record.source}</p>
      {/* <p>Details: {props.record.details}</p> */}
    </div>
  </>);
};

export const RecentRecords = (props: RecordsProps) => {
  return <>
    <h2>Recent Records</h2>
    {
      props.records.map((record, index) => <RecordRow record={record} index={index} />)
    }
  </>;
};

export const GreenFlagPassingRow = (props: GreenFlagEventRowProps) => {
  return;
};

