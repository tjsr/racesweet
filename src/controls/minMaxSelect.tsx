import { Box, type SxProps, type Theme } from '@mui/material';
import React from 'react';
import { SelectTextField } from './selectTextField.js';

export interface MinMaxSelectOption {
  label: string;
  value: string;
}

export interface MinMaxSelectProps {
  disabled?: boolean;
  maxAriaLabel: string;
  maxEmptyLabel: string;
  maxLabel: string;
  maxValue: string;
  minAriaLabel: string;
  minEmptyLabel: string;
  minLabel: string;
  minValue: string;
  onMaxChange: (value: string) => void;
  onMinChange: (value: string) => void;
  options: readonly MinMaxSelectOption[];
  sx?: SxProps<Theme>;
}

export const MinMaxSelect = (props: MinMaxSelectProps): React.ReactElement => <Box sx={[
  { display: 'grid', gap: 2, gridTemplateColumns: { sm: 'repeat(2, minmax(0, 1fr))', xs: 'minmax(0, 1fr)' } },
  ...(Array.isArray(props.sx) ? props.sx : [props.sx]),
]}>
  <SelectTextField
    disabled={props.disabled}
    fullWidth
    label={props.minLabel}
    slotProps={{ select: { 'aria-label': props.minAriaLabel, native: true } }}
    value={props.minValue}
    onChange={(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => props.onMinChange(event.target.value)}
  >
    <option value="">{props.minEmptyLabel}</option>
    {props.options.map((option: MinMaxSelectOption): React.ReactElement =>
      <option key={option.value} value={option.value}>{option.label}</option>)}
  </SelectTextField>
  <SelectTextField
    disabled={props.disabled}
    fullWidth
    label={props.maxLabel}
    slotProps={{ select: { 'aria-label': props.maxAriaLabel, native: true } }}
    value={props.maxValue}
    onChange={(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => props.onMaxChange(event.target.value)}
  >
    <option value="">{props.maxEmptyLabel}</option>
    {props.options.map((option: MinMaxSelectOption): React.ReactElement =>
      <option key={option.value} value={option.value}>{option.label}</option>)}
  </SelectTextField>
</Box>;
