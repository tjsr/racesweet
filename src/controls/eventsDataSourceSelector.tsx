import { Checkbox, FormControl, InputLabel, ListItemText, MenuItem, OutlinedInput, Select, type SelectChangeEvent } from '@mui/material';
import React from 'react';

export interface EventDataSourceOption {
  id: string;
  label: string;
}

export interface EventsDataSourceSelectorProps {
  ariaLabel: string;
  disabled?: boolean;
  label: string;
  onChange: (sourceIds: string[]) => void;
  options: readonly EventDataSourceOption[];
  sourceIds: string[];
}

export const EventsDataSourceSelector = (props: EventsDataSourceSelectorProps): React.ReactElement => {
  const labelId: string = React.useId();
  const updateSourceIds = (event: SelectChangeEvent<string[]>): void => {
    const value: string | string[] = event.target.value;
    props.onChange(typeof value === 'string' ? value.split(',') : value);
  };
  const selectedSourceLabels: string = props.options
    .filter((option: EventDataSourceOption): boolean => props.sourceIds.includes(option.id))
    .map((option: EventDataSourceOption): string => option.label)
    .join(', ');

  return <FormControl disabled={props.disabled} fullWidth>
    <InputLabel id={labelId}>{props.label}</InputLabel>
    <Select
      aria-label={props.ariaLabel}
      displayEmpty
      input={<OutlinedInput label={props.label} />}
      labelId={labelId}
      multiple
      onChange={updateSourceIds}
      renderValue={(): string => selectedSourceLabels || 'No data sources selected'}
      value={props.sourceIds}
    >
      {props.options.map((option: EventDataSourceOption): React.ReactElement => <MenuItem key={option.id} value={option.id}>
        <Checkbox checked={props.sourceIds.includes(option.id)} />
        <ListItemText primary={option.label} />
      </MenuItem>)}
    </Select>
  </FormControl>;
};
