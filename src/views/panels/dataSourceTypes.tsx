import React from 'react';
import { type DataSourceType, getDataSourceTypeLabel } from '../../app/systemConfig.js';

interface DataSourceTypesPanelProps {
  newSourceType: DataSourceType;
  onCreateSource: (type: DataSourceType) => void | Promise<void>;
  onChangeNewSourceType: (type: DataSourceType) => void;
}

const sourceTypeOptions: DataSourceType[] = [
  'timing-rfid-decoder',
  'timing-mylaps-decoder',
  'timing-dorian-data1-supernode',
  'file-rfid-timing-csv',
  'file-mr-scats-data',
  'file-apical-data-file',
  'file-racesweet-ledger',
  'api-aws-sqs',
  'api-http-request',
  'api-apical-excel-file',
  'master-entrant-profiles',
];

export const DataSourceTypesPanel = (props: DataSourceTypesPanelProps): React.ReactElement => (
  <div className="events-actions">
    <label>
      Data Source Type
      <select
        aria-label="New Data Source Type"
        value={props.newSourceType}
        onChange={(event) => props.onChangeNewSourceType(event.target.value as DataSourceType)}
      >
        {sourceTypeOptions.map((type) => (
          <option key={type} value={type}>
            {getDataSourceTypeLabel(type)}
          </option>
        ))}
      </select>
    </label>
    <button type="button" onClick={() => props.onCreateSource(props.newSourceType)}>
      Add Data Source
    </button>
  </div>
);
