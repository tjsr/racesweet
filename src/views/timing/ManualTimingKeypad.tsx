import React from 'react';
import { Box, Button } from '@mui/material';

export const ManualTimingKeypad = (props: {
  alphabetic: boolean;
  onChange: (value: string) => void;
  value: string;
}): React.ReactElement => <Box sx={{ display: 'grid', gap: 1,
  gridTemplateColumns: props.alphabetic ? 'repeat(6, 1fr)' : 'repeat(3, 1fr)' }}>
  {(props.alphabetic ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' : '1234567890').split('').map((key: string): React.ReactElement =>
    <Button key={key} onClick={(): void => props.onChange(props.value + key)} sx={{ minHeight: 48 }} variant="outlined">{key}</Button>)}
  <Button onClick={(): void => props.onChange(props.value.slice(0, -1))} sx={{ minHeight: 48 }}>Backspace</Button>
  <Button onClick={(): void => props.onChange('')} sx={{ minHeight: 48 }}>Clear identifier</Button>
</Box>;
