import { MenuItem } from "@mui/material";
import React from "react";
import {
  type DataSourceType,
  getDataSourceTypeLabel,
} from "../../app/systemConfig.js";
import { SelectTextField } from "../../controls/selectTextField.js";
import { AsyncButton } from "../asyncButton.js";

interface DataSourceTypesPanelProps {
  newSourceType: DataSourceType;
  onCreateSource: (type: DataSourceType) => void | Promise<void>;
  onChangeNewSourceType: (type: DataSourceType) => void;
}

const sourceTypeOptions: DataSourceType[] = [
  "timing-rfid-decoder",
  "timing-mylaps-decoder",
  "timing-dorian-data1-supernode",
  "file-rfid-timing-csv",
  "file-dorian-ctc-srt",
  "file-durt-filemaker",
  "file-mr-scats-data",
  "file-apical-data-file",
  "file-racesweet-ledger",
  "api-aws-sqs",
  "api-http-request",
  "api-apical-excel-file",
  "api-apical-recent-laps",
  "master-entrant-profiles",
];

export const DataSourceTypesPanel = (
  props: DataSourceTypesPanelProps,
): React.ReactElement => (
  <div className="events-actions">
    <SelectTextField
      label="Data Source Type"
      slotProps={{ select: { "aria-label": "New Data Source Type" } }}
      value={props.newSourceType}
      onChange={(event) =>
        props.onChangeNewSourceType(event.target.value as DataSourceType)
      }
    >
      {sourceTypeOptions.map((type) => (
        <MenuItem key={type} value={type}>
          {getDataSourceTypeLabel(type)}
        </MenuItem>
      ))}
    </SelectTextField>
    <select
      aria-label="New Data Source Type"
      hidden
      value={props.newSourceType}
      onChange={(event: React.ChangeEvent<HTMLSelectElement>): void =>
        props.onChangeNewSourceType(event.target.value as DataSourceType)
      }
    >
      {sourceTypeOptions.map((type: DataSourceType) => (
        <option key={type} value={type}>
          {getDataSourceTypeLabel(type)}
        </option>
      ))}
    </select>
    <AsyncButton
      loadingAriaLabel="Adding data source"
      onAsyncClick={() => props.onCreateSource(props.newSourceType)}
      type="button"
    >
      Add Data Source
    </AsyncButton>
  </div>
);
